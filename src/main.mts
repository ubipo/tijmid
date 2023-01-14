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
import { userCrudConfig } from "./model.mjs";
import { createOidcProvider } from "./oidc.mjs";
import { createRouter } from "./routes.mjs";
import { DEFAULT_MINIMUM_REFRESH_INTERVAL_S, Ip2asn } from "./util/ip2asn.js";
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

async function createApp(
  db: TDatabase,
  cacheDir: string,
  trustProxy?: boolean | string
) {
  const mainExecDir = path.dirname(fileURLToPath(import.meta.url))
  const staticFilesDir = path.join(mainExecDir, 'static')

  const {
    provider: oidcProvider, config: oidcConfig
  } = await createOidcProvider(db, PUBLIC_BASE_URL)
  const ip2asn = new Ip2asn(
    DEFAULT_MINIMUM_REFRESH_INTERVAL_S,
    path.join(cacheDir, 'ip2asn')
  )
  const countriesGeoJson = JSON.parse(readFileSync(
    path.join(staticFilesDir, 'countries.geojson'),
    'utf8'
  ))
  const router = await createRouter(db, ip2asn, countriesGeoJson, oidcProvider, oidcConfig)
  oidcProvider.proxy = true

  const rateLimitedIpsLastLogged: Record<string, number> = {}

  const app = express().use(
    helmet(),
    express.static(staticFilesDir),
    cookieParser(),
    rateLimit({
      windowMs: 4 * 60 * 1000,
      max: 140,
      handler: (req, _res, _next, _options) => {
        const now = Date.now()
        if (rateLimitedIpsLastLogged[req.ip] == null
            || now - rateLimitedIpsLastLogged[req.ip] > 2 * 60 * 1000) {
          rateLimitedIpsLastLogged[req.ip] = now
          console.warn(`Rate limited ${req.ip}`)
        }
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
  .option(
    '--db <path>',
    'Path to database file, defaults to $STATE_DIRECTORY/db.sqlite3 '
    + 'or /var/lib/tijmid/db.sqlite3',
    path.join(
      process.env.STATE_DIRECTORY ?? '/var/lib/tijmid',
      'db.sqlite3'
    )
  )
  .option(
    '--cache-dir <path>',
    'Path to cache directory, defaults to $CACHE_DIRECTORY or /var/cache/tijmid',
    process.env.CACHE_DIRECTORY ?? '/var/cache/tijmid'
  )
  .option(
    '--pid-file <path>',
    'Path to PID file or an empty string to disable, '
    + 'defaults to $RUNTIME_DIRECTORY/pid or /run/tijmid/pid'
  ) 

program.parse()
const opts = program.opts()

const pidFilePath = opts.pidFile != null
  ? opts.pidFile.length > 0
    ? opts.pidFile
    : null
  : process.env.RUNTIME_DIRECTORY != null
    ? path.join(process.env.RUNTIME_DIRECTORY, 'pid')
    : '/run/tijmid/pid'

if (pidFilePath != null) {
  const oldPidString = (() => {try {
    return readFileSync(pidFilePath, 'utf-8')
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
  writeFileSync(pidFilePath, process.pid.toString())
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
const app = await createApp(db, opts.cacheDir, opts.trustProxy)
listenOn(app, opts.listenSocket ?? opts.listenPort)
