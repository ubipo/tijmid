import sodium from "libsodium-wrappers"


export class InvalidPasswordException extends Error {
  constructor(reason: string) {
    super()
    this.reason = reason
  }

  name = this.constructor.name
  reason: string
}

export async function hashPassword(password: string) {
  if (password.length < 6) {
    throw new InvalidPasswordException('must be at least 6 character')
  }

  await sodium.ready
  return sodium.crypto_pwhash_str(
    password,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE
  )
}

export async function verifyPassword(hash: string, password: string) {
  await sodium.ready
  return sodium.crypto_pwhash_str_verify(hash, password)
}
