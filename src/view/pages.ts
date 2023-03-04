import { page } from "./base.js";
import { escapeHtml, html } from "./html.js"
import { CrudConfig, CrudField, CrudFieldShown, CrudFieldType, Generated, UICrudConfig } from "../crudConfig.js";
import { LoginSession, OidcClient, User } from "../model.js";
import { ErrorOut } from "oidc-provider";
import { uuidToSlug, uuidToString } from "../util/uuidUtil.js";
import { LoginSessionWithGrants } from "../db/loginSession.js";
import { taiToISO8601 } from "../util/datetime.js";
import { Ip2asn } from "../service/ip2asn.js";
import { createSvgMap } from "./svgMap.js";
import { extract } from "../util/array.js";


const navList = (
  currentPageName: string, routes: string[][]
) => html`
  <ul>
    ${routes.map(([href, name]) => html`
      <li>
        ${name === currentPageName ? name : html`<a href="${href}">${name}</a>`}
      </li>
    `).join('\n')}
  </ul>
`

const nav = (user: User, current: string) => {
  const userNavRoutes = [
    ['/', 'Home'],
    ['/session', 'Sessions'],
  ]
  const adminNavRoutes = [
    ['/user', 'Users'],
    ['/client', 'Clients'],
    ['/subrequest-host', 'Subrequest Hosts'],
  ]
  return html`
    <nav>
      ${navList(current, userNavRoutes)}
      ${user.isAdmin
        ? navList(current, adminNavRoutes)
        : ''
      }
    </nav>
  `
}

export const home = (user: User) => page("Home", html`
  ${nav(user, 'Home')}
  <p>Logged in as: ${escapeHtml(user.username)}</p>
  <form method="post" action="/logout">
    <button type="submit">Logout</button>
  </form>
`)

export const login = () => {
  return page("Login", html`
    <form method="post">
      <label>
        Username
        <input type="text" name="username" autofocus>
      </label>
      <label>
        Password
        <input type="password" name="password">
      </label>
      <button type="submit">Login</button>
    </form>
  `)
}

export interface ConsentParams {
  loginSession: LoginSession,
  user: User,
}

export interface OidcConsentParams extends ConsentParams {
  client: OidcClient,
  params: any,
  details: any,
  missingScopesClaims: { [key: string]: null | string[] },
}

export interface SubrequestAuthConsentParams extends ConsentParams {
  host: string,
  token: string,
}

export const ACTION_FORM_KEY = 'action'
export const ACTION_CONSENT = 'consent'
export const ACTION_DENY = 'deny'
export const TOKEN_FORM_KEY = 'token'

