import * as jose from 'jose'


export async function generateJwks() {
  const { privateKey: rsaPK } = await jose.generateKeyPair('RSA-OAEP-512')
  const rsaJwk = await jose.exportJWK(rsaPK)
  rsaJwk.use = 'sig'
  const { privateKey: ecPK } = await jose.generateKeyPair('ES256')
  const ecJwk = await jose.exportJWK(ecPK)
  ecJwk.use = 'sig'
  return { keys: [rsaJwk, ecJwk] }
}
