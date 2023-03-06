import { Temporal } from "@js-temporal/polyfill";
import { JWTPayload } from "jose";

// This can be quite long because the session is validated on every subrequest
// Actually, it could be infinite. But having a max age is good for cleaning up
// unused cookies + for algorithm rotation.
export const SUBREQUEST_TOKEN_MAXAGE = Temporal.Duration.from('P100D')

export function getSubrequestHostJwtKey(issuerUrn: string) {
  return `jwt-${encodeURIComponent(issuerUrn)}`
}

export interface SubrequestAuthJwtPayload extends JWTPayload {
  nextUrl: string
  loginSession: string
  /**
   * Unix timestamp in seconds (i.e. UTC, not TAI, and so stretched/skipped at 
   * leap seconds)
   * https://www.rfc-editor.org/rfc/rfc7519#section-4.1.6
   */
  iat: number
}
