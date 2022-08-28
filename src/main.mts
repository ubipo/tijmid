import { Database, Database as TDatabase } from "better-sqlite3";
import { Option, program } from "commander";
import cookieParser from "cookie-parser";
import { randomBytes } from "crypto";
import endentImp from "endent";
import express, { ErrorRequestHandler, Express } from "express";
import rateLimit from 'express-rate-limit';
import { readFileSync, rmSync, writeFileSync } from "fs";
import helmet from "helmet";
import path from 'path';
import { fileURLToPath } from 'url';

import { createDb } from "./db/create.mjs";
import { crudInsert } from "./db/crud.mjs";
import * as dbUser from "./db/lastAdmin.mjs";
import * as dbSecret from "./db/secret.mjs";
import { userCrudConfig } from "./model.mjs";
import { createOidcProvider } from "./oidc.mjs";
import { createRouter } from "./routes.mjs";
import { generateJwtSecret } from "./util/jwt.mjs";
import parseIntOrFail from "./util/parseIntOrFail.mjs";
import { hashPassword } from "./util/password.mjs";
import { ReqError } from "./util/ReqError.mjs";
import { generateUuid } from "./util/uuidUtil.mjs";
import * as pages from "./view/pages.mjs";


const endent = (endentImp as any).default
const PUBLIC_BASE_URL = "https://id.pfiers.net"

async function createLastAdminIfNecessary(db: Database) {
  const adminCount = dbUser.adminCount(db)
  if (adminCount == 0) {
    const password = randomBytes(20).toString('base64url')
    console.warn(`No administrator accounts`)
    crudInsert(userCrudConfig, db, {
      uuid: generateUuid(),
      username: 'admin',
      passwordHash: await hashPassword(password),
      isAdmin: true
    })
    console.info(`Created default account. \nusername: admin | password: ${password}`)
  }
}

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err instanceof ReqError) {
    res.status(err.code)
    return res.send(pages.error(err.title, err.code, err.message))
  }

  if (err != null) {
    console.error(`Unknown error occured while handling ${req.url}`)
    console.error(err)
    const errMsg = "Internal Server Error"
    res.status(500)
    return res.send(pages.error(errMsg, 500, errMsg))
  }

  next()
}

async function createApp(db: TDatabase, trustProxy?: boolean | string) {
  const jwtSecret = await dbSecret.getOrElseSet(
    db, 'Login Session JWT Secret', async () => generateJwtSecret(), s => s, s => s
  )
  const {
    provider: oidcProvider, config: oidcConfig
  } = await createOidcProvider(db, PUBLIC_BASE_URL, jwtSecret)
  const router = await createRouter(db, oidcProvider, oidcConfig, jwtSecret)
  oidcProvider.proxy = true
  const mainExecDir = path.dirname(fileURLToPath(import.meta.url))
  const staticFilesDir = path.join(mainExecDir, 'static')

  const app = express().use(
    helmet(),
    express.static(staticFilesDir),
    cookieParser(),
    rateLimit({
      windowMs: 15 * 60 * 1000, // 5 minutes
      max: 60,
      handler: (req, _res, _next, _options) => {
        req.socket.destroy()
      }
    }),
    router,
    errorHandler,
    oidcProvider.callback(),
  )
  app.set('trust proxy', trustProxy)
  return app
}

program
  .addOption(
    new Option('--listen-socket <path>', 'Path to socket to listen on')
    .conflicts('listenPort')
  )
  .addOption(
    new Option('--listen-port <port>', 'TCP port number to listen on')
    .argParser(parseIntOrFail)
    .conflicts('listenSocket')
    .default(8000)
  )
  .option('--trust-proxy', endent`
    Wether to trust the X-Forwarded-For header: "true"
    or a list of IP addresses as per
    https://expressjs.com/en/guide/behind-proxies.html
  `, false)
  .option('--db <path>', 'Path to database file', 'db.sqlite')
  .option('--pid-file <path>', 'Path to PID file')

program.parse()
const opts = program.opts()

if (opts.pidFile != null) {
  const oldPidString = (() => {try {
    return readFileSync(opts.pidFile, 'utf-8')
  } catch (error) {
    if ((error as any).code == 'ENOENT') {
      return null
    }
    throw error
  }})()
  if (oldPidString != null) {
    const oldPid = Number.parseInt(oldPidString, 10)
    const oldIsRunning = (() => {try {
      process.kill(oldPid, 0)
      return true
    } catch(e) {
      if ((e as any).code === 'ESRCH') {
        return false
      }
      throw e
    }})()
    if (oldIsRunning) {
      console.warn(`Old process is still running (pid: ${oldPid}). Attempting to kill...`)
      process.kill(oldPid)
    }
  }
  writeFileSync(opts.pidFile, process.pid.toString())
}

function listenOn(app: Express, socketFileOrPort: string | number) {
  if (typeof socketFileOrPort === 'string') {
    const socketFile = socketFileOrPort
    try {
      rmSync(socketFile as string)
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error
      }
    }
    process.umask(0o117)
    app.listen(socketFile, () => {
      console.log(`Listening on socket ${socketFile}`)
    });
    return
  }
  const port = socketFileOrPort
  app.listen(port, () => { console.log(`Listening on TCP port ${port}`)});
}

const db = await createDb(opts.db)
createLastAdminIfNecessary(db)
const app = await createApp(db, opts.trustProxy)
listenOn(app, opts.listenSocket ?? opts.listenPort)
