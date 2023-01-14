import { Provider, errors as oidcErrors, Configuration, KoaContextWithOIDC } from "oidc-provider";
import createOidcAdapter from "./db/oidcAdapter.mjs"
import { Database } from "better-sqlite3";
import * as dbSecret from "./db/secret.mjs";
import * as pages from "./view/pages.mjs"
import { generateJwtSecret, LOGIN_SESSION_TOKEN_KEY } from "./util/jwt.mjs";
import { crudDelete, crudGet } from "./db/crud.mjs";
import { uuidFromString, uuidToString } from "./util/uuidUtil.mjs";
import { User, clientCrudConfig, userCrudConfig, loginSessionCrudConfig } from "./model.mjs";
import * as dbInvalidatedTokens from "./db/invalidatedTokens.mjs"
import { generateJwks } from "./util/jwks.mjs";
import { LoginRequired, sessionDataFromToken } from "./util/session.mjs";


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
  db: Database,
  public_base_url: string
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
  const provider = new Provider(public_base_url, config)
  provider.on('end_session.success', (ctx: KoaContextWithOIDC) => {
    const sessionData = sessionDataFromToken(db, ctx.cookies.get(LOGIN_SESSION_TOKEN_KEY))
    if (sessionData instanceof LoginRequired) { return }
    const token = sessionData.loginSession.token
    crudDelete(loginSessionCrudConfig, db, { token }, 'token = :token')
    ctx.cookies.set(LOGIN_SESSION_TOKEN_KEY, null)
  })
  return { config, provider }
}
