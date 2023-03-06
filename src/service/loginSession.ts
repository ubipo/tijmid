import { deleteExpiredLoginSessions, getLoginSessionUserByToken } from "../db/loginSession.js";
import { Temporal } from '@js-temporal/polyfill';
import { Database } from "better-sqlite3";
import { nowTaiMillis } from "../util/datetime.js";
import { User, LoginSession } from "../model.js";
import { Response } from "../util/expressTypes.js";
import { InternalServerError } from "../util/ReqError.js";


const MAXIMUM_EXPIRED_CLEAN_DELAY = Temporal.Duration.from('PT1H')
export const LOGIN_SESSION_TOKEN_KEY = 'login-token'
export const LOGIN_SESSION_MAXAGE = Temporal.Duration.from('P100D')

let lastExpiredCleanMillis: number | null = null

export function cleanExpiredLoginSessionsIfNecessary(db: Database) {
  const max = MAXIMUM_EXPIRED_CLEAN_DELAY.total('millisecond')
  if (lastExpiredCleanMillis == null || nowTaiMillis() - lastExpiredCleanMillis > max) {
    deleteExpiredLoginSessions(db, LOGIN_SESSION_MAXAGE)
    lastExpiredCleanMillis = nowTaiMillis()
  }
}

export interface SessionData {
  user: User,
  loginSession: LoginSession
}

export class LoginRequired {
  name = this.constructor.name
  reason: string

  constructor(reason: string = '') { this.reason = reason }

  static NOT_FOUND = new LoginRequired('Login session not found. It may have expired or been invalidated')
}

export function sessionDataFromToken(db: Database, tokenStr: any) {
  if (tokenStr == null || typeof tokenStr !== 'string') return new LoginRequired()
  const token = Buffer.from(tokenStr, 'base64')
  const sessionData = getLoginSessionUserByToken(db, token)
  if (sessionData == null) return LoginRequired.NOT_FOUND
  const verificationResult = verifyLoginSession(sessionData.loginSession)
  if (verificationResult instanceof LoginRequired) return verificationResult
  return sessionData
}

export function getSessionData(res: Response) {
  const sessionData = res.locals.sessionData
  if (sessionData == null) {
    throw new InternalServerError('No session', 'No session data found, try logging in again')
  }
  return sessionData as SessionData
}

export function verifyLoginSession(session?: LoginSession | null) {
  if (session == null) return LoginRequired.NOT_FOUND
  if (session.created < nowTaiMillis() - LOGIN_SESSION_MAXAGE.total('millisecond')) {
    return new LoginRequired('Login session expired')
  }
  return session
}

