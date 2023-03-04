import { Database } from "better-sqlite3";
import { CrudConfig } from "../crudConfig.js";
import { sql } from "./sql.js";


export function crudColumnsClausePart<T>(
  config: CrudConfig<T>,
  tableAlias: string = ''
) {
  return config.fields.map(f => {
    return tableAlias.length > 0
      ? `${tableAlias}.${f.dbColumnName} ${tableAlias}_${f.dbColumnName}`
      : f.dbColumnName
  }).join(', ')
}

export function crudAll<T>(config: CrudConfig<T>, db: Database) {
  const rows = db.prepare(sql`SELECT * FROM ${config.dbTableName}`).all()
  return rows.map(r => config.fromDbRow(r))
}

export function crudGet<T>(
  config: CrudConfig<T>, db: Database, whereParams: Record<string, any>,
  whereClause = config.dbPkWhereClause
) {
  const row = db.prepare(sql`
    SELECT * FROM ${config.dbTableName} WHERE ${whereClause}
  `).all(whereParams)[0]
  if (row == null) return null
  return config.fromDbRow(row)
}

export async function crudInsert<T>(
  config: CrudConfig<T>, db: Database, object: T
) {
  const valuesClause = config.fields
    .map(f => `:${f.dbPlaceholderName}`).join(', ')
  db.prepare(sql`
    INSERT INTO ${config.dbTableName} (${crudColumnsClausePart(config)})
    VALUES (${valuesClause})
  `).run(config.toDbRow(object))
}

export async function crudEdit<T>(
  config: CrudConfig<T>, db: Database, object: T
) {
  config.preEdit?.(db, object)
  const sets = config.fields.map(
    f => `${f.dbColumnName} = :${f.dbPlaceholderName}`
  ).join(', ')
  const result = db.prepare(sql`
    UPDATE ${config.dbTableName} SET ${sets} WHERE ${config.dbPkWhereClause}
  `).run(config.toDbRow(object))
  if (result.changes == 0) return null
  return object
}

export function crudDeletePK<T>(
  config: CrudConfig<T>,
  db: Database,
  whereParams: Record<string, any>,
  dropDependencies = false
) {
  const object = crudGet(config, db, whereParams)
  if (object == null) return null
  config.preDelete?.(db, object, dropDependencies)
  const result = db.prepare(sql`
    DELETE FROM ${config.dbTableName} WHERE ${config.dbPkWhereClause}
  `).run(whereParams)
  return result.changes === 1
}

export async function crudDelete<T>(
  config: CrudConfig<T>,
  db: Database,
  whereParams: Record<string, any>,
  whereClause = config.dbPkWhereClause
) {
  const result = db.prepare(sql`
    DELETE FROM ${config.dbTableName} WHERE ${whereClause}
  `).run(whereParams)
  return result.changes
}
