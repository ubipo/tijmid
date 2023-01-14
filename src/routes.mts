import { InvalidPasswordException, verifyPassword } from "./util/password.mjs"
import { expressAsync } from "./util/expressAsync.mjs"
import { slugToUuid, uuidFromString, uuidToString } from "./util/uuidUtil.mjs"
import * as pages from "./view/pages.mjs"
import { Database } from "better-sqlite3";
import { ErrorRequestHandler, Router, Request } from "express";
import bodyParser from "body-parser"
import { BadReq, ForbiddenReq, InternalServerError, NotFound, UnauthorizedReq } from "./util/ReqError.mjs"
import { COOKIE_SEC_OPTIONS, getSubrequestDomainJwtKey, InvalidLoginJwtException, LOGIN_SESSION_TOKEN_KEY, LOGIN_SESSION_TOKEN_MAXAGE } from "./util/jwt.mjs"
import { Provider, errors as oidcErrors, InteractionResults, Configuration } from "oidc-provider"
import { getParams } from "./util/params.mjs"
import { UICrudConfig } from "./crudConfig.mjs"
import { crudEdit, crudGet, crudInsert, crudAll, crudDeletePK, crudDelete } from "./db/crud.mjs"
import { User, clientCrudConfig, LastAdminException, userCrudConfig, subrequestDomainCrudConfig, loginSessionCrudConfig } from "./model.mjs"
import { escapeHtml } from "./view/html.mjs"
import endentImp from "endent";
import { LoginRequired, SessionData, sessionDataFromToken } from "./util/session.mjs"
import { RequestHandler, Response } from "./util/expressTypes.mjs"
import { deleteAllLoginSessionsExcept, deleteLoginSessionByUuid, getLoginSessionsAndGrantsByUserUuid, insertLoginSession } from "./db/loginSession.mjs"
import { Ip2asn } from "./util/ip2asn.js";
const endent = (endentImp as any).default


const NEXT_URL_QUERY_PARAM_KEY = 'n'

function getSessionData(res: Response) {
  const sessionData = res.locals.sessionData
  if (sessionData == null) {
    throw new InternalServerError('No session', 'No session data found, try logging in again')
  }
  return sessionData as SessionData
}

async function getPostLoginDestination(
  req: Request, res: Response, oidcProvider: Provider,
  nextUrlParam: string, user: User
) {
  if (typeof nextUrlParam === 'string') return decodeURIComponent(nextUrlParam)

  try {
    return await oidcProvider.interactionResult(req, res, {
      login: {
        accountId: uuidToString(user.uuid)
      },
    })
  } catch (error) {
    const isNoInteractionInProgressError = (
      error instanceof oidcErrors.SessionNotFound
      && (
        error.error_description === 'interaction session not found'
        || error.error_description === 'interaction session id cookie not found'
      )
    )
    if (!isNoInteractionInProgressError) {
      throw error
    }
  }

  return "/"
}

async function login(
  req: Request, res: Response, db: Database,
  username: string, password: string,
) {
  const user = crudGet(userCrudConfig, db, { username }, 'username = :username')
  if (user == null) throw new BadReq("Login", `No such user: ${username}`)
  const hash = user.passwordHash
  const isValid = await verifyPassword(hash, password)
  if (!isValid) throw new UnauthorizedReq("Login", `wrong password`)
  const loginSession = await insertLoginSession(db, user.uuid, req.ip)
  res.cookie(LOGIN_SESSION_TOKEN_KEY, loginSession.token.toString('base64'), Object.assign({ maxAge: LOGIN_SESSION_TOKEN_MAXAGE }, COOKIE_SEC_OPTIONS))
  return user
}

