import { Database } from "better-sqlite3"

import { hashPassword } from "./util/password.mjs"
import { Uuid, uuidToString } from "./util/uuidUtil.mjs"


export interface CrudInput<T> {
  label: string,
  type: string,
  name: string,
  value: (existingObject: T) => string | boolean | undefined,
  required: boolean,
}

export interface DbColumn {
  name: string,
  placeholder: string
}

export const Required = Symbol('required')
export class Generated {
  constructor(public generate: () => any) { }
}

export enum CrudFieldType {
  String,
  StringArr,
  Password,
  Bool,
  Uuid
}

export enum CrudFieldShown {
  /** Show this property in a list view (implies `ForIdentification`) */
  InList,
  /** Show this property when it's important to be able to accurately identify
   * the object (e.g. when deleting) */
  ForIdentification
}

function wordToTitleCase(word: string) {
  return word.slice(0, 1).toUpperCase() + word.slice(1)
}

function splitSpaced(str: string) { return str.toLowerCase().split(/\s|-/) }
function spacedCaseToKebab(str: string) { return splitSpaced(str).join('-') }
function spacedCaseToSnake(str: string) { return splitSpaced(str).join('_') }
function spacedCaseToCamel(str: string) {
  const words = splitSpaced(str)
  return [
    ...words.slice(0, 1),
    ...words.slice(1).map(wordToTitleCase)
  ].join('')
}
function spacedCaseToPascal(str: string) {
  return splitSpaced(str).map(wordToTitleCase).join('')
}

export class ParameterException extends Error {
  name = this.constructor.name

  constructor(public parameter: string) { super() }
}

export class ParamterRequiredException extends ParameterException { }
export class ParamterCannotBeEmptyException extends ParameterException { }

export class CrudField<T, K extends keyof T = keyof T> {
  constructor(
    public name: string,
    public key: K,
    public type: CrudFieldType,
    public defaultVal: typeof Required | null | Generated,
    public shown?: CrudFieldShown,
    public nameKebab: string = spacedCaseToKebab(name),
    public nameSnake: string = spacedCaseToSnake(name),
    public nameCamel: string = spacedCaseToCamel(name),
    public namePascal: string = spacedCaseToPascal(name),
  ) { }

  public get paramName() { return this.nameKebab }
  public get dbColumnName() {
    return this.type === CrudFieldType.Password
      ? `${this.nameSnake}_hash`
      : this.nameSnake
  }
  public get dbPlaceholderName() { return this.nameCamel }
  
  public toDisplayString(object: T) {
    const value = object[this.key] as unknown
    switch (this.type) {
      case CrudFieldType.String: return value as string
      case CrudFieldType.StringArr: return (value as string[]).join('\n')
      case CrudFieldType.Password: return ''
      case CrudFieldType.Bool: return value ? '1' : '0'
      case CrudFieldType.Uuid: return uuidToString(value as Uuid)
      default: throw new Error()
    }
  }

  public get showForIdentification() {
    return (
      this.shown === CrudFieldShown.ForIdentification
      || this.shown === CrudFieldShown.InList
    )
  }

  public async fromParams(
    params: Record<string, string>,
    previous?: T,
    toParamKey = (f: CrudField<T>) => f.paramName
  ) {
    if (this.defaultVal instanceof Generated) {
      const generate = this.defaultVal.generate
      return previous == null ? generate() : previous[this.key]
    }

    const paramKey = toParamKey(this)
    const valueRaw = params[paramKey] as string | undefined
    const value = valueRaw?.trim()

    if (this.type === CrudFieldType.Bool) return value === 'on'

    if (value == null || value?.length === 0) {
      if (this.defaultVal === Required) {
        if (previous != null) return previous[this.key]
        if (value == null) throw new ParamterRequiredException(paramKey)
        throw new ParamterCannotBeEmptyException(paramKey)
      }
      return this.defaultVal
    }
    
    if (this.type === CrudFieldType.StringArr) {
      return value.split('\n').map((u: string) => u.trim())
    }
    if (this.type === CrudFieldType.Password) return await hashPassword(value)
    return value
  }

  public fromDbRow(row: Record<string, unknown>) {
    const value = row[this.dbColumnName]
    if (value == null) return null
    switch (this.type) {
      case CrudFieldType.String: return value as string
      case CrudFieldType.StringArr: return JSON.parse(value as string)
      case CrudFieldType.Password: return value
      case CrudFieldType.Bool: return value === 1
      case CrudFieldType.Uuid: return value
      default: throw new Error()
    }
  }

  public toDbColumnValue(object: T) {
    const value = object[this.key]
    if (value == null) return null
    switch (this.type) {
      case CrudFieldType.String: return value
      case CrudFieldType.StringArr: return JSON.stringify(value)
      case CrudFieldType.Password: return value
      case CrudFieldType.Bool: return value ? 1 : 0
      case CrudFieldType.Uuid: return value
      default: throw new Error()
    }
  }
}

type CrudFieldRecord<T, K extends keyof T> = Record<K, CrudField<T, K>>

export class CrudConfig<T> {
  constructor(
    public title: string,
    public titlePlural: string,
    public objectName: (object: T) => string,
    public collectionUrl: string,
    public objectTemplateUrl: string,
    public objectUrl: (object: T) => string,
    public objectUrlParamsToWhereParams: (
      params: Record<string, string>
    ) => Record<string, any>,
    public fieldsMap: CrudFieldRecord<T, keyof T>,
    public dbPkWhereClause: string,
    public preEdit?: (db: Database, object: T) => void,
    public preDelete?: (db: Database, object: T) => void,
    public dbTableName: string = spacedCaseToSnake(title)
  ) { }
  
  public get fields(): CrudField<T, keyof T>[] {
    return Object.values(this.fieldsMap)
  }
  
  public async fromParams(
    params: Record<string, string>,
    previous?: T,
    toParamKey = (f: CrudField<T>) => f.paramName
  ) {
    return Object.fromEntries(await Promise.all(this.fields.map(async f => {
      return [f.key, await f.fromParams(params, previous, toParamKey)]
    }))) as unknown as T
  }

  public fromDbRow(row: Record<string, unknown>) {
    return Object.fromEntries(this.fields.map(f => {
      return [f.key, f.fromDbRow(row)]
    })) as unknown as T
  }

  public toDbRow(object: T) {
    return Object.fromEntries(this.fields.map(f => {
      return [f.nameCamel, f.toDbColumnValue(object)]
    })) as unknown as T
  }
}
