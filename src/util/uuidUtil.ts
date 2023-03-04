import * as libUuid from "uuid";

export type Uuid = Buffer

export function uuidToSlug(uuid: Uuid) {
  return uuid.toString("base64url")
}

export function slugToUuid(slug: string) {
  return Buffer.from(slug, "base64url")
}

export function generateUuid(): Uuid {
  return uuidFromString(libUuid.v4())
}

export function uuidToString(uuid: Uuid) {
  return libUuid.stringify(uuid)
}

export function uuidFromString(str: string) {
  return Buffer.of(...Uint8Array.from(libUuid.parse(str)))
}
