import { type UpstashConfig, command } from './upstash'

/**
 * A token bucket in Upstash, atomic in one Lua script.
 *
 * WHY A THIRD ALGORITHM, NEXT TO THE SLIDING WINDOW. The sliding-window log
 * (`sliding-window.ts`) answers "how many in the last N seconds" exactly, and
 * that is the right question for "five OTPs an hour". It is the wrong shape
 * for the per-route ceilings in `route-tiers.ts`, which are quoted as a RATE
 * ("five a minute") and are meant to admit a short burst and then pace the
 * caller at that rate: a log refuses the sixth login for up to a full minute
 * after the first, while a bucket hands the next attempt back twelve seconds
 * after the last one, which is both what the number says and what a person
 * mistyping a password experiences as fair.
 *
 * THE STATE IS TWO NUMBERS, NOT A SET. A hash with `tokens` and `ts`, where
 * `ts` is the last time the bucket was touched. On every call the script
 * refills by elapsed time, charges the cost if it fits, and writes both back.
 * One key, constant size, one round trip: the cost does not grow with the
 * rate, which is why this shape is also the right one for `search`.
 *
 * ATOMICITY, SAME ARGUMENT AS THE WINDOW. Read-refill-write from the app
 * admits two concurrent callers both reading one token and both spending it.
 * Redis runs the script without interleaving, so the decision is exact.
 *
 * TIME IS THE CALLER'S, NOT REDIS'S. `now` arrives as an argument so a test
 * can walk the clock without sleeping, and so the edge runtime's clock is the
 * one every region of the deployment agrees on. If `now` is behind the stored
 * `ts` (two regions, one skewed), nothing is refilled and `ts` is kept: the
 * bucket stands still rather than crediting time that has not passed twice.
 *
 * ALL FOUR RETURN VALUES ARE INTEGERS, ON PURPOSE. Redis truncates a Lua float
 * on the way out, silently. The script floors and ceils itself so the
 * truncation never has anything to do, and `parseBucketState` rejects
 * anything that is not a number anyway.
 */
const TOKEN_BUCKET_SCRIPT = `
local key      = KEYS[1]
local now      = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refill   = tonumber(ARGV[3])
local period   = tonumber(ARGV[4])
local cost     = tonumber(ARGV[5])

local stored = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(stored[1])
local ts     = tonumber(stored[2])

if tokens == nil or ts == nil then
  tokens = capacity
  ts = now
end

if now > ts then
  tokens = math.min(capacity, tokens + (now - ts) * refill / period)
  ts = now
end

local allowed = 0
local retry = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
else
  retry = math.ceil((cost - tokens) * period / refill)
end

redis.call('HSET', key, 'tokens', tokens, 'ts', ts)
redis.call('PEXPIRE', key, math.ceil(capacity * period / refill) + 1000)

local full = math.ceil((capacity - tokens) * period / refill)
return {allowed, math.floor(tokens), retry, full}
`.trim()

export type BucketState = {
  allowed: boolean
  /** Whole tokens left AFTER this call, whether or not it was charged. */
  tokens: number
  /** Milliseconds until `cost` tokens are available. Zero when allowed. */
  retryAfterMs: number
  /** Milliseconds until the bucket is full again. Zero when it already is. */
  fullInMs: number
}

export type BucketShape = {
  /** The most tokens the bucket holds, which is the largest admissible burst. */
  capacity: number
  /** Tokens added per `refillPeriodMs`. The rate is the ratio, not either number. */
  refillTokens: number
  refillPeriodMs: number
}

export function tokenBucketScript(): string {
  return TOKEN_BUCKET_SCRIPT
}

/**
 * The TTL the script sets: the time an empty bucket takes to fill, plus a
 * second. A key nobody touches again is at capacity by then, which is what a
 * missing key means, so expiring it loses nothing. Exposed so the test can
 * pin the arithmetic rather than the literal.
 */
export function bucketTtlMs(shape: BucketShape): number {
  return Math.ceil((shape.capacity * shape.refillPeriodMs) / shape.refillTokens) + 1000
}

function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }
  return null
}

/**
 * Same tolerance as `parseWindowState`: Upstash has widened large integers to
 * strings before, and a `retryAfterMs` read as `NaN` would be rendered into a
 * `Retry-After` header as the word "NaN". Both shapes accepted, nothing else.
 */
export function parseBucketState(result: unknown): BucketState | null {
  if (!Array.isArray(result) || result.length < 4) return null
  const allowed = toInteger(result[0])
  const tokens = toInteger(result[1])
  const retryAfterMs = toInteger(result[2])
  const fullInMs = toInteger(result[3])
  if (allowed === null || tokens === null || retryAfterMs === null || fullInMs === null) {
    return null
  }
  return { allowed: allowed === 1, tokens, retryAfterMs, fullInMs }
}

export async function evaluateBucket(
  config: UpstashConfig,
  args: { key: string; nowMs: number; shape: BucketShape; cost?: number },
): Promise<BucketState | null> {
  const result = await command(config, [
    'EVAL',
    TOKEN_BUCKET_SCRIPT,
    '1',
    args.key,
    String(args.nowMs),
    String(args.shape.capacity),
    String(args.shape.refillTokens),
    String(args.shape.refillPeriodMs),
    String(args.cost ?? 1),
  ])
  return parseBucketState(result)
}
