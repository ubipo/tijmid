import * as express from "express"
import { SessionData } from "./session.mjs"


export interface Locals {
  sessionData: SessionData
}

export interface RequestHandler extends express.RequestHandler<Record<string, string>, any, any, any, Locals> {}

export interface Response extends express.Response {
  locals: Locals
}