export const consent = (
  consentParams: OidcConsentParams | SubrequestAuthConsentParams
) => {
  const { user } = consentParams
  let content = html`
    <p>
      You are logged in as <i>${escapeHtml(user.username)}</i>.
    </p>
  `
  if ('client' in consentParams) {
    const { client, params, details, missingScopesClaims } = consentParams
    const hasPreviouslyGranted = [
      details.missingOIDCScope,
      details.missingOIDCClaims,
      details.missingResourceScopes
    ].filter(missing => Boolean(missing)).length === 0
    content += hasPreviouslyGranted
      ? html`
        <p>
          Do you want to confirm a previously given authorization 
          for <i>${escapeHtml(client.name)}</i> (the client).
        </p>
      `
      : html`
        <p>
          Do you want to give <i>${escapeHtml(client.name)}</i> (the client)
          access to the following?
        </p>
      `

    content += html`
      <p><i>
        Scopes are collections of claims. <br>
        Claims are rights or pieces of information granted/released to the client.
      </i></p>
    `
    const missingScopesWithClaims = Object.entries(missingScopesClaims)
    if (missingScopesWithClaims.length > 0) {
      const missingScopesHtml = missingScopesWithClaims
        .map(([scope, claims]) => html`
          <li>
            ${escapeHtml(scope)}
            ${
              claims == null || claims.length === 0
              ? ''
              : html`
                <br>&nbsp;<i>Includes</i>: ${claims.map(escapeHtml).join(', ')}
              `
            }
          </li>
        `)
        .join('\n')
      content += html`
        <h2>Scopes:</h2>
        <ul>
          ${missingScopesHtml}
        </ul>
      `
    } else {
      content += html`<p><i>No scopes requested</i></p>`
    }

    const missingOIDCClaims = new Set(details.missingOIDCClaims);
    ['sub', 'sid', 'auth_time', 'acr', 'amr', 'iss'].forEach(
      claim => missingOIDCClaims.delete(claim)
    )

    if (missingOIDCClaims.size > 0) {
      const missingClaimsHtml = Array.from(missingOIDCClaims)
        .map((claim) => html`<li>${String(claim)}</li>`)
        .join('\n')
      content += html`
        <h2>Claims:</h2>
        <ul>
          ${missingClaimsHtml}
        </ul>
      `
    } else {
      content += html`<p><i>No claims requested</i></p>`
    }

    const missingResourceScopes = details.missingResourceScopes
    if (missingOIDCClaims.size > 0) {
      content += Object.entries(missingResourceScopes).map(([indicator, scopes]) => {
        const scopesHtml = Array.from(scopes as any)
          .map((scope) => html`<li>${String(scope)}</li>`)
          .join('\n')
        return html`
          <h2>Resource scope: ${indicator}<h2>
          <ul>
            ${scopesHtml}
          </lu>
        `
      }).join('\n')
    } else {
      content += html`<p><i>No resource scopes requested</i></p>`
    }

    if (params.scope && params.scope.includes('offline_access')) {
      const previouslyGrantedOfflineAccess = (!details.missingOIDCScope) || !details.missingOIDCScope.includes('offline_access')
      content += html`
        <p>
          The client is asking to have offline access to this authorization
          ${previouslyGrantedOfflineAccess
            ? "(which you've previously granted)"
            : ''
          }
        </p>
      `
    } else {
      content += html`<p><i>No offline access requested</i></p>`
    }
  } else {
    const { host } = consentParams
    content += html`
      <p>
        Do you want to log in to ${escapeHtml(host)} with this account?
      </p>
    `
  }

  // TODO: Add CSRF protection
  content += html`
    <form method="post">
      ${'token' in consentParams
        ? html`<input type="hidden" name="${TOKEN_FORM_KEY}" value="${consentParams.token}">`
        : ''}
      <button autofocus type="submit" name="${ACTION_FORM_KEY}" value="${ACTION_DENY}">
        Deny access
      </button>
      <button autofocus type="submit" name="${ACTION_FORM_KEY}" value="${ACTION_CONSENT}">
        Consent to access
      </button>
    </form>
  `

  return page("Consent", content)
}

function crudRow<T>(config: UICrudConfig<T>, object: T) {
  const fieldDataCalumns = config.fields
    .filter(f => f.shown === CrudFieldShown.InList)
    .map(f =>`<td>${escapeHtml(f.toDisplayString(object))}</td>`)
    .join('\n')
  const objectUrl = config.objectUrl(object)
  return html`
    <tr>
      ${fieldDataCalumns}
      <td>
        <a href="${objectUrl}/delete">delete</a>
        <a href="${objectUrl}/edit">edit</a>
      </td>
    </tr>
  `;
}

export function crudTable<T>(config: UICrudConfig<T>, objects: T[]) {
  if (objects.length === 0) {
    return html`<p><i>No ${config.titlePlural.toLowerCase()}</i></p>`
  }

  const fieldHeaders = config.fields
    .filter(f => f.shown === CrudFieldShown.InList)
    .map(f => html`<th>${escapeHtml(f.name)}</th>`)
    .join('\n')
  const dataRows = objects.map(o => crudRow(config, o)).join('\n')
  return html`
    <table>
      <tr>
        ${fieldHeaders}
        <th>Actions</th>
      </tr>
      ${dataRows}
    </table>
  `
}

