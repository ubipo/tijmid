import { Database } from "better-sqlite3";
import { Uuid } from "../util/uuidUtil.js";
import { sql } from "./sql.js";

export function deleteLoginSessionSubrequestHost(
  db: Database,
  loginSession: Uuid,
  subrequestHost: string,
) {
  db.prepare(sql`
    DELETE FROM login_session_subrequest_host
    WHERE login_session = :loginSession AND subrequest_host = :subrequestHost
  `).run({ loginSession, subrequestHost: subrequestHost })
}

export function insertLoginSessionSubrequestHost(
  db: Database,
  loginSession: Uuid,
  subrequestHost: string,
) {
  db.prepare(sql`
    INSERT OR REPLACE INTO login_session_subrequest_host
      (login_session, subrequest_host)
    VALUES
      (:loginSession, :subrequestHost)
  `).run({ loginSession, subrequestHost })
}