function addCrudRoutes<T>(
  config: UICrudConfig<T>,
  db: Database,
  router: Router,
  ...handlers: RequestHandler[]
) {
  const urlencodedParser = bodyParser.urlencoded({ extended: false })

  router
    .get(config.collectionUrl, ...handlers, (_req, res) => {
      const sessionData = getSessionData(res)
      const objects = crudAll(config, db)
      res.send(pages.crudList(config, sessionData.user, objects))
    })
    .post(config.collectionUrl, ...handlers, urlencodedParser, expressAsync(async (req, res) => {
      const object = await config.fromParams(req.body)
      crudInsert(config, db, object)
      res.redirect(303, "")
    }))
    .get(`${config.objectTemplateUrl}/delete`, ...handlers, (req, res) => {
      const whereParams = config.objectUrlParamsToWhereParams(req.params)
      const object = crudGet(config, db, whereParams)
      if (object == null) throw new NotFound(
        `${config.title} by ${JSON.stringify(whereParams)}`, ''
      )
      res.send(pages.crudDelete(config, object))
    })
    .post(`${config.objectTemplateUrl}/delete`, ...handlers, urlencodedParser, expressAsync(async (req, res) => {
      const whereParams = config.objectUrlParamsToWhereParams(req.params)
      const deleted = crudDeletePK(config, db, whereParams)
      if (!deleted) throw new NotFound(
        `${config.title} by ${JSON.stringify(whereParams)}`, ''
      )
      res.redirect(303, "..")
    }))
    .get(`${config.objectTemplateUrl}/edit`, ...handlers, (req, res) => {
      const whereParams = config.objectUrlParamsToWhereParams(req.params)
      const object = crudGet(config, db, whereParams)
      if (object == null) throw new NotFound(
        `${config.title} by ${JSON.stringify(whereParams)}`, ''
      )
      res.send(pages.crudEdit(config, object))
    })
    .post(`${config.objectTemplateUrl}/edit`, ...handlers, urlencodedParser, expressAsync(async (req, res) => {
      const whereParams = config.objectUrlParamsToWhereParams(req.params)
      const previous = crudGet(config, db, whereParams)
      const object = await config.fromParams(req.body, previous ?? undefined)
      const deleted = await crudEdit(config, db, object)
      if (!deleted) throw new NotFound(
        `${config.title} by ${JSON.stringify(whereParams)}`, ''
      )
      res.redirect(303, "..")
    }))
}

