import { Database } from "better-sqlite3";
import { CookieOptions } from "express";
import JsonWebToken, { JwtPayload } from "jsonwebtoken"
import { randomBytes } from "crypto";

import { crudGet } from "../db/crud.mjs";
import * as dbExpiredTokens from "../db/invalidatedTokens.mjs"
import { User, userCrudConfig } from "../model.mjs";
import { generateUuid } from "./uuidUtil.mjs";
import { tryCatch } from "./tryCatch.mjs";


export const LOGIN_JWT_KEY = 'login-jwt'
export const LOGIN_TOKEN_MAXAGE = 60 * 60 * 24 * 100; // 100 days
export const COOKIE_SEC_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax'
}

export class InvalidLoginJwtException extends Error { name = this.constructor.name }

export function generateJwtSecret() {
  return randomBytes(256).toString('base64')
}

export class LoginRequired {
  name = this.constructor.name
  reason: string

  constructor(reason: string = '') { this.reason = reason }
}

export function sessionFromLoginJwt(db: Database, secret: string, jwtString: any) {
  if (jwtString == null) return new LoginRequired()
  const jwt = tryCatch(
    () => JsonWebToken.verify(jwtString, secret, { complete: true }),
    JsonWebToken.JsonWebTokenError,
    () => { throw new InvalidLoginJwtException() }
  )
  const payload = jwt.payload as JwtPayload
  const exp = payload.exp
  if (exp == null) {
    throw new Error('JWT does not have an expiration time')
  }
  const tokenUuid = Buffer.from(payload.uuid, 'base64')
  if (dbExpiredTokens.isInvalidated(db, tokenUuid)) {
    return new LoginRequired()
  }
  const userUuid = Buffer.from(payload.userUuid, 'base64')
  const user = crudGet(userCrudConfig, db, { uuid: userUuid })
  if (user == null) return new LoginRequired('User does not exist anymore')
  return { user, tokenUuid, tokenExp: exp }
}

export function createLoginJwtString(secret: string, user: User) {
  return JsonWebToken.sign(
    {
      type: LOGIN_JWT_KEY,
      userUuid: user.uuid.toString('base64'),
      uuid: generateUuid()
    },
    secret,
    { expiresIn: LOGIN_TOKEN_MAXAGE }
  )
}
