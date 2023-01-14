import { Database } from "better-sqlite3";
import { CookieOptions } from "express";
import JsonWebToken, { JwtPayload } from "jsonwebtoken"
import { randomBytes } from "crypto";
import { crudGet } from "../db/crud.mjs";
import * as dbExpiredTokens from "../db/invalidatedTokens.mjs"
import { loginSessionCrudConfig, User, userCrudConfig } from "../model.mjs";
import { generateUuid } from "./uuidUtil.mjs";
import { tryCatch } from "./tryCatch.mjs";
import { normalizeDomain } from "./domains.mjs";


export const LOGIN_SESSION_TOKEN_KEY = 'login-token'
export const LOGIN_SESSION_TOKEN_MAXAGE = 60 * 60 * 24 * 100; // 100 days
export const COOKIE_SEC_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax'
}

export class InvalidLoginJwtException extends Error { name = this.constructor.name }

export const SUBREQUEST_TOKEN_MAXAGE = 60 * 60 * 1000; // 1 hour

export function getSubrequestDomainJwtKey(baseDomain: string) {
  return `subrequest-domain-jwt-${encodeURIComponent(normalizeDomain(baseDomain))}`
}

export function generateJwtSecret() {
  return randomBytes(256).toString('base64')
}

export function createLoginJwtString(secret: string, user: User) {
  return JsonWebToken.sign(
    {
      type: LOGIN_SESSION_TOKEN_KEY,
      userUuid: user.uuid.toString('base64'),
      uuid: generateUuid()
    },
    secret,
    { expiresIn: LOGIN_SESSION_TOKEN_MAXAGE }
  )
}
