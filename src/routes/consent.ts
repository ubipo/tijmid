import endent from "endent"
import { Router } from "express"
import OidcProvider, { InteractionResults, Configuration } from "oidc-provider"
import { crudGet } from "../db/crud.js"
import { clientCrudConfig, LoginSession, subrequestAuthHostCrudConfig } from "../model.js"
import { getSessionData } from "../service/loginSession.js"
import { expressAsync } from "../util/expressAsync.js"
import { getMaybeOneSearchParam, getParams } from "../util/params.js"
import { ReqError, BadReq } from "../util/ReqError.js"
import { uuidFromString, uuidToString } from "../util/uuidUtil.js"
import { escapeHtml } from "../view/html.js"
import { loginHandler } from "./accessHandlers.js"
import { SUBREQUEST_AUTH_NEXT_URL_QUERY_PARAM_KEY, SUBREQUEST_AUTH_TOKEN_QUERY_PARAM_KEY } from "./commonKeys.js"
import urlencodedParser from "./urlencodedParser.js"
import * as pages from "../view/pages.js"
import { Database } from "better-sqlite3"
import { EncryptJWT, jwtDecrypt } from "jose"
import { SubrequestAuthJwtPayload } from "../service/subrequest.js"
import { deleteLoginSessionSubrequestHost, insertLoginSessionSubrequestHost } from "../db/subrequestAuth.js"
import { urlToNormalizedHost } from "../util/url.js"

async function getSubrequestHostJwtPayload(
  loginSession: LoginSession,
  subrequestAuthIssuerUrn: string,
  subrequestHostJwtSecret: Buffer,
  token: string,
) {
  const payload = (await jwtDecrypt(token, subrequestHostJwtSecret, {
    issuer: subrequestAuthIssuerUrn,
    audience: subrequestAuthIssuerUrn,
  })).payload as SubrequestAuthJwtPayload
  if (!uuidFromString(payload.loginSession).equals(loginSession.uuid)) {
    throw new BadReq("Consent", "Invalid subrequest host JWT")
  }
  return payload
}

export function createConsentRouter(
  subrequestAuthIssuerUrn: string,
  subrequestHostJwtSecret: Buffer,
  db: Database,
  oidcConfig: Configuration,
  oidcProvider: OidcProvider,
) {
  return Router()
    .use(loginHandler)
    .get('/consent', expressAsync(async (req, res) => {
      const sessionData = getSessionData(res)
      const searchParams = new URL(req.url, 'http://dummy').searchParams
      const subrequestAuthNextUrlOrErr = getMaybeOneSearchParam(
        searchParams, SUBREQUEST_AUTH_NEXT_URL_QUERY_PARAM_KEY
      )
      if (subrequestAuthNextUrlOrErr instanceof ReqError) throw subrequestAuthNextUrlOrErr
      console.info('Consent flow for subrequest host: ', subrequestAuthNextUrlOrErr)
      if (subrequestAuthNextUrlOrErr != null) {
        const nextUrl = new URL(subrequestAuthNextUrlOrErr)
        const host = urlToNormalizedHost(nextUrl)
        const subrequestHostFromDb = crudGet(
          subrequestAuthHostCrudConfig, db, { host }, 'host = :host'
        )
        if (subrequestHostFromDb == null) {
          throw new BadReq("Consent", "Invalid subrequest host")
        }
        const tokenPayload: SubrequestAuthJwtPayload = {
          nextUrl: nextUrl.toString(),
          loginSession: uuidToString(sessionData.loginSession.uuid),
          iat: Math.floor(Date.now() / 1000),
        }
        const token = await new EncryptJWT(tokenPayload)
          .setProtectedHeader({ alg: 'dir', enc: 'A128CBC-HS256' })
          .setIssuer(subrequestAuthIssuerUrn)
          .setAudience(subrequestAuthIssuerUrn)
          .setExpirationTime('2h')
          .encrypt(subrequestHostJwtSecret)
        console.log('Subrequest host JWT: ', tokenPayload)
        const consentParams: pages.SubrequestAuthConsentParams = {
          loginSession: sessionData.loginSession,
          user: sessionData.user,
          host,
          token,
        }
        res.send(pages.consent(consentParams))
      } else {
        const { prompt, params } = await oidcProvider.interactionDetails(req, res);
        const clientId = params.client_id
        if (typeof clientId !== 'string') {
          throw new BadReq(
            'Consent',
            `Expected client_id to be a string but was ${typeof clientId} (${clientId})`
          )
        }
        const client = crudGet(clientCrudConfig, db, { id: clientId }, 'id = :id')
        if (client == null) {
          throw new BadReq(
            'Consent', `Could not find client for consent flow (${clientId})`
          )
        }
        const missingScopesClaims = Object.fromEntries(
          Array.from(prompt.details.missingOIDCScope as string[]).map(
            scope => [scope, oidcConfig.claims!![scope]]
          )
        )
        delete missingScopesClaims['openid']
        delete missingScopesClaims['offline_access']
        const consentParams: pages.OidcConsentParams = {
          loginSession: sessionData.loginSession,
          user: sessionData.user,
          client,
          params,
          details: prompt.details,
          missingScopesClaims,
        }
        res.send(pages.consent(consentParams))
      }
    }))
    .post('/consent', urlencodedParser, expressAsync(async (req, res) => {
      const sessionData = getSessionData(res)
      const { action, token } = getParams(
        "Consent", req.body,
        [pages.ACTION_FORM_KEY, [pages.TOKEN_FORM_KEY, false]]
      )
      const subrequestHostJwtPayload = token == null
        ? null
        : await getSubrequestHostJwtPayload(
          sessionData.loginSession,
          subrequestAuthIssuerUrn,
          subrequestHostJwtSecret,
          token
        )
      const isOidcConsent = subrequestHostJwtPayload == null
      console.log('POST /consent: ', action, token, 'isOidcConsent: ', isOidcConsent)
      
      if (action === pages.ACTION_DENY) {
        if (isOidcConsent) {
          const result: InteractionResults = {
            error: 'access_denied',
            error_description: 'User denied consent',
          }
          await oidcProvider.interactionFinished(
            req, res, result, { mergeWithLastSubmission: true }
          )
        } else {
          const nextUrl = new URL(subrequestHostJwtPayload.nextUrl)
          deleteLoginSessionSubrequestHost(db, sessionData.loginSession.uuid, nextUrl.host)
          res.send("Access denied")
        }
        return
      } else if (action !== pages.ACTION_CONSENT) {
        throw new BadReq(
          'Consent',
          endent`
            Parameter 'action' must be either 'consent' or 'deny' \
            (was: ${escapeHtml(action)}).
          `
        )
      }

      if (isOidcConsent) {
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
      } else {
        const nextUrl = new URL(subrequestHostJwtPayload.nextUrl)
        const host = urlToNormalizedHost(nextUrl)
        console.info(`Granting subrequest host access to ${host} for ${uuidToString(sessionData.user.uuid)}`)
        insertLoginSessionSubrequestHost(db, sessionData.loginSession.uuid, host)
        // The token will be picked up and stored in a cookie in the next
        // request to /subrequest-auth by the reverse proxy (e.g. NGINX).
        nextUrl.searchParams.set(SUBREQUEST_AUTH_TOKEN_QUERY_PARAM_KEY, token)
        res.redirect(302, nextUrl.toString())
      }
    }))
}