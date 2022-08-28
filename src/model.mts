import { CrudConfig, CrudField, CrudFieldShown, CrudFieldType, Generated, Required } from "./crudConfig.mjs";
import { isLastAdmin } from "./db/lastAdmin.mjs";
import { generateUuid, slugToUuid, Uuid, uuidToSlug } from "./util/uuidUtil.mjs";


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

export const userCrudConfig = new CrudConfig<User>(
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

export const clientCrudConfig = new CrudConfig<OidcClient>(
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