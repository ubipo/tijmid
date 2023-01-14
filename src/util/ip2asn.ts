import * as fs from 'node:fs/promises'
import * as pathLib from 'node:path'
import * as readline from 'node:readline'
import * as https from 'node:https'
import * as zlib from 'node:zlib'
import { ipv6AddressToBigInt, parseIpAddress } from './ipAddress.js'
import createDeferred from './Deferred.js'


type Ip2asnDbEntry = [BigInt, BigInt, number, string, string]
type Ip2asnDb = Ip2asnDbEntry[]

const now = () => Math.floor(Date.now() / 1000)

export async function readIp2asnDb(
  stream: NodeJS.ReadableStream,
  ipAddressToBigInt: (ipAddress: string) => BigInt
) {
  const v4dbRl = readline.createInterface(stream)
  const v4db: Ip2asnDb = []
  for await (const line of v4dbRl) {
    const [start, end, asn, countryCode, asDescription] = line.split('\t')
    v4db.push([
      ipAddressToBigInt(start), ipAddressToBigInt(end),
      parseInt(asn), countryCode, asDescription
    ])
  }
  v4dbRl.close()
  return v4db
}

export function bigIntIpAddressToAsWithDb(
  db: Ip2asnDb,
  bigIntIpAddress: BigInt
) {
  // Perform a binary search on the database
  let iLow = 0
  let iHigh = db.length - 1
  while (iLow <= iHigh) {
    const iMid = Math.floor((iLow + iHigh) / 2)
    const [start, end, asn, countryCode, asDescription] = db[iMid]
    if (bigIntIpAddress < start) {
      iHigh = iMid - 1
    } else if (bigIntIpAddress > end) {
      iLow = iMid + 1
    } else {
      return { asn, countryCode, asDescription }
    }
  }
  return null
}

export const DEFAULT_MINIMUM_REFRESH_INTERVAL_S = 5 * 24 * 60 * 60 // 5 days
export const DEFAULT_CACHE_DIR = '/tmp/ip2asn'

export async function loadOrRefreshDbWithFsCache(
  url: string,
  path: string,
  ipAddressToBigInt: (ipAddress: string) => BigInt,
  minimumRefreshIntervalS: number = DEFAULT_MINIMUM_REFRESH_INTERVAL_S
) {
  // Use separate file instead of filesystem last modified time because it is 
  // a) not reliable and b) not available on all filesystems
  const lastUpdatedPath = `${path}.last-updated`
  const lastUpdated = await (async () => { try {
    return parseInt(await fs.readFile(lastUpdatedPath, 'utf8'), 10)
  } catch (e) {
    if ((e as any).code === 'ENOENT') return null
    throw e
  } })() ?? -Infinity

  if (now() - lastUpdated < minimumRefreshIntervalS) {
    const dbFile = await fs.open(path, 'r')
    const db = await readIp2asnDb(dbFile.createReadStream(), ipAddressToBigInt)
    dbFile.close()
    return db
  }
  const dbFile = await fs.open(path, 'w')
  const db = await new Promise<Ip2asnDb>((resolve, reject) => {
    const req = https.get(url, async (res) => {
      const gunzip = zlib.createGunzip()
      const dbStream = res.pipe(gunzip)
      // Pipe the db stream both...
      const dbFileWriteStream = dbFile.createWriteStream()
      const dbFileWriteDone = new Promise<void>((resolve, reject) => {
        dbFileWriteStream.on('finish', resolve)
        dbFileWriteStream.on('error', reject)
      })
      // ...to the filesystem cache file...
      dbStream.pipe(dbFileWriteStream)
      const [db, ] = await Promise.all([
        // ...and to the parser
        readIp2asnDb(dbStream, ipAddressToBigInt),
        dbFileWriteDone
      ])
      resolve(db)
    })
    req.on('error', reject)
  })
  dbFile.close();
  await fs.writeFile(lastUpdatedPath, now().toString())

  return db
}

const dbCache = new Map<string, {
  lastRefreshed: number,
  db: Ip2asnDb
}>()
const loadPromises = new Map<string, Promise<void>>()

export async function loadOrRefreshDb(
  url: string,
  path: string,
  ipAddressToBigInt: (ipAddress: string) => BigInt,
  minimumRefreshIntervalS: number = DEFAULT_MINIMUM_REFRESH_INTERVAL_S
) {
  const cacheKey = `${url} ${path}`
  const existingLoadPromise = loadPromises.get(cacheKey)
  if (existingLoadPromise != null) {
    await existingLoadPromise
  }

  const cached = dbCache.get(cacheKey)
  if (cached != null) {
    const { lastRefreshed, db } = cached
    // Unix time arithmetic is safe because the minimum refresh interval should be
    // larger enough (more than 1 second)
    if (now() - lastRefreshed < minimumRefreshIntervalS) {
      return db
    }
  }

  const { promise: loadPromise, deferred } = createDeferred<void>()
  loadPromises.set(cacheKey, loadPromise)
  
  try {
    const db = await loadOrRefreshDbWithFsCache(
      url, path, ipAddressToBigInt, minimumRefreshIntervalS
    )
    dbCache.set(cacheKey, { lastRefreshed: now(), db })
    return db
  } finally {
    loadPromises.delete(cacheKey)
    deferred.resolve()
  }
}

export async function loadOrRefreshDbs(
  minimumRefreshIntervalS: number = DEFAULT_MINIMUM_REFRESH_INTERVAL_S,
  cacheDir: string = DEFAULT_CACHE_DIR
) {
  const createdDir = await fs.mkdir(cacheDir, { recursive: true, mode: 0o750 })
  if (createdDir == null) await fs.chmod(cacheDir, 0o750)
  const [v4, v6] = await Promise.all([
    loadOrRefreshDb(
      'https://iptoasn.com/data/ip2asn-v4-u32.tsv.gz',
      pathLib.join(cacheDir, 'ip2asn-v4-u32.tsv'),
      ipAddress => BigInt(ipAddress),
      minimumRefreshIntervalS
    ),
    loadOrRefreshDb(
      'https://iptoasn.com/data/ip2asn-v6.tsv.gz',
      pathLib.join(cacheDir, 'ip2asn-v6.tsv'),
      ipv6AddressToBigInt,
      minimumRefreshIntervalS
    )
  ])
  return { v4, v6 }
}

export async function ipAddressToAs(
  ipAddress: string,
  minimumRefreshIntervalS: number = DEFAULT_MINIMUM_REFRESH_INTERVAL_S,
  cacheDir: string = DEFAULT_CACHE_DIR
) {
  const { v4, v6 } = await loadOrRefreshDbs(minimumRefreshIntervalS, cacheDir)
  const ipAddressParsed = parseIpAddress(ipAddress)
  const db = ipAddressParsed.version === 4 ? v4 : v6
  return bigIntIpAddressToAsWithDb(db, ipAddressParsed.bigInt)
}

export class Ip2asn {
  constructor(
    private readonly minimumRefreshIntervalS: number = DEFAULT_MINIMUM_REFRESH_INTERVAL_S,
    private readonly cacheDir: string = DEFAULT_CACHE_DIR
  ) {}

  async ipAddressToAs(ipAddress: string) {
    return ipAddressToAs(ipAddress, this.minimumRefreshIntervalS, this.cacheDir)
  }
}
