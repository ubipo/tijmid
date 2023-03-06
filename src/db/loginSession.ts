import { Temporal } from "@js-temporal/polyfill";
import { Database } from "better-sqlite3"
import { randomBytes } from "crypto";
import { LoginSession, loginSessionCrudConfig, userCrudConfig } from "../model.js"
import { nowTaiMillis } from "../util/datetime.js";
import { generateUuid, Uuid, uuidToString } from "../util/uuidUtil.js"
import { crudColumnsClausePart, crudInsert } from "./crud.js"
import { sql } from "./sql.js"


export function getLoginSessionUserByToken(db: Database, token: Buffer) {
  const row = db.prepare(sql`
    SELECT
    ${crudColumnsClausePart(loginSessionCrudConfig, 'ls')},
    ${crudColumnsClausePart(userCrudConfig, 'u')}
    FROM login_session ls
    INNER JOIN user u ON ls.user = u.uuid
    WHERE ls.token = :token
  `).all({ token })[0]
  if (row == null) return null
  const loginSession = loginSessionCrudConfig.fromDbRow(row, 'ls')
  const user = userCrudConfig.fromDbRow(row, 'u')
  return { loginSession, user }
}

export interface LoginSessionWithGrants extends LoginSession {
  subrequestHosts: string[]
}

export function getLoginSessionsAndGrantsByUserUuid(
  db: Database,
  userUuid: Uuid
) {
  const rows = db.prepare(sql`
    SELECT
    ${crudColumnsClausePart(loginSessionCrudConfig, 'ls')},
    lsrd.subrequest_host lsrd_subrequest_host
    FROM login_session ls
    LEFT JOIN login_session_subrequest_host lsrd ON ls.uuid = lsrd.login_session
    WHERE ls.user = :userUuid
  `).all({ userUuid })
  // Flatten the SQL join rows into an array of singular LoginSessionWithGrants'
  const loginSessions = Object.values(rows.reduce(
    (
      loginSessions: Record<string, LoginSessionWithGrants>, row
    ) => {
      const rowLoginSession = loginSessionCrudConfig.fromDbRow(row, 'ls')
      const uuidStr = uuidToString(rowLoginSession.uuid)
      const loginSession = loginSessions[uuidStr] ?? rowLoginSession
      loginSessions[uuidStr] = loginSession
      loginSession.subrequestHosts = loginSession.subrequestHosts ?? []
      if (row.lsrd_subrequest_host != null) {
        loginSession.subrequestHosts.push(row.lsrd_subrequest_host)
      }
      return loginSessions
    },
    {}
  ))
  return loginSessions
}

export async function insertLoginSession(
  db: Database,
  userUuid: Uuid,
  ipAddress: string
) {
  const loginSession = {
    uuid: generateUuid(),
    token: randomBytes(32),
    user: userUuid,
    created: nowTaiMillis(),
    ipAddress: ipAddress
  }
  await crudInsert(loginSessionCrudConfig, db, loginSession)
  return loginSession
}

export async function deleteAllLoginSessionsExcept(
  db: Database,
  userUuid: Uuid,
  loginSessionUuid: Uuid
) {
  db.prepare(sql`
    DELETE FROM login_session
    WHERE user = :userUuid AND uuid != :loginSessionUuid
  `).run({ userUuid, loginSessionUuid })
}

export async function deleteLoginSessionByUuid(
  db: Database,
  userUuid: Uuid,
  loginSessionUuid: Uuid
) {
  db.prepare(sql`
    DELETE FROM login_session
    WHERE user = :userUuid AND uuid = :loginSessionUuid
  `).run({ userUuid, loginSessionUuid })
}

export async function deleteExpiredLoginSessions(
  db: Database,
  maxAge: Temporal.Duration
) {
  const maxCreatedTime = nowTaiMillis() - maxAge.total('millisecond')
  db.prepare(sql`
    DELETE FROM login_session
    WHERE created < :maxCreatedTime
  `).run({ maxCreatedTime })
}
