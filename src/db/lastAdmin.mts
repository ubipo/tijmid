import { Database } from "better-sqlite3";
import { sql } from "./sql.mjs";
import { Uuid } from "../util/uuidUtil.mjs";

export function adminCount(db: Database) {
  const row = db.prepare(sql`
    SELECT COUNT(*) count FROM user
    WHERE is_admin
  `).all()[0]
  return row.count
}

export function isLastAdmin(db: Database, uuid: Uuid) {
  const rows = db.prepare(sql`
    WITH admins as (
      SELECT uuid = :uuid as is_user_in_question from user where is_admin
    )
    SELECT is_user_in_question, count(*) as count from admins
    GROUP BY is_user_in_question
  `).all({ uuid })
  const is_admin = rows.find(row => row.is_user_in_question == 1) != null
  const other_admins_count = rows.find(row => row.is_user_in_question != 1)?.count ?? 0
  return is_admin && other_admins_count == 0
}
