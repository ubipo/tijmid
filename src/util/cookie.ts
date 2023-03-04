import { Temporal } from "@js-temporal/polyfill";
import { CookieOptions, Response } from "express";


export const COOKIE_SEC_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax'
}

export function setCookie(
  res: Response,
  name: string,
  value: string,
  maxAge: Temporal.Duration,
  options: CookieOptions = {}
) {
  const optionsMerged = {
    maxAge: maxAge.total('millisecond'),
    ...COOKIE_SEC_OPTIONS,
    ...options
  }
  res.cookie(name,value, optionsMerged)
}
