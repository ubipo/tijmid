import core from "express-serve-static-core"
import { RequestHandler } from "./expressTypes.js"


export function expressAsync<
    P = core.ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = core.Query,
>(
    block: (
        ...args: Parameters<RequestHandler>
    ) => void | Promise<void>
) {
    return function asyncUtilWrap(
        ...args: Parameters<RequestHandler>
    ) {
        const fnReturn = block(...args)
        const next = args[args.length - 1] as core.NextFunction
        if (!(fnReturn instanceof Promise)) {
            next()
            return
        }

        fnReturn.then(() => next()).catch(next)
        return
    }
}