export function crudFieldToFormInputValueAttribute<T>(
  field: CrudField<T>, existingObject?: T
) {
  if (existingObject == null) return ''
  const value = existingObject[field.key] as unknown
  if (value == null) return ''
  switch (field.type) {
    case CrudFieldType.Password: return ''
    case CrudFieldType.Bool: return value ? 'checked' : ''
    case CrudFieldType.String:
      return `value="${escapeHtml(value as string)}"`
    case CrudFieldType.Uuid:
      return `value="${uuidToString(value as Buffer)}"`
    default: throw new Error()
  }
}

export function crudFieldToFormInput<T>(
  field: CrudField<T>, existingObject?: T
) {
  const nameAttribute = `name="${field.nameKebab}"`
  if (field.type === CrudFieldType.StringArr) {
    return html`<textarea ${nameAttribute}>${
      existingObject ? field.toDisplayString(existingObject) : ''
    }</textarea>`
  }

  const typeValue = (() => { switch (field.type) {
    case CrudFieldType.String: return 'text'
    case CrudFieldType.Password: return 'password'
    case CrudFieldType.Bool: return 'checkbox'
    case CrudFieldType.Uuid: return 'text'
    default: throw new Error()
  }})()

  return html`<input
    type="${typeValue}"
    ${nameAttribute}
    ${crudFieldToFormInputValueAttribute(field, existingObject)}>
  `
}

function crudInputs<T>(config: CrudConfig<T>, existingObject?: T) {
  return config.fields
    .filter(field => !(field.defaultVal instanceof Generated))
    .map(field => {
      const formInput = crudFieldToFormInput(field, existingObject)
      return html`
        <label>
          ${field.type === CrudFieldType.Bool
              ? formInput + field.name
              : field.name + formInput}
        </label>
      `
    })
    .join('\n')
}

export function crudList<T>(config: UICrudConfig<T>, user: User, objects: T[]) {
  return page(config.titlePlural , html`
    ${nav(user, config.titlePlural)}
    <h2>${config.titlePlural}</h2>
    ${crudTable(config, objects)}
    <h2>Add ${config.title.toLowerCase()}</h2>
    <form method="post">
      ${crudInputs(config)}
      <button type="submit">Add</button>
    </form>
  `)
}

function getIdentificationSection<T>(config: CrudConfig<T>, object: T) {
  return config.fields
    .filter(f => f.showForIdentification)
    .map(f => html`<p>${f.name}: ${escapeHtml(f.toDisplayString(object))}</p>`)
    .join('\n')
}

export function crudDelete<T>(config: CrudConfig<T>, object: T) {
  return page(
    `Delete ${config.title.toLowerCase()} ${escapeHtml(config.objectName(object))}?`,
    html`
      ${getIdentificationSection(config, object)}
      <form method="post">
        <label>
          <input type="checkbox" name="dropDependencies">
          Also delete dependencies
        </label>
        <button type="submit">Delete</button>
      </form>
    `
  )
}

export function crudEdit<T>(config: CrudConfig<T>, object: T) {
  return page(
    `Edit ${config.title.toLowerCase()} ${escapeHtml(config.objectName(object))}`,
    html`
      ${getIdentificationSection(config, object)}
      <form method="post">
        ${crudInputs(config, object)}
        <button type="submit">Edit</button>
      </form>
    `
  )
}

export function rpInitiatedLogoutConfirm<T>(
  siteName: string, formOpen: string, formClose: string
) {
  return page(
    `Log out?`,
    html`
    <p>Do you want to log out from ${siteName}?</p>
    ${formOpen}
      <button type="submit" name="logout" value="no">Stay logged in</button>
      <button type="submit" name="logout" value="yes">Log out</button>
    ${formClose}
    `
  )
}

