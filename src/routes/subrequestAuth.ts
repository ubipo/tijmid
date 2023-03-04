import { Router } from "express"
import { jwtDecrypt } from "jose"
import { crudGet } from "../db/crud.js"
import { loginSessionCrudConfig, subrequestAuthHostCrudConfig } from "../model.js"
import { LoginRequired, verifyLoginSession } from "../service/loginSession.js"
import { SubrequestAuthJwtPayload, getSubrequestHostJwtKey, SUBREQUEST_TOKEN_MAXAGE } from "../service/subrequest.js"
import { setCookie } from "../util/cookie.js"
import { expressAsync } from "../util/expressAsync.js"
import { getExactlyOneHeader } from "../util/header.js"
import { getMaybeOneSearchParam } from "../util/params.js"
import { UnauthorizedReq, BadReq } from "../util/ReqError.js"
import { uuidFromString } from "../util/uuidUtil.js"
import { SUBREQUEST_AUTH_TOKEN_QUERY_PARAM_KEY } from "./commonKeys.js"
import { Database } from "better-sqlite3"
import { normalizeHost, pathToSearchParams, urlToNormalizedHost } from "../util/url.js"

export function createSubrequestAuthJwtHandler(
  subrequestAuthIssuerUrn: string,
  subrequestHostJwtSecret: Buffer,
) {
  const jwtKey = getSubrequestHostJwtKey(subrequestAuthIssuerUrn)
  return expressAsync(async (req, res) => {
    if (!req.path.startsWith("/subrequest-auth")) return
    const jwtFromCookie = req.cookies[jwtKey]
    if (jwtFromCookie == null) return
    if (typeof jwtFromCookie !== 'string') {
      throw new BadReq(
        'Invalid subrequest auth token',
        `The subrequest auth token must be a string.`
      )
    }
    const { payload } = await jwtDecrypt(jwtFromCookie, subrequestHostJwtSecret, {
      issuer: subrequestAuthIssuerUrn,
      audience: subrequestAuthIssuerUrn,
    })
    const subrequestAuthPayload = payload as SubrequestAuthJwtPayload
    res.locals.subrequestAuthJwtAndPayload = {
      jwt: jwtFromCookie,
      payload: subrequestAuthPayload,
    }
  })
}

export function createSubrequestAuthRouter(
  subrequestAuthIssuerUrn: string,
  subrequestHostJwtSecret: Buffer,
  db: Database,
) {
  const jwtKey = getSubrequestHostJwtKey(subrequestAuthIssuerUrn)
  // Endpoint for subrequest authentication by for example the NGINX 
  // ngx_http_auth_request_module module with proxy_pass.
  // When the user has logged in and has granted the subrequest host access
  // to their account (the grant doesn't provide any actual powers), this
  // endpoint returns status 200.
  // Otherwise, it returns status 401: Unauthorized, and the proxy server
  // is expected to redirect to 
  // <id-server>/consent?subrequest-host=<subrequest-host>&n=<original-uri>.
  // After the user has logged in and granted access, the user agent will be
  // redirected to the endpoint that they originally tried to access, along
  // with a JWT as the 'subrequest-auth-token' url parameter. Upon receiving 
  // the authentication subrequest for this request, this endpoint will
  // extract this JWT from the 'x-original-uri' header, and set a cookie on
  // the user agent to persist the authentication. Subsequent requests to this
  // endpoint will then return status 200.
  // The relevant subrequest host (/host) is specified in all requests using
  // the 'x-original-host' header.
  return Router().get('/subrequest-auth', expressAsync(async (req, res) => {
    try {
      const headerHost = normalizeHost(
        getExactlyOneHeader(req.headers, 'x-original-host')
      )
      const originalPath = getExactlyOneHeader(req.headers, 'x-original-uri')
      const jwtOrError = getMaybeOneSearchParam(
        pathToSearchParams(originalPath), SUBREQUEST_AUTH_TOKEN_QUERY_PARAM_KEY
      )
      if (jwtOrError instanceof Error) throw jwtOrError
      const { jwt, payload: jwtPayload } = jwtOrError != null
        ? await (async () => {
          const jwt = jwtOrError
          const { payload } = await jwtDecrypt(jwt, subrequestHostJwtSecret, {
            issuer: subrequestAuthIssuerUrn,
            audience: subrequestAuthIssuerUrn,
          })
          return { payload: payload as SubrequestAuthJwtPayload, jwt}
        })()
        : (() => {
          const cookieJwtAndPayload = res.locals.subrequestAuthJwtAndPayload
          if (cookieJwtAndPayload == null) {
            // This UnauthorizedReq will be handled by the reverse proxy and
            // trigger a redirect to the consent page.
            throw new UnauthorizedReq(
              'No subrequest auth token',
              `Provide the subrequest auth token as the ${SUBREQUEST_AUTH_TOKEN_QUERY_PARAM_KEY} url parameter.`
            )
          }
          return cookieJwtAndPayload
        })()
      const jwtHost = urlToNormalizedHost(jwtPayload.nextUrl)

      if (jwtHost !== headerHost) {
        throw new BadReq(
          'Invalid subrequest host',
          `Trying to authenticate for ${headerHost}, but user granted for ${jwtHost}`
        )
      }

      const loginSession = crudGet(
        loginSessionCrudConfig, db,
        { uuid: uuidFromString(jwtPayload.loginSession) },
        'uuid = :uuid'
      )
      const verificationError = verifyLoginSession(loginSession)
      if (verificationError instanceof LoginRequired) {
        throw new UnauthorizedReq(
          'Invalid login session',
          `Invalid or no login session (${verificationError}). Please log in again.`
        )
      }

      setCookie(res, jwtKey, jwt, SUBREQUEST_TOKEN_MAXAGE)

      res.send('ok')
    } catch (err) {
      console.error('Error in subrequest-auth', err)
      throw err
    }
  }))
}
