import express from "express"
import core from "express-serve-static-core"

export function expressAsync<
    P = core.ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = core.Query,
>(
    block: (
        ...args: Parameters<express.RequestHandler<P, ResBody, ReqBody, ReqQuery>>
    ) => void | Promise<void>
) {
    return function asyncUtilWrap(
        ...args: Parameters<express.RequestHandler<P, ResBody, ReqBody, ReqQuery>>
    ) {
        const fnReturn = block(...args)
        const next = args[args.length - 1] as core.NextFunction
        return Promise.resolve(fnReturn).catch(next)
    }
}
