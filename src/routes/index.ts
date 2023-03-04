import { Database } from "better-sqlite3";
import { ErrorRequestHandler, Request, Router } from "express";
import Provider, { Configuration } from "oidc-provider";
import { clientCrudConfig, LastAdminException, subrequestAuthHostCrudConfig, userCrudConfig } from "../model.js";
import { adminHandler, loginHandler } from "./accessHandlers.js";
import { createConsentRouter } from "./consent.js";
import { createCrudRouter } from "./crud.js";
import { createHomeRouter } from "./home.js";
import { addLoginRoutes } from "./login.js";
import { createLogoutRouter } from "./logout.js";
import { createSessionRouter } from "./session.js";
import { createSubrequestAuthRouter } from "./subrequestAuth.js";
import { Ip2asn } from "../service/ip2asn.js";
import { LoginRequired, LOGIN_SESSION_TOKEN_KEY, sessionDataFromToken } from "../service/loginSession.js";
import { MaybeUnauthenticatedRequestHandler, MaybeUnauthenticatedResponse, Response } from "../util/expressTypes.js";
import { InvalidLoginJwtException } from "../util/jwt.js";
import { InvalidPasswordException } from "../util/password.js";
import { BadReq } from "../util/ReqError.js";

export function createSessionDataHandler(
  db: Database
): MaybeUnauthenticatedRequestHandler {
  return async (req, res, next) => {
    const sessionData = sessionDataFromToken(db, req.cookies[LOGIN_SESSION_TOKEN_KEY])
    res.locals.sessionData = sessionData
    next()
  }
}

export async function createRouter(
  subrequestAuthIssuerUrn: string,
  subrequestAuthJwtSecret: Buffer,
  db: Database,
  ip2asn: Ip2asn,
  countriesGeoJson: any,
  oidcProvider: Provider,
  oidcConfig: Configuration,
) {
  const router = Router()
  addLoginRoutes(db, oidcProvider, router)

  // Logged in routes
  router.use(createHomeRouter())
  router.use(createLogoutRouter(db))
  router.use(createSessionRouter(db, ip2asn, countriesGeoJson))
  router.use(createConsentRouter(
    subrequestAuthIssuerUrn, subrequestAuthJwtSecret,
    db, oidcConfig, oidcProvider
  ))
  router.use(createSubrequestAuthRouter(
    subrequestAuthIssuerUrn, subrequestAuthJwtSecret, db
  ))
  

  // Admin routes
  router.use(createCrudRouter(userCrudConfig, db, loginHandler, adminHandler))
  router.use(createCrudRouter(clientCrudConfig, db, loginHandler, adminHandler))
  router.use(createCrudRouter(subrequestAuthHostCrudConfig, db, loginHandler, adminHandler))

  const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (err instanceof LastAdminException) {
      return next(new BadReq(
        'Cannot Delete Last Administrator',
        'Attempted to delete the last administrator or to revoke their administrator priviliges'
      ))
    } else if (err instanceof InvalidPasswordException) {
      return next(new BadReq(
        'Invalid Password',
        `Chosen password is invalid: ${err.reason}`
      ))
    } else if (err instanceof InvalidLoginJwtException) {
      res.clearCookie(LOGIN_SESSION_TOKEN_KEY)
      return next(new BadReq(
        'Invalid Login Token',
        `Login token is invalid.\nCookie has been cleared. Please reload.`
      ))
    }
    next(err)
  }
  router.use(errorHandler)

  const isRateLimitExempt = (_req: Request, res: Response) => {
    const sessionData = (res as MaybeUnauthenticatedResponse).locals.sessionData
    const isAuthenticated = sessionData != null && !(sessionData instanceof LoginRequired)
    if (isAuthenticated) return true

    const subrequestAuthJwtAndPayload = res.locals.subrequestAuthJwtAndPayload
    if (subrequestAuthJwtAndPayload != null) return true

    return false
  }

  return { router, isRateLimitExempt }
}
