import { randomBytes } from "crypto";


export class InvalidLoginJwtException extends Error { name = this.constructor.name }

export function generateJwtSecret() {
  return randomBytes(256 / 8).toString('base64')
}
