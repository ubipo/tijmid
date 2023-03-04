import { Database } from "better-sqlite3";
import { sql } from "./sql.js";

export async function getOrElseSet<T>(
  db: Database, key: string, orElseGenerator: () => Promise<T>,
  serialize: (value: T) => string, deserialize: (serialized: string) => T
) {
  const row = db.prepare(
      sql`SELECT * FROM secret WHERE key = :key`
  ).all({ key })[0]

  if (row == null) {
    console.info(`Generating ${key}...`)
    const value = await orElseGenerator()
    db.prepare(
      sql`INSERT INTO secret (key, value) VALUES (:key, :value)`
    ).run({ key, value: serialize(value) })
    return value
  }

  return deserialize(row.value)
}
