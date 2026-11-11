// How much each client may speak in a day: loose, far more than anyone speaks. In memory, so a
// restart forgets it; the day is Beijing's, and all of it is forgotten when the day turns.

export const DAILY_SECONDS = 60 * 60

const TZ = 'Asia/Shanghai'

let today = ''
let spoken = new Map<string, number>()

const dayOf = (now: Date) => now.toLocaleDateString('sv-SE', { timeZone: TZ })

/** Seconds from `now` until the next day begins, for Retry-After. */
function untilTomorrow(now: Date): number {
  const [h, m, s] = now
    .toLocaleTimeString('en-GB', { timeZone: TZ, hourCycle: 'h23' })
    .split(':')
    .map(Number) as [number, number, number]
  return 24 * 3600 - (h * 3600 + m * 60 + s)
}

/** Counts `seconds` of speech against `client`'s day. A recording is taken while the day is not yet
 * used up, even if it goes past; once used up, returns the seconds to wait. */
export function take(client: string, seconds: number, now = new Date()): { retryAfter: number } | null {
  const day = dayOf(now)
  if (day !== today) {
    today = day
    spoken = new Map()
  }
  const used = spoken.get(client) ?? 0
  if (used >= DAILY_SECONDS) return { retryAfter: untilTomorrow(now) }
  spoken.set(client, used + seconds)
  return null
}
