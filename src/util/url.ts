/**
 * Normalizes the domain name to lowercase and with a trailing dot.
 * Doesn't handle punycode.
 */
export function normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/\.?$/, '.')
}

export function urlToNormalizedHost(url: string | URL): string {
    url = url instanceof URL ? url : new URL(url)
    return normalizeDomain(url.hostname) + url.port
}

export function normalizeHost(host: string): string {
    return urlToNormalizedHost(new URL(`https://${host}`))
}

export function pathToSearchParams(path: string): URLSearchParams {
    const url = new URL(path, 'http://localhost')
    return url.searchParams
}
