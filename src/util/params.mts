import { BadReq } from "./ReqError.mjs"


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
