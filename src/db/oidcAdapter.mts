import { Database } from "better-sqlite3"
import { sql } from "./sql.mjs"
import { Adapter, AdapterFactory, AdapterPayload, AllClientMetadata } from "oidc-provider"
import { crudGet } from "./crud.mjs"
import { OidcClient, clientCrudConfig } from "../model.mjs"


const TABLE = 'oidc_data'

function clientToAdapterPayload(
  client: OidcClient
): AllClientMetadata {
  return {
    client_id: client.id,
    client_secret: client.secret,
    client_name: client.name,
    requirePkce: client.requirePkce,
    redirect_uris: client.redirectUris,
    post_logout_redirect_uris: client.postLogoutRedirectUris,
  }
}

export default function createOidcAdapter(db: Database) {
  class SqliteOidcAdapter implements Adapter {
    // From: https://github.com/panva/node-oidc-provider/blob/main/example/my_adapter.js

    model: string

    constructor(name: string) {
      this.model = name
    }
  
    async upsert(id: string, payload: object, expiresIn: number) {
      const sessionUid = (payload as any).uid ?? null
      const grantId = (payload as any).grantId ?? null
      const userCode = (payload as any).userCode ?? null
      const expiration = Math.floor(Date.now() / 1000 + expiresIn)
      db.prepare(
        sql`REPLACE INTO ${TABLE} (
          model, id, payload, session_uid,
          user_code, grant_id, consumed, expiration
        ) VALUES (
          :model, :id, :payload, :sessionUid,
          :userCode, :grantId, :consumed, :expiration
        )`
      ).run({
        model: this.model, id, payload: JSON.stringify(payload), sessionUid,
        userCode, grantId, consumed: 0, expiration
      })
    }

    async findBy(key: string, value: string) {
      const row = db.prepare(
        sql`SELECT * FROM ${TABLE} WHERE model = :model AND ${key} = :value`
      ).all({ model: this.model, value })[0]
      if (row == null) return undefined
      const payload = JSON.parse(row.payload)
      payload.consumed = Boolean(row.consumed)
      return payload
    }
  
    async find(id: string) {
      return this.findBy('id', id)
    }

    async findByUserCode(userCode: string) {
      return this.findBy('user_code', userCode)
    }
  
    async findByUid(uid: string) {
      return this.findBy('session_uid', uid)
    }
  
    async consume(id: string) {
      db.prepare(
        sql`UPDATE ${TABLE} SET consumed = 1 WHERE model = :model AND id = :id`
      ).run({ model: this.model, id })
    }
  
    async destroy(id: string) {
      db.prepare(
        sql`DELETE FROM ${TABLE} WHERE model = :model AND id = :id`
      ).run({ model: this.model, id })
    }
  
    async revokeByGrantId(grantId: string) {
      db.prepare(
        sql`UPDATE ${TABLE} SET consumed = 1 WHERE model = :model AND grant_id = :grantId`
      ).run({ model: this.model, grantId })
    }
  }

  const notImplemented = () => { throw new Error("Method not implemented.") }

  class ClientsOidcAdapter implements Adapter {
    async find(id: string): Promise<void | AdapterPayload | undefined> {
      const client = crudGet(clientCrudConfig, db, { id }, 'id = :id')
      if (client == null) return undefined
      return clientToAdapterPayload(client)
    }
    upsert = notImplemented
    findByUserCode = notImplemented
    findByUid = notImplemented
    consume = notImplemented
    destroy = notImplemented
    revokeByGrantId = notImplemented
  }

  const factory: AdapterFactory = (name) => {
    const adapter = name === 'Client'
      ? ClientsOidcAdapter
      : SqliteOidcAdapter

    return new adapter(name)
  }
  
  return factory
}
