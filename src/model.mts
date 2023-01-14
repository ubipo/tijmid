import { CrudConfig, CrudField, CrudFieldShown, CrudFieldType, Generated, Required, UICrudConfig } from "./crudConfig.mjs";
import { isLastAdmin } from "./db/lastAdmin.mjs";
import { normalizeDomain } from "./util/domains.mjs";
import { generateUuid, slugToUuid, Uuid, uuidToSlug, uuidToString } from "./util/uuidUtil.mjs";


export interface User {
  uuid: Uuid
  username: string
  passwordHash: string
  isAdmin: boolean
  fullName?: string
  nickname?: string
  email?: string
}

export class LastAdminException extends Error { name = this.constructor.name }

export const userCrudConfig = new UICrudConfig<User>(
  'User',
  'Users',
  u => u.username,
  '/user',
  '/user/:slug',
  u => `/user/${uuidToSlug(u.uuid)}`,
  urlParams => ({ uuid: slugToUuid(urlParams.slug) }),
  {
    uuid:         new CrudField('UUID',      'uuid',         CrudFieldType.Uuid,     new Generated(generateUuid), CrudFieldShown.ForIdentification),
    username:     new CrudField('Username',  'username',     CrudFieldType.String,   Required,                    CrudFieldShown.InList),
    passwordHash: new CrudField('Password',  'passwordHash', CrudFieldType.Password, Required),
    isAdmin:      new CrudField('Is admin',  'isAdmin',      CrudFieldType.Bool,     Required,                    CrudFieldShown.InList),
    fullName:     new CrudField('Full name', 'fullName',     CrudFieldType.String,   null),
    nickname:     new CrudField('Nickname',  'nickname',     CrudFieldType.String,   null),
    email:        new CrudField('Email',     'email',        CrudFieldType.String,   null),
  },
  'uuid = :uuid',
  (db, user) => {
    if (!user.isAdmin && isLastAdmin(db, user.uuid)) {
      throw new LastAdminException()
    }
  },
  (db, user) => {
    if (isLastAdmin(db, user.uuid)) {
      throw new LastAdminException()
    }
  }
)

export interface OidcClient {
  uuid: Uuid
  id: string
  name: string
  secret: string
  redirectUris: string[]
  postLogoutRedirectUris: string[]
  requirePkce: boolean
}

export const clientCrudConfig = new UICrudConfig<OidcClient>(
  'Client',
  'Clients',
  c => c.name,
  '/client',
  '/client/:slug',
  c => `/client/${uuidToSlug(c.uuid)}`,
  urlParams => ({ uuid: slugToUuid(urlParams.slug) }),
  {
    uuid:                   new CrudField('UUID',                      'uuid',         CrudFieldType.Uuid,      new Generated(generateUuid), CrudFieldShown.ForIdentification),
    name:                   new CrudField('Name',                      'name',         CrudFieldType.String,    Required,                    CrudFieldShown.InList),
    id:                     new CrudField('ID',                        'id',           CrudFieldType.String,    Required,                    CrudFieldShown.InList),
    secret:                 new CrudField('Secret',                    'secret',       CrudFieldType.String,    Required),
    redirectUris:           new CrudField('Redirect URIs',             'redirectUris', CrudFieldType.StringArr, Required),
    postLogoutRedirectUris: new CrudField('Post-logout Redirect URIs', 'postLogoutRedirectUris', CrudFieldType.StringArr, Required),
    requirePkce:            new CrudField('Require PKCE',              'requirePkce',  CrudFieldType.Bool,      Required),
  },
  'uuid = :uuid'
)

export interface SubrequestDomain {
  domain: string
}

export const subrequestDomainCrudConfig = new UICrudConfig<SubrequestDomain>(
  'Subrequest Domain',
  'Subrequest Domains',
  c => c.domain,
  '/subrequest-domain',
  '/subrequest-domain/:domain',
  c => `/subrequest-domain/${encodeURIComponent(c.domain)}`,
  urlParams => ({ domain: decodeURIComponent(urlParams.domain) }),
  {
    domain: new CrudField('Domain', 'domain', CrudFieldType.String, Required, CrudFieldShown.InList, normalizeDomain),
  },
  'domain = :domain'
)

export interface LoginSession {
  uuid: Uuid
  token: Buffer
  user: Uuid
  created: number
  ipAddress: string
}

export const loginSessionCrudConfig = new CrudConfig<LoginSession>(
  'Login Session',
  'Login Sessions',
  c => uuidToString(c.uuid),
  {
    uuid:      new CrudField('UUID',       'uuid',      CrudFieldType.Uuid,      new Generated(generateUuid), CrudFieldShown.ForIdentification),
    token:     new CrudField('Token',      'token',     CrudFieldType.String,    Required),
    user:      new CrudField('User',       'user',      CrudFieldType.Uuid,      Required),
    created:   new CrudField('Created',    'created',   CrudFieldType.Timestamp, Required),
    ipAddress: new CrudField('IP Address', 'ipAddress', CrudFieldType.String,    Required),
  },
  'domain = :domain'
)