export async function createRouter(
  db: Database,
  ip2asn: Ip2asn,
  countriesGeoJson: any,
  oidcProvider: Provider,
  oidcConfig: Configuration,
) {
  const urlencodedParser = bodyParser.urlencoded({ extended: false })

  const loginHandler: RequestHandler = (req, res, next) => {
    const sessionData = sessionDataFromToken(db, req.cookies[LOGIN_SESSION_TOKEN_KEY])
    if (sessionData instanceof LoginRequired) {
      return res.redirect(
        302,
        `/login?${NEXT_URL_QUERY_PARAM_KEY}=${encodeURIComponent(req.url)}`
      )
    }
    res.locals.sessionData = sessionData
    next()
  }

  const adminHandler: RequestHandler = (_req, res, next) => {
    const sessionData = getSessionData(res)
    if (!sessionData.user.isAdmin) {
      throw new ForbiddenReq('Forbidden', 'Administrator privileges required')
    }
    next()
  }

  const router: Router = Router()
    .get("/login", expressAsync(async (req, res) => {
      const sessionData = sessionDataFromToken(db, req.cookies[LOGIN_SESSION_TOKEN_KEY])
      if (sessionData instanceof LoginRequired) {
        res.send(pages.login())
        return
      }
      const nextUrlParam = req.query[NEXT_URL_QUERY_PARAM_KEY]
      const destination = await getPostLoginDestination(
        req, res, oidcProvider, nextUrlParam as string, sessionData.user
      )
      res.redirect(303, destination)
    }))
    .post("/login", urlencodedParser, expressAsync(async (req, res) => {
      const { username, password } = getParams(
        "Login", req.body, ["username", "password"]
      )
      const nextUrlParam = req.query[NEXT_URL_QUERY_PARAM_KEY]
      const user = await login(req, res, db, username, password)
      const destination = await getPostLoginDestination(
        req, res, oidcProvider, nextUrlParam as string, user
      )
      res.redirect(303, destination)
    }))

  // Logged in routes
  router
    .get('/', loginHandler, (_req, res) => {
      const session = getSessionData(res)
      res.send(pages.home(session.user))
    })
    .post('/logout', loginHandler, expressAsync(async (_req, res) => {
      const sessionData = getSessionData(res)
      const token = sessionData.loginSession.token
      await crudDelete(loginSessionCrudConfig, db, { token }, 'token = :token')
      res.clearCookie(LOGIN_SESSION_TOKEN_KEY)
      res.redirect('/')
    }))
    .get('/consent', loginHandler, expressAsync(async (req, res) => {
      const { prompt, params } = await oidcProvider.interactionDetails(req, res);
      const clientId = params.client_id
      if (typeof clientId !== 'string') {
        throw new Error(`
          Expected client_id to be a string but \
          was ${typeof clientId} (${clientId})
        `)
      }
      const client = crudGet(clientCrudConfig, db, { id: clientId }, 'id = :id')
      if (client == null) {
        throw new Error(`Could not find client for consent flow (${clientId})`)
      }
      const missingScopesClaims = Object.fromEntries(
        Array.from(prompt.details.missingOIDCScope as string[]).map(
          scope => [scope, oidcConfig.claims!![scope]]
        )
      )
      delete missingScopesClaims['openid']
      delete missingScopesClaims['offline_access']
      res.send(pages.consent(
        client, params, prompt.details, missingScopesClaims
      ))
    }))
    .post('/consent', loginHandler, urlencodedParser, expressAsync(async (req, res) => {
      const { action } = getParams("Consent", req.body, ["action"])
      if (action === 'deny') {
        const result: InteractionResults = {
          error: 'access_denied',
          error_description: 'User denied consent',
        }
        await oidcProvider.interactionFinished(
          req, res, result, { mergeWithLastSubmission: true }
        )
        return
      } else if (action !== 'consent') {
        throw new BadReq(
          'Consent',
          endent`
            Parameter 'action' must be either 'consent' or 'deny' \
            (was: ${escapeHtml(action)}).
          `
        )
      }

      const interactionDetails = await oidcProvider.interactionDetails(req, res);
      const { prompt: { name: promptName }, params, session: oidcSession } = interactionDetails;
      const promptDetails = interactionDetails.prompt.details as any
      if (promptName !== 'consent' || oidcSession == null) throw new BadReq(
        'Not a consent interaction', 'Current interaction is not of type consent'
      )
      const { accountId } = oidcSession
      const session = getSessionData(res)
      const loggedInUserUuid = session.user.uuid
      const interactionUserUuid = uuidFromString(accountId)
      if (!loggedInUserUuid.equals(interactionUserUuid)) {
        const msg = 'Logged-in user is not the same one that started the OAuth flow'
        console.error(`${msg} loggedIn: ${uuidToString(loggedInUserUuid)}, interaction: ${uuidToString(interactionUserUuid)}`)
        throw new BadReq('Wrong user', msg)
      }

      let { grantId } = interactionDetails;
      let grant;

      if (grantId) {
        // we'll be modifying existing grant in existing session
        grant = await oidcProvider.Grant.find(grantId);
        if (grant == null) throw new BadReq(
          'No grant', 'Existing grant in session not found'
        )
      } else {
        // we're establishing a new grant
        grant = new oidcProvider.Grant({
          accountId,
          clientId: params.client_id as string,
        });
      }

      if (promptDetails.missingOIDCScope) {
        grant.addOIDCScope(promptDetails.missingOIDCScope.join(' '));
      }
      if (promptDetails.missingOIDCClaims) {
        grant.addOIDCClaims(promptDetails.missingOIDCClaims);
      }
      if (promptDetails.missingResourceScopes) {
        for (const [indicator, scopes] of Object.entries(promptDetails.missingResourceScopes)) {
          grant.addResourceScope(indicator, (scopes as Array<string>).join(' '));
        }
      }

      const result: InteractionResults = {};

      grantId = await grant.save();
      if (!interactionDetails.grantId) {
        // we don't have to pass grantId to consent, we're just modifying existing one
        result.consent = {
          grantId
        }
      }

      await oidcProvider.interactionFinished(req, res, result, { mergeWithLastSubmission: true });
    }))
    .get('/session', loginHandler, expressAsync(async (req, res) => {
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
    .post('/session/:slug/end', loginHandler, expressAsync(async (req, res) => {
      const sessionData = getSessionData(res)
      const sessionToEndUuid = slugToUuid(req.params.slug)
      deleteLoginSessionByUuid(db, sessionData.user.uuid, sessionToEndUuid)
      res.redirect('/session')
    }))
    .post('/session/end-all-others', loginHandler, expressAsync(async (req, res) => {
      const sessionData = getSessionData(res)
      deleteAllLoginSessionsExcept(
        db, sessionData.user.uuid, sessionData.loginSession.uuid
      )
      res.redirect('/session')
    }))
    .get('/subrequest-auth', expressAsync(async (req, res) => {
      console.log('subrequest-auth')
      console.log(req.headers)
      // TODO: Domain hardcoded
      res.cookie(getSubrequestDomainJwtKey('id.pfiers.net'), 'ffff', COOKIE_SEC_OPTIONS)
      res.send('ok')
      console.log('sent ok')
    }))

  // Admin routes
  addCrudRoutes(userCrudConfig, db, router, loginHandler, adminHandler)
  addCrudRoutes(clientCrudConfig, db, router, loginHandler, adminHandler)
  addCrudRoutes(subrequestDomainCrudConfig, db, router, loginHandler, adminHandler)

  const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
    if (err instanceof LastAdminException) {
      return next(new BadReq(
        'Cannot Delete Last Administrator',
        'Attempted to delete the last administrator or to revoke their administrator priviliges'
      ))
    } else if (err instanceof InvalidPasswordException) {
      return next(new BadReq(
        'Invalid Password',
        `Chosen password is invalid: ${err.reason}`
      ))
    } else if (err instanceof InvalidLoginJwtException) {
      res.clearCookie(LOGIN_SESSION_TOKEN_KEY)
      return next(new BadReq(
        'Invalid Login Token',
        `Login token is invalid.\nCookie has been cleared. Please reload.`
      ))
    }
    next(err)
  }
  router.use(errorHandler)

  return router
}
