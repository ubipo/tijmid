import { Database } from "better-sqlite3"
import { Uuid } from "../util/uuidUtil.js"
import { sql } from "./sql.js"

export function cleanExpired(db: Database) {
  db.prepare(
    sql`DELETE FROM invalidated_tokens WHERE expiration < :maxExpiration`
  ).run({ maxExpiration: Math.floor(Date.now() / 1000) })
}

export function invalidate(db: Database, uuid: Uuid, expiration: number) {
  db.prepare(
    sql`INSERT INTO invalidated_tokens (uuid, expiration) VALUES (:uuid, :expiration)`
  ).run({ uuid, expiration })
  setTimeout(() => { cleanExpired(db) })
}

export function isInvalidated(db: Database, uuid: Uuid) {
  const row = db.prepare(
    sql`SELECT * FROM invalidated_tokens WHERE uuid = :uuid`
  ).all({ uuid })[0]
  return row != null
}
