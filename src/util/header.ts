import { IncomingHttpHeaders } from "http";
import { BadReq } from "./ReqError.js";


export function getExactlyOneHeader(
  headers: IncomingHttpHeaders,
  name: string
): string {
  const values = headers[name];
  if (values == null) {
    throw new BadReq(
      `Missing header: ${name}`,
      `Expected exactly one header: ${name}, but none were present.`
    );
  }
  const value = Array.isArray(values) ? (() => {
    if (values.length !== 1) {
      throw new BadReq(
        `Multiple headers: ${name}`,
        `Expected exactly one header: ${name}, but ${values.length} were present.`
      );
    }
    return values[0];
  })() : values;
  return value;
}
