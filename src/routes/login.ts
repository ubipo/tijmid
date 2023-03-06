import { Request, Router } from "express"
import { errors as oidcErrors } from "oidc-provider"
import { LoginRequired, LOGIN_SESSION_MAXAGE, LOGIN_SESSION_TOKEN_KEY } from "../service/loginSession.js"
import { expressAsync } from "../util/expressAsync.js"
import { MaybeUnauthenticatedResponse } from "../util/expressTypes.js"
import { getParams } from "../util/params.js"
import * as pages from "../view/pages.js"
import { NEXT_URL_QUERY_PARAM_KEY } from "./commonKeys.js"
import urlencodedParser from "./urlencodedParser.js"
import { Response } from "../util/expressTypes.js"
import Provider from "oidc-provider"
import { User, userCrudConfig } from "../model.js"
import { uuidToString } from "../util/uuidUtil.js"
import { crudGet } from "../db/crud.js"
import { Database } from "better-sqlite3"
import { BadReq, UnauthorizedReq } from "../util/ReqError.js"
import { verifyPassword } from "../util/password.js"
import { insertLoginSession } from "../db/loginSession.js"
import { setCookie } from "../util/cookie.js"

async function getPostLoginDestination(
  req: Request, res: Response, oidcProvider: Provider,
  nextUrlParam: string, user: User
) {
  if (typeof nextUrlParam === 'string') return decodeURIComponent(nextUrlParam)

  try {
    return await oidcProvider.interactionResult(req, res, {
      login: {
        accountId: uuidToString(user.uuid)
      },
    })
  } catch (error) {
    const isNoInteractionInProgressError = (
      error instanceof oidcErrors.SessionNotFound
      && (
        error.error_description === 'interaction session not found'
        || error.error_description === 'interaction session id cookie not found'
      )
    )
    if (!isNoInteractionInProgressError) {
      throw error
    }
  }

  return "/"
}

async function login(
  req: Request, res: Response, db: Database,
  username: string, password: string,
) {
  const user = crudGet(userCrudConfig, db, { username }, 'username = :username')
  if (user == null) throw new BadReq("Login", `No such user: ${username}`)
  const hash = user.passwordHash
  const isValid = await verifyPassword(hash, password)
  if (!isValid) throw new UnauthorizedReq("Login", `wrong password`)
  const loginSession = await insertLoginSession(db, user.uuid, req.ip)
  const tokenBase64NoPad = loginSession.token.toString('base64url')
  console.log(`Set login session token cookie: ${tokenBase64NoPad}`)
  setCookie(res, LOGIN_SESSION_TOKEN_KEY, tokenBase64NoPad, LOGIN_SESSION_MAXAGE)
  return user
}

export function createLoginRouter(
  db: Database,
  oidcProvider: Provider,
) {
  return Router()
    .get("/login", expressAsync(async (req, res) => {
      const sessionData = (res as MaybeUnauthenticatedResponse).locals.sessionData
      if (sessionData instanceof LoginRequired) {
        res.send(pages.login())
        return
      }
      const nextUrlParam = req.query[NEXT_URL_QUERY_PARAM_KEY]
      const destination = await getPostLoginDestination(
        req, res, oidcProvider, nextUrlParam as string, sessionData.user
      )
      res.redirect(303, destination)
    }))
    .post("/login", urlencodedParser, expressAsync(async (req, res) => {
      const { username, password } = getParams(
        "Login", req.body, ["username", "password"]
      )
      const nextUrlParam = req.query[NEXT_URL_QUERY_PARAM_KEY]
      const user = await login(req, res, db, username, password)
      const destination = await getPostLoginDestination(
        req, res, oidcProvider, nextUrlParam as string, user
      )
      res.redirect(303, destination)
    }))
}
