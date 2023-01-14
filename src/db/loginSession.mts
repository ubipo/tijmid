import { Database } from "better-sqlite3"
import { randomBytes } from "crypto";
import { LoginSession, loginSessionCrudConfig, userCrudConfig } from "../model.mjs"
import { now } from "../util/datetime.mjs";
import { generateUuid, Uuid, uuidToString } from "../util/uuidUtil.mjs"
import { crudColumnsClausePart, crudInsert } from "./crud.mjs"
import { sql } from "./sql.mjs"


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
  subrequestDomains: string[]
}

export function getLoginSessionsAndGrantsByUserUuid(
  db: Database,
  userUuid: Uuid
) {
  const rows = db.prepare(sql`
    SELECT
    ${crudColumnsClausePart(loginSessionCrudConfig, 'ls')},
    lsrd.subrequest_domain lsrd_subrequest_domain
    FROM login_session ls
    LEFT JOIN login_session_subrequest_domain lsrd ON ls.uuid = lsrd.login_session
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
      loginSession.subrequestDomains = loginSession.subrequestDomains ?? []
      if (row.lsrd_subrequest_domain != null) {
        loginSession.subrequestDomains.push(row.lsrd_subrequest_domain)
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
    created: now(),
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
