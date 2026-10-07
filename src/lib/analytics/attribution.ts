/**
 * First / last touch attribution, kept in one cookie.
 *
 * `ke_attr` holds the first UTM touch of the 30-day window and the most
 * recent one. The browser tracker reads it on every event
 * (`utmForEvent(attribution.last)`) and the server reads the same cookie when
 * it records a purchase, so one module owns the shape for both.
 *
 * NO ZOD HERE, ON PURPOSE. This module is in the tracker's client graph, and
 * the schema it used to carry was the second half of 61.7 KB raw / 14.5 KB
 * gzipped of zod on every storefront first load (STEP 34; `events.ts` was the
 * first half). `parseAttribution` below is the schema by hand, with the same
 * semantics the zod version had and `attribution.test.ts` pins: an object with
 * only `first` / `last`, each a touch with only the five UTM keys plus `at`,
 * every value a string within its length cap, and anything else rejected
 * whole rather than repaired.
 */

export const ATTRIBUTION_COOKIE = 'ke_attr'
export const ATTRIBUTION_WINDOW_DAYS = 30
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * ATTRIBUTION_WINDOW_DAYS

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
] as const
export type UtmKey = (typeof UTM_KEYS)[number]

/** Per-key caps, identical to the former zod schema. */
const UTM_MAX_LENGTH: Record<UtmKey, number> = {
  utm_source: 120,
  utm_medium: 120,
  utm_campaign: 200,
  utm_content: 200,
  utm_term: 200,
}

export type Touch = Partial<Record<UtmKey, string>> & { at?: string }

export type Attribution = {
  first?: Touch
  last?: Touch
}

const TOUCH_KEYS: ReadonlySet<string> = new Set<string>([...UTM_KEYS, 'at'])
const ATTRIBUTION_KEYS: ReadonlySet<string> = new Set(['first', 'last'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Strict: unknown keys, non-string values and over-long strings all reject. */
function parseTouch(value: unknown): Touch | null {
  if (!isPlainObject(value)) return null
  const touch: Touch = {}
  for (const [key, raw] of Object.entries(value)) {
    if (!TOUCH_KEYS.has(key)) return null
    if (raw === undefined) continue
    if (typeof raw !== 'string') return null
    if (key === 'at') {
      touch.at = raw
      continue
    }
    const utmKey = key as UtmKey
    if (raw.length > UTM_MAX_LENGTH[utmKey]) return null
    touch[utmKey] = raw
  }
  return touch
}

export function readUtmFromQuery(search: string): Touch | null {
  const params = new URLSearchParams(search)
  const touch: Touch = {}
  let found = false
  for (const key of UTM_KEYS) {
    const raw = params.get(key) ?? params.get(key.toUpperCase())
    if (!raw) continue
    const value = raw.trim().slice(0, 200)
    if (!value) continue
    touch[key] = value
    found = true
  }
  return found ? touch : null
}

export function mergeAttribution(
  stored: Attribution | null,
  touch: Touch | null,
  now: Date,
): Attribution {
  const base = stored ?? {}
  if (!touch) return base
  const stamped: Touch = { ...touch, at: now.toISOString() }
  return {
    first: base.first ?? stamped,
    last: stamped,
  }
}

/**
 * The cookie's JSON, validated. Returns null for anything that is not exactly
 * the shape above: a tampered or truncated cookie is ignored, never half-read.
 */
export function parseAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw) return null
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isPlainObject(json)) return null
  const attribution: Attribution = {}
  for (const [key, value] of Object.entries(json)) {
    if (!ATTRIBUTION_KEYS.has(key)) return null
    if (value === undefined) continue
    const touch = parseTouch(value)
    if (!touch) return null
    attribution[key as 'first' | 'last'] = touch
  }
  return attribution
}

export function serializeAttribution(attribution: Attribution): string {
  return JSON.stringify(attribution)
}

export function utmForEvent(touch: Touch | null | undefined): Record<string, string> | undefined {
  if (!touch) return undefined
  const utm: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const value = touch[key]
    if (value) utm[key] = value
  }
  return Object.keys(utm).length > 0 ? utm : undefined
}
