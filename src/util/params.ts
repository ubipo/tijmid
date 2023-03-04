import { BadReq } from "./ReqError.js"


export function getParams(
  pageTitle: string,
  body: any,
  names: (string | [string, boolean])[]
) {
  return Object.fromEntries(names.map(nameObj => {
    const [ name, optional ] = typeof nameObj === "string"
      ? [nameObj, false]
      : nameObj
    const param = body[name] as string
    if (!param && !optional) throw new BadReq(pageTitle, `param ${name} required`)
    return [name, param]
  }))
}

export function getMaybeOneSearchParam(
  params: URLSearchParams,
  key: string,
) {
  const values = params.getAll(key)
  if (values.length > 1) return new BadReq(
    `Multiple url parameters: ${key}`,
    `Expected at most one url parameter of: ${key}, but ${values.length} were present.`
  )
  return values[0] as string | undefined
}


export function getExactlyOneSearchParam(
  params: URLSearchParams,
  key: string,
) {
  const value = getMaybeOneSearchParam(params, key)
  if (value instanceof BadReq) return value
  if (value == null) return new BadReq(
    `Missing url parameter: ${key}`,
    `Expected exactly one url parameter of: ${key}, but none were present.`
  )
  return value
}
