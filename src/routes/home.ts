import { getSessionData } from "../service/loginSession.js"
import { loginHandler } from "./accessHandlers.js"
import * as pages from "../view/pages.js"
import { Router } from "express"

export function createHomeRouter() {
  return Router().get('/', loginHandler, (_req, res) => {
    const session = getSessionData(res)
    res.send(pages.home(session.user))
  })
}
