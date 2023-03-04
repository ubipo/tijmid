import { Database, SqliteError } from "better-sqlite3"
import { Router } from "express"
import { UICrudConfig } from "../crudConfig.js"
import { crudAll, crudInsert, crudGet, crudDeletePK, crudEdit } from "../db/crud.js"
import { getSessionData } from "../service/loginSession.js"
import { expressAsync } from "../util/expressAsync.js"
import { RequestHandler } from "../util/expressTypes.js"
import { NotFound, ForbiddenReq } from "../util/ReqError.js"
import * as pages from "../view/pages.js"
import urlencodedParser from "./urlencodedParser.js"

function crudWhereParamsIdentificationString(
  whereParams: Record<string, string | number | boolean>
) {
  return Object.entries(whereParams).map(([key, value]) => {
    if (Buffer.isBuffer(value)) {
      return `${key}=${value.toString('hex')}`
    }
    return `${key}=${value}`
  }).join(', ')
}

export function createCrudRouter<T>(
  config: UICrudConfig<T>,
  db: Database,
  ...handlers: RequestHandler[]
) {
  return Router()
    .use(...handlers)
    .get(config.collectionUrl, expressAsync((_req, res) => {
      const sessionData = getSessionData(res)
      const objects = crudAll(config, db)
      res.send(pages.crudList(config, sessionData.user, objects))
    }))
    .post(config.collectionUrl, urlencodedParser, expressAsync(async (req, res) => {
      const object = await config.fromParams(req.body)
      crudInsert(config, db, object)
      res.redirect(303, "")
    }))
    .get(`${config.objectTemplateUrl}/delete`, (req, res) => {
      const whereParams = config.objectUrlParamsToWhereParams(req.params)
      const object = crudGet(config, db, whereParams)
      if (object == null) throw new NotFound(
        `${config.title} by ${crudWhereParamsIdentificationString(whereParams)}`, ''
      )
      res.send(pages.crudDelete(config, object))
    })
    .post(`${config.objectTemplateUrl}/delete`, urlencodedParser, expressAsync(async (req, res) => {
      const dropDependencies = ['true', '1', 'on'].includes(String(req.body.dropDependencies).toLowerCase())
      const whereParams = config.objectUrlParamsToWhereParams(req.params)
      const state = (() => { try {
        return crudDeletePK(config, db, whereParams, dropDependencies) ? 'deleted' : 'not found'
      } catch (error) {
        console.log('Caught crudDeletePK error: ', error, (error as any).code)
        if (error instanceof SqliteError && error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
          return 'used'
        }
        throw error
      } })()
      if (state == 'not found') throw new NotFound(
        `${config.title} by ${crudWhereParamsIdentificationString(whereParams)}`, ''
      )
      if (state == 'used') throw new ForbiddenReq(
        `${config.title} by ${crudWhereParamsIdentificationString(whereParams)} is still used`, ''
      )
      res.redirect(303, "..")
    }))
    .get(`${config.objectTemplateUrl}/edit`, (req, res) => {
      const whereParams = config.objectUrlParamsToWhereParams(req.params)
      const object = crudGet(config, db, whereParams)
      if (object == null) throw new NotFound(
        `${config.title} by ${crudWhereParamsIdentificationString(whereParams)}`, ''
      )
      res.send(pages.crudEdit(config, object))
    })
    .post(`${config.objectTemplateUrl}/edit`, urlencodedParser, expressAsync(async (req, res) => {
      const whereParams = config.objectUrlParamsToWhereParams(req.params)
      const previous = crudGet(config, db, whereParams)
      const object = await config.fromParams(req.body, previous ?? undefined)
      const deleted = await crudEdit(config, db, object)
      if (!deleted) throw new NotFound(
        `${config.title} by ${crudWhereParamsIdentificationString(whereParams)}`, ''
      )
      res.redirect(303, "..")
    }))
}
