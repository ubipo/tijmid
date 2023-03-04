import { Router } from "express"
import { getLoginSessionsAndGrantsByUserUuid, deleteLoginSessionByUuid, deleteAllLoginSessionsExcept } from "../db/loginSession.js"
import { getSessionData } from "../service/loginSession.js"
import { expressAsync } from "../util/expressAsync.js"
import { slugToUuid } from "../util/uuidUtil.js"
import { loginHandler } from "./accessHandlers.js"
import * as pages from "../view/pages.js"
import { Database } from "better-sqlite3"
import { Ip2asn } from "../service/ip2asn.js"

export function createSessionRouter(
  db: Database,
  ip2asn: Ip2asn,
  countriesGeoJson: any,
) {
  return Router()
    .use(loginHandler)
    .get('/session', expressAsync(async (req, res) => {
      const sessionData = getSessionData(res)
      const loginSessionsWithGrants = getLoginSessionsAndGrantsByUserUuid(db, sessionData.user.uuid)
      const sessionsPage = await pages.sessions(
        sessionData.user,
        sessionData.loginSession,
        loginSessionsWithGrants,
        ip2asn,
        countriesGeoJson
      )
      res.send(sessionsPage)
    }))
    .post('/session/:slug/end', expressAsync(async (req, res) => {
      const sessionData = getSessionData(res)
      const sessionToEndUuid = slugToUuid(req.params.slug)
      deleteLoginSessionByUuid(db, sessionData.user.uuid, sessionToEndUuid)
      res.redirect('/session')
    }))
    .post('/session/end-all-others', expressAsync(async (req, res) => {
      const sessionData = getSessionData(res)
      deleteAllLoginSessionsExcept(
        db, sessionData.user.uuid, sessionData.loginSession.uuid
      )
      res.redirect('/session')
    }))
}
