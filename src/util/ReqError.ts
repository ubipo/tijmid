export abstract class ReqError extends Error {
  abstract code: number 
  title: string

  constructor(title: string, message?: string) {
    super(message ?? title)
    this.title = title
    this.name = this.constructor.name
  }
}

export class BadReq extends ReqError { code = 400 }
export class UnauthorizedReq extends ReqError { code = 401 }
export class ForbiddenReq extends ReqError { code = 403 }
export class NotFound extends ReqError { code = 404 }
export class InternalServerError extends ReqError { code = 500 }
