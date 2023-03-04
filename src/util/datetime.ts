import { Temporal } from '@js-temporal/polyfill'
import { TaiConverter, MODELS } from 't-a-i'


const taiConverter = TaiConverter(MODELS.STALL)

export function now() {
    // From the docs: "with the STALL model, one particular input Unix
    // millisecond count corresponds to a closed range of TAI millisecond
    // counts. The last TAI millisecond count in the range, at the end of the
    // inserted time, is returned."
    // https://www.npmjs.com/package/t-a-i
    return taiConverter.unixToAtomic(Date.now(), { range: false })
}

export function millisToNanos(millis: number) {
    return BigInt(millis) * BigInt(1000000)
}

export function taiToISO8601(tai: number) {
    const unixNanos = millisToNanos(taiConverter.atomicToUnix(tai))
    const instant = new Temporal.Instant(unixNanos)
    return instant.toString(
        { timeZone: 'UTC', smallestUnit: 'second' }
    )
}
