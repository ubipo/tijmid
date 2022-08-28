import Database from "better-sqlite3"
import { migrate } from "./migrate.mjs"

export async function createDb(path: string) {
  const db = new Database(path)
  migrate(db)
  return db
}
