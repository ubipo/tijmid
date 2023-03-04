import { Database } from "better-sqlite3"
import { Router } from "express"
import { crudDelete } from "../db/crud.js"
import { loginSessionCrudConfig } from "../model.js"
import { getSessionData, LOGIN_SESSION_TOKEN_KEY } from "../service/loginSession.js"
import { expressAsync } from "../util/expressAsync.js"
import { loginHandler } from "./accessHandlers.js"

export function createLogoutRouter(db: Database) {
  return Router()
    .use(loginHandler)
    .post('/logout', expressAsync(async (_req, res) => {
      const sessionData = getSessionData(res)
      const token = sessionData.loginSession.token
      await crudDelete(loginSessionCrudConfig, db, { token }, 'token = :token')
      res.clearCookie(LOGIN_SESSION_TOKEN_KEY)
      res.redirect('/')
    }))
}
