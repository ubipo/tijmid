import { Database } from "better-sqlite3"
import { getLoginSessionUserByToken } from "../db/loginSession.mjs"
import { LoginSession, User } from "../model.mjs"


export interface SessionData {
  user: User,
  loginSession: LoginSession
}

export class LoginRequired {
  name = this.constructor.name
  reason: string

  constructor(reason: string = '') { this.reason = reason }
}

export function sessionDataFromToken(db: Database, tokenStr: any) {
  if (tokenStr == null || typeof tokenStr !== 'string') return new LoginRequired()
  const token = Buffer.from(tokenStr, 'base64')
  const loginSession = getLoginSessionUserByToken(db, token)
  if (loginSession == null) return new LoginRequired('Login session not found. It may have expired or been invalidated')
  return loginSession

  // const payload = jwt.payload as JwtPayload
  // const exp = payload.exp
  // if (exp == null) {
  //   throw new Error('JWT does not have an expiration time')
  // }
  // const tokenUuid = Buffer.from(payload.uuid, 'base64')
  // if (dbExpiredTokens.isInvalidated(db, tokenUuid)) {
  //   return new LoginRequired()
  // }
  // const userUuid = Buffer.from(payload.userUuid, 'base64')
  // const user = crudGet(userCrudConfig, db, { uuid: userUuid })
  // if (user == null) return new LoginRequired('User does not exist anymore')
  // return { user, tokenUuid, tokenExp: exp }
}
