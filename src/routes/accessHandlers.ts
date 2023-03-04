import { getSessionData, LoginRequired } from "../service/loginSession.js"
import { MaybeUnauthenticatedResponse, RequestHandler } from "../util/expressTypes.js"
import { ForbiddenReq } from "../util/ReqError.js"
import { NEXT_URL_QUERY_PARAM_KEY } from "./commonKeys.js"

export const loginHandler: RequestHandler = (req, res, next) => {
  const sessionData = (res as MaybeUnauthenticatedResponse).locals.sessionData
  if (sessionData instanceof LoginRequired) {
    return res.redirect(
      302,
      `/login?${NEXT_URL_QUERY_PARAM_KEY}=${encodeURIComponent(req.url)}`
    )
  }
  res.locals.sessionData = sessionData
  next()
}

export const adminHandler: RequestHandler = (_req, res, next) => {
  const sessionData = getSessionData(res)
  if (!sessionData.user.isAdmin) {
    throw new ForbiddenReq('Forbidden', 'Administrator privileges required')
  }
  next()
}
