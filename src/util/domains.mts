/**
 * Normalizes the domain name to lowercase and with a trailing dot.
 * Doesn't handle punycode.
 */
export function normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/\.?$/, '.')
}
