import Database from "better-sqlite3"
import { cleanExpiredLoginSessionsIfNecessary } from "../service/loginSession.js"
import { migrate } from "./migrate.js"


export async function createDb(path: string) {
  const db = new Database(path)
  db.pragma('foreign_keys = ON')
  migrate(db)
  setInterval(() => {
    cleanExpiredLoginSessionsIfNecessary(db)
  }, 60 * 1000)
  return db
}
