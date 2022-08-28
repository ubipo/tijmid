import { Database, SqliteError } from "better-sqlite3"
import { sql } from "./sql.mjs"

const MIGRATIONS = (db: Database) => [
  () => {
    db.exec(sql`
      CREATE TABLE version (
        version INT PRIMARY KEY
      )
    `)
    db.exec(sql`INSERT INTO version (version) VALUES (0)`)
  },
  () => {
    db.exec(sql`
      CREATE TABLE user (
        uuid BLOB PRIMARY KEY,
        username STRING UNIQUE NOT NULL,
        password_hash STRING NOT NULL,
        is_admin BOOL DEFAULT FALSE NOT NULL,
        full_name STRING,
        nickname STRING,
        email STRING
      );
      CREATE TABLE secret (
        key STRING PRIMARY KEY,
        value STRING NOT NULL
      );
    `)
    db.exec(sql`
      CREATE TABLE invalidated_tokens (
        uuid BLOB PRIMARY KEY,
        expiration UNSIGNED BIG INT NOT NULL
      )
    `)
    db.exec(sql`
      CREATE TABLE oidc_data (
        model STRING,
        id STRING,
        payload STRING NOT NULL,
        session_uid STRING,
        user_code STRING,
        grant_id STRING,
        consumed BOOL NOT NULL DEFAULT FALSE,
        expiration UNSIGNED BIG INT NOT NULL,
        PRIMARY KEY (model, id)
      )
    `)
    db.exec(sql`
      CREATE TABLE client (
        uuid BLOB PRIMARY KEY,
        id STRING,
        name STRING NOT NULL,
        secret STRING NOT NULL,
        redirect_uris STRING NOT NULL,
        post_logout_redirect_uris STRING NOT NULL,
        require_pkce BOOL NOT NULL DEFAULT TRUE,
        UNIQUE(id, secret)
      )
    `)
  }
]

export function migrate(db: Database) {
  const version = (() => {
    try {
      const result = db.prepare(sql`SELECT version FROM version`).all()[0]
      if (result === undefined) return -1
      return result.version
    } catch (error) {
      if (error instanceof SqliteError && error.message.startsWith("no such table")) {
        return -1
      }
      throw error
    }
  })()

  const migrations = MIGRATIONS(db)
  const applicableMigrations = migrations.slice(version + 1)
  if (applicableMigrations.length > 0) {
    console.info('Applying database migations...')
    applicableMigrations.forEach((migration, i) => {
      console.info(`${i - 1} > ${i}`)
      migration()
    })
  }

  const newVersion = migrations.length - 1
  db.exec(sql`UPDATE version SET version = ${newVersion.toString()}`)
  console.info(`Database version: ${newVersion}`)
}
