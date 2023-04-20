import { Database, SqliteError } from "better-sqlite3"
import { sql } from "./sql.js"

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
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        is_admin INTEGER DEFAULT FALSE NOT NULL,
        full_name TEXT,
        nickname TEXT,
        email TEXT
      ) WITHOUT ROWID, STRICT;
      CREATE TABLE secret (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) WITHOUT ROWID, STRICT;
      CREATE TABLE oidc_data (
        model TEXT,
        id TEXT,
        payload TEXT NOT NULL,
        session_uid TEXT,
        user_code TEXT,
        grant_id TEXT,
        consumed INTEGER NOT NULL DEFAULT FALSE,
        expiration INTEGER NOT NULL,
        PRIMARY KEY (model, id)
      ) STRICT;
      CREATE TABLE client (
        uuid BLOB PRIMARY KEY,
        id TEXT,
        name TEXT NOT NULL,
        secret TEXT NOT NULL,
        redirect_uris TEXT NOT NULL,
        post_logout_redirect_uris TEXT NOT NULL,
        require_pkce INTEGER NOT NULL DEFAULT TRUE,
        UNIQUE(id, secret)
      ) WITHOUT ROWID, STRICT;
      CREATE TABLE login_session (
        uuid BLOB PRIMARY KEY,
        token BLOB NOT NULL,
        user BLOB NOT NULL,
        created INTEGER NOT NULL,
        ip_address TEXT NOT NULL,
        FOREIGN KEY (user) REFERENCES user (uuid)
      ) WITHOUT ROWID, STRICT;
      CREATE TABLE subrequest_host (
        host TEXT PRIMARY KEY
      ) WITHOUT ROWID, STRICT;
      CREATE TABLE login_session_subrequest_host (
        login_session BLOB NOT NULL,
        subrequest_host TEXT NOT NULL,
        FOREIGN KEY (login_session) REFERENCES login_session (uuid),
        FOREIGN KEY (subrequest_host) REFERENCES subrequest_host (host),
        PRIMARY KEY (login_session, subrequest_host)
      ) WITHOUT ROWID, STRICT;
    `)
  },
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
