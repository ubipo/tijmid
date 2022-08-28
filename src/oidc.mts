import { Provider, errors as oidcErrors, Configuration } from "oidc-provider";
import createOidcAdapter from "./db/oidcAdapter.mjs"
import { Database } from "better-sqlite3";
import * as dbSecret from "./db/secret.mjs";
import * as pages from "./view/pages.mjs"
import { generateJwtSecret, LoginRequired, LOGIN_JWT_KEY, sessionFromLoginJwt } from "./util/jwt.mjs";
import { crudGet } from "./db/crud.mjs";
import { uuidFromString, uuidToString } from "./util/uuidUtil.mjs";
import { User, clientCrudConfig, userCrudConfig } from "./model.mjs";
import * as dbInvalidatedTokens from "./db/invalidatedTokens.mjs"
import { generateJwks } from "./util/jwks.mjs";


export const OIDC_COOKIE_NAMES = {
  session: 'oidc_session',
  interaction: 'oidc_interaction',
  resume: 'oidc_interaction_resume',
  state: 'oidc_state',
}

export function userToClaims(user: User) {
  const id = uuidToString(user.uuid)
  const now = Math.floor(Date.now() / 1000)
  return {
    sub: id,
    accountId: id,
    acr: '0',
    remember: true,
    ts: now,
    email: user.email,
    email_verified: true,
    name: user.fullName,
    nickname: user.nickname,
    preferred_username: user.username,
    updated_at: now,
  }
}

export async function createOidcProvider(
  db: Database, public_base_url: string, loginJwtSecret: string
) {
  const jwks = await dbSecret.getOrElseSet(
    db, 'OIDC JWKS', generateJwks, JSON.stringify, JSON.parse
  )
  const oidcJwtSecret = await dbSecret.getOrElseSet(
    db, 'OIDC JWT Secret', async () => generateJwtSecret(), s => s, s => s
  )
  
  const config: Configuration = {
    features: {
      devInteractions: { enabled: false },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource(ctx, form) {
          const iFormEnd = form.indexOf('</form>')
          const formOpen = form.slice(0, iFormEnd)
          const formClose = form.slice(iFormEnd)
          ctx.body = pages.rpInitiatedLogoutConfirm(ctx.host, formOpen, formClose)
        },
        onConfirmed(ctx) {
          const session = sessionFromLoginJwt(db, loginJwtSecret, ctx.cookies.get(LOGIN_JWT_KEY))
          if (session instanceof LoginRequired) { return }
          dbInvalidatedTokens.invalidate(db, session.tokenUuid, session.tokenExp)
          ctx.cookies.set(LOGIN_JWT_KEY, null)
        },
      }
    },
    cookies: {
      keys: [oidcJwtSecret],
      names: OIDC_COOKIE_NAMES
    },
    jwks,
    adapter: createOidcAdapter(db),
    clients: [], // Stored in database via `adapter`
    pkce: {
      methods: ['S256'],
      required(ctx, client) {
        const oidcClient = crudGet(
          clientCrudConfig, db, { id: client.clientId }, 'id = :id'
        )
        if (oidcClient == null) {
          throw new Error(`No such client: ${client.clientId}`)
        }
        return oidcClient.requirePkce
      },
    },
    conformIdTokenClaims: false,
    claims: {
      // claims={"id_token":{"email":null,"name":null,"quota":null},"userinfo":{"email":null,"name":null,"quota":null}}
      auth_time: null,
      iss: null,
      sid: null,
      openid: ['sub'],
      id_token: ['email', 'name', 'quota'],
      userinfo: ['email', 'name', 'quota'], // https://github.com/nextcloud/user_oidc
      // address: ['address'],
      email: ['email', 'email_verified'],
      phone: ['phone_number', 'phone_number_verified'],
      // profile: ['birthdate', 'family_name', 'gender', 'given_name', 'locale', 'middle_name', 'name',
      //   'nickname', 'picture', 'preferred_username', 'profile', 'updated_at',
      //   'website', 'zoneinfo'],
      profile: ['name', 'nickname', 'preferred_username', 'updated_at'],
    },
    findAccount: async (_ctx, id) => ({
      accountId: id,
      claims: async (use, scope, claims, rejected) => {
        const user = crudGet(userCrudConfig, db, { uuid: uuidFromString(id) })
        if (user == null) {
          throw new Error(`Cannot find user by uuid: ${id}`)
        }
        const claimValues = userToClaims(user)
        return claimValues
      }
    }),
    interactions: {
      url: async (_ctx, interaction) => {
        const promptName = interaction.prompt.name
        if (!['login', 'consent'].includes(promptName)) {
          throw new Error(`Unknown interaction prompt: ${promptName}`)
        }
        return `/${promptName}`
      }
    },
    renderError(ctx, out, error) {
      if (error instanceof oidcErrors.InvalidRequest && error.statusCode === 404) {
        ctx.status = 404
        ctx.body = pages.error(
          'Not Found', 404, `No such route: ${ctx.method} ${ctx.URL.pathname}`
        )
        return
      }

      if (error instanceof oidcErrors.OIDCProviderError) {
        console.error(error)
        ctx.type = 'html'
        ctx.body = pages.oidcError(
          "OIDC Error",
          error.statusCode,
          out
        )
        return
      }

      console.error('Unknown OIDC Error')
      console.error(error)
      ctx.type = 'html'
      ctx.body = pages.error("OIDC Error", 500, "OIDC Error")
    },
  }
  return { config, provider: new Provider(public_base_url, config) }
}
