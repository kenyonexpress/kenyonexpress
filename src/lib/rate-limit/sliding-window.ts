import { type UpstashConfig, command } from './upstash'

/**
 * A sliding-window LOG, not a sliding-window approximation.
 *
 * WHAT THE DIFFERENCE BUYS, AND WHY IT IS WORTH IT HERE. The cheap limiter is a
 * fixed window: `INCR` a key named after the current hour and let it expire.
 * Its failure is a boundary burst — with `phone-otp-number:<e164>` at 5/hour, a
 * caller who spends 5 at 10:59:59 and 5 more at 11:00:01 sends TEN OTPs to one
 * phone inside two seconds, which is precisely the abuse the limit exists to
 * stop. Upstash's own SDK ships a weighted two-window approximation that
 * narrows this but still admits over the limit by construction.
 *
 * The limits in this app are small (5 to 300 per window) and the keys are
 * per-IP or per-user, so storing one sorted-set member per request costs a few
 * hundred bytes at worst and buys an exact answer. That trade would invert at
 * 10k/second on one key; it does not invert at 5/hour on a phone number.
 *
 * ATOMICITY IS THE OTHER HALF. Read-then-write from the app admits a race where
 * two concurrent requests both read `used = 4` against a limit of 5 and both
 * proceed. The whole decision is therefore one Lua script, which Redis runs to
 * completion without interleaving — one round trip, no lock, no race.
 */
const SLIDING_WINDOW_SCRIPT = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
local used = redis.call('ZCARD', key)

if used >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local reset = now + window
  if oldest[2] then
    reset = tonumber(oldest[2]) + window
  end
  return {0, used, reset}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {1, used + 1, now + window}
`.trim()

export type WindowState = {
  allowed: boolean
  /** Requests inside the window AFTER this one was counted, if it was. */
  used: number
  /** Epoch ms at which the window frees a slot. */
  resetAtMs: number
}

/**
 * `ZREMRANGEBYSCORE` prunes on read, but only for keys that are still being
 * read. A key nobody touches again would sit in Redis forever, so `PEXPIRE`
 * renews a TTL of exactly one window on every accepted request. A key that is
 * at its limit and therefore never reaches the `ZADD` branch still expires:
 * its last accepted request set a TTL one full window ahead, which is the
 * earliest moment the set could be empty anyway.
 */
export function slidingWindowScript(): string {
  return SLIDING_WINDOW_SCRIPT
}

/**
 * Redis returns Lua numbers as integers, so the three fields arrive as JSON
 * numbers — but Upstash has been known to widen large integers to strings, and
 * a `resetAtMs` read as `NaN` would be silently rendered into a `Retry-After`
 * header. Both shapes are accepted and anything else is a protocol error.
 */
function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }
  return null
}

export function parseWindowState(result: unknown): WindowState | null {
  if (!Array.isArray(result) || result.length < 3) return null
  const allowed = toInteger(result[0])
  const used = toInteger(result[1])
  const resetAtMs = toInteger(result[2])
  if (allowed === null || used === null || resetAtMs === null) return null
  return { allowed: allowed === 1, used, resetAtMs }
}

export async function evaluateWindow(
  config: UpstashConfig,
  args: { key: string; nowMs: number; windowMs: number; limit: number; member: string },
): Promise<WindowState | null> {
  const result = await command(config, [
    'EVAL',
    SLIDING_WINDOW_SCRIPT,
    '1',
    args.key,
    String(args.nowMs),
    String(args.windowMs),
    String(args.limit),
    args.member,
  ])
  return parseWindowState(result)
}
