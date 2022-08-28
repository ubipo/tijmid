import { page } from "./base.mjs";
import { escapeHtml, html } from "./html.mjs"
import { CrudConfig, CrudField, CrudFieldShown, CrudFieldType, CrudInput, Generated } from "../crudConfig.mjs";
import { OidcClient, User } from "../model.mjs";
import { ErrorOut } from "oidc-provider";
import { uuidToString } from "../util/uuidUtil.mjs";


const nav = (current: string) => {
  const lis = [
    ['/', 'Home'], ['/user', 'Users'], ['/client', 'Clients']
  ].map(([href, name]) => {
    if (name === current) return html`<li>${name}</li>`
    return html`<li><a href="${href}">${name}</a></li>`
  }).join('\n')
  return html`
    <nav>
      <ul>
        ${lis}
      </ul>
    </nav>
  `
}

export const home = (user: User) => page("Home", html`
  ${nav('Home')}
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

export const consent = (
  client: OidcClient, params: any, details: any,
  missingScopesClaims: { [key: string]: null | string[] }
) => {
  let content = ''
  if ([details.missingOIDCScope, details.missingOIDCClaims, details.missingResourceScopes].filter(Boolean).length === 0) {
    content += html`
      <p>
        Do you want to confirm a previously given authorization 
        for <i>${escapeHtml(client.name)}</i> (the client).
      </p>
    `
  } else {
    content += html`
      <p>
        Do you want to give <i>${escapeHtml(client.name)}</i> (the client)
        access to the following?
      </p>
    `
  }

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

  content += html`
    <form method="post">
      <button autofocus type="submit" name="action" value="deny">
        Deny access
      </button>
      <button autofocus type="submit" name="action" value="consent">
        Consent to access
      </button>
    </form>
  `

  return page("Consent", content)
}

function crudRow<T>(config: CrudConfig<T>, object: T) {
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
    .map(field => html`
      <label>
        ${field.name}
        ${crudFieldToFormInput(field, existingObject)}
      </label>
    `)
    .join('\n')
}

export function crudList<T>(config: CrudConfig<T>, objects: T[]) {
  const dataHeaders = config.fields
    .filter(f => f.shown === CrudFieldShown.InList)
    .map(f => f.name)
  const ths = [...dataHeaders, 'Actions']
    .map(headerString => html`<th>${headerString}</th>`)
    .join('\n')
  return page(config.titlePlural , html`
    ${nav(config.titlePlural)}
    <h2>${config.titlePlural}</h2>
    <table>
      <thead>
        <tr>
          ${ths}
        </tr>
      </thead>
      <tbody>
        ${objects.map(o => crudRow(config, o)).join("")}
      </tbody>
    </table>
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