import { z } from 'zod'

// Marketing attribution, UTM only (owner decision, 2026-07-20). There is no
// paid media yet, so referrer classification and click IDs (gclid, fbclid,
// ttclid) have no consumer. The jsonb shape below keeps room for them, so
// adding one later is an SDK change with no migration.

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

const touchSchema = z
  .object({
    utm_source: z.string().max(120).optional(),
    utm_medium: z.string().max(120).optional(),
    utm_campaign: z.string().max(200).optional(),
    utm_content: z.string().max(200).optional(),
    utm_term: z.string().max(200).optional(),
    at: z.string().optional(),
  })
  .strict()

export const attributionSchema = z
  .object({
    first: touchSchema.optional(),
    last: touchSchema.optional(),
  })
  .strict()

export type Touch = z.infer<typeof touchSchema>
export type Attribution = z.infer<typeof attributionSchema>

/**
 * Extracts the canonical UTM set from a query string. Keys are lowercased and
 * values trimmed and length-capped; anything else in the URL is ignored.
 * Returns null when the URL carries no UTM at all, so a plain internal
 * navigation never overwrites a real touch.
 */
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

/**
 * Merges a new touch into the stored attribution. first-touch is written once
 * and then frozen for the whole window; last-touch always moves. A visit with
 * no UTM leaves both untouched: "direct" is the absence of a touch, not a touch.
 */
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

export function parseAttribution(raw: string | undefined | null): Attribution | null {
  if (!raw) return null
  try {
    const parsed = attributionSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function serializeAttribution(attribution: Attribution): string {
  return JSON.stringify(attribution)
}

/** The UTM subset carried on every event envelope (no `at` timestamp). */
export function utmForEvent(touch: Touch | null | undefined): Record<string, string> | undefined {
  if (!touch) return undefined
  const utm: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const value = touch[key]
    if (value) utm[key] = value
  }
  return Object.keys(utm).length > 0 ? utm : undefined
}
