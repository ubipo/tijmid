import * as express from "express"
import { LoginRequired, SessionData } from "../service/loginSession.js"
import { SubrequestAuthJwtPayload } from "../service/subrequest.js"


export interface MaybeUnauthenticatedLocals {
  sessionData: SessionData | LoginRequired
}

export interface MaybeUnauthenticatedRequestHandler extends express.RequestHandler<Record<string, string>, any, any, any, MaybeUnauthenticatedLocals> {}

export interface MaybeUnauthenticatedResponse extends express.Response {
  locals: MaybeUnauthenticatedLocals
}

export interface subrequestAuthJwtAndPayload {
  jwt: string
  payload: SubrequestAuthJwtPayload
}

export interface Locals {
  sessionData: SessionData
  subrequestAuthJwtAndPayload?: subrequestAuthJwtAndPayload
}

export interface RequestHandler extends express.RequestHandler<Record<string, string>, any, any, any, Locals> {}

export interface Response extends express.Response {
  locals: Locals
}