export const error = (
  pageTitle: string, statusCode: number, message: string
) => page(escapeHtml(pageTitle), html`
  <h2>${escapeHtml(message).replaceAll('&#10;', '<br>')}</h2>
  <img crossorigin="anonymous" src="/httpcat/${statusCode.toString()}.jpg">
`)

export const oidcError = (
  pageTitle: string, statusCode: number, out: ErrorOut
) => {
  const infoMapHtml = Object.entries(out)
    .map(([key, value]) => `
      <pre><strong>${key}</strong>: ${escapeHtml(value)}</pre>
    `)
    .join('\n')
  return page(escapeHtml(pageTitle), html`
    <p>${infoMapHtml}</p>
    <img crossorigin="anonymous" src="/httpcat/${statusCode.toString()}.jpg">
  `)
}

export async function sessionDetails(
  session: LoginSessionWithGrants,
  ip2asn: Ip2asn,
  countriesGeoJson: any,
  extraButtons: string = ''
) {
  const ipAddressAs = await ip2asn.ipAddressToAs(session.ipAddress)
  const asInfoStr = ipAddressAs != null
    ? html`${ipAddressAs.countryCode} <i>${escapeHtml(ipAddressAs.asDescription)}</i>`
    : html`<i>unknown location</i>`
  const svgMap = ipAddressAs != null
    ? createSvgMap(countriesGeoJson, ipAddressAs?.countryCode)
    : null
  
  const sessionSummary = html`
    <span>Created: ${taiToISO8601(session.created)}</span>
    <span>IP address: ${session.ipAddress}</span>
    <details open>
      <summary>Location: ${asInfoStr}</summary>
      ${svgMap ?? ''}
    </details>
  `

  const subrequestHostsDetails = session.subrequestHosts.length > 0
    ? html`
      <details open>
        <summary>${String(session.subrequestHosts.length)} host grants</summary>
          <ul>
          ${session.subrequestHosts.map(d => html`
            <li>${d}</li>
          `).join('\n')}
          </ul>
      </details>
    `
    : ''

  return html`
    ${sessionSummary}
    ${subrequestHostsDetails}
    <div class="session-buttons">
      <form method="post" action="session/${uuidToSlug(session.uuid)}/end">
        <button type="submit">End session</button>
      </form>
      ${extraButtons}
    </div>
  `
}

export async function sessions(
  user: User,
  currentLoginSession: LoginSession,
  loginSessionsWithGrants: LoginSessionWithGrants[],
  ip2asn: Ip2asn,
  countriesGeoJson: any
) {
  const [currentSessionWithGrants, otherSessions] = extract(
    loginSessionsWithGrants,
    s => s.uuid.equals(currentLoginSession.uuid)
  )
  return page("Sessions", html`
    <style>
      .session-details {
        display: flex;
        flex-direction: column;
      }
      .session-buttons { 
        display: flex;
        flex-direction: row;
      }
      .other-sessions {
        padding-right: 1.2em;
      }
    </style>
    ${nav(user, 'Sessions')}
    <h2>Sessions</h2>
    <section>
      <h3>Current session</h3>
      <div class="session-details">
        ${await sessionDetails(
          currentSessionWithGrants,
          ip2asn,
          countriesGeoJson,
          otherSessions.length > 0
            ? html`
              <form method="post" action="session/end-all-others">
                <button type="submit">End all other sessions</button>
              </form>
            `
            : ''
        )}
      </div>
    </section>
    ${otherSessions.length > 0
      ? html`
        <section>
          <h3>Other sessions</h3>
          <ul class="other-sessions">
          ${(await Promise.all(otherSessions.map(async (s) => html`
            <li>
              <div class="session-details">
                ${await sessionDetails(s, ip2asn, countriesGeoJson)}
              </div>
            </li>
          `))).join('\n')}
          </ul>
        </section>
      `
      : ''
    }
  `);
}
