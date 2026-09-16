/**
 * From raw first-party analytics rows to per-variant exposure and conversion
 * counts. Pure: the server loader fetches rows, this file decides what they
 * mean, and the test beside it can feed it anything.
 *
 * WHY THE JOIN IS ON THREE KEYS. Client rows carry the browser's session_id,
 * the guest cookie as anonymous_id, and user_id once logged in. The purchase
 * row is written by finalize behind the payment redirect: it has the guest
 * cookie when the browser kept it and always has user_id, but its session_id
 * is a synthetic `server:` marker. So an identity is the guest id first, then
 * a user id that some other row tied to a guest id, then the user id alone,
 * and only for a row with none of those the session id. Joining on session_id
 * alone would report every checkout as unconverted.
 */

import type { VariantCounts } from '@/lib/analytics/experiment-stats'
import type { ExperimentDefinition } from '@/lib/analytics/experiments'

export type AnalyticsEventRow = {
  event_name: string
  session_id: string
  anonymous_id: string | null
  user_id: string | null
  props: unknown
  occurred_at: string
}

export type ExperimentAssignment = {
  counts: VariantCounts[]
  /** Identities seen under more than one variant; counted under the first, reported here. */
  mixedIdentities: number
  /** Goal events whose identity never had an exposure row in the window. */
  unexposedConversions: number
  /** Exposure rows carrying a variant outside the registered list. */
  unknownVariantRows: number
}

function propsOf(row: AnalyticsEventRow): Record<string, unknown> {
  return row.props !== null && typeof row.props === 'object' && !Array.isArray(row.props)
    ? (row.props as Record<string, unknown>)
    : {}
}

/**
 * Resolves the identity key for a row. `userToAnonymous` is built in a first
 * pass over every row that carries both ids; a purchase row whose guest
 * cookie was gone still lands on the guest id that saw the variant.
 */
function identityOf(row: AnalyticsEventRow, userToAnonymous: ReadonlyMap<string, string>): string {
  if (row.anonymous_id) return `a:${row.anonymous_id}`
  if (row.user_id) {
    const linked = userToAnonymous.get(row.user_id)
    return linked ? `a:${linked}` : `u:${row.user_id}`
  }
  return `s:${row.session_id}`
}

export function assignExperiment(
  rows: readonly AnalyticsEventRow[],
  experiment: ExperimentDefinition,
): ExperimentAssignment {
  const userToAnonymous = new Map<string, string>()
  for (const row of rows) {
    if (row.user_id && row.anonymous_id && !userToAnonymous.has(row.user_id)) {
      userToAnonymous.set(row.user_id, row.anonymous_id)
    }
  }

  // Exposure is the FIRST variant an identity was rendered, in time order:
  // a cache miss that re-decided the flag mid-session is a data quality
  // problem to report, not a second person.
  const ordered = [...rows].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  const exposedVariant = new Map<string, string>()
  const mixed = new Set<string>()
  let unknownVariantRows = 0

  const exposureNames = new Set<string>(experiment.exposureEvents)
  for (const row of ordered) {
    if (!exposureNames.has(row.event_name)) continue
    const raw = propsOf(row)[experiment.property]
    if (typeof raw !== 'string') continue
    if (!experiment.variants.includes(raw)) {
      unknownVariantRows += 1
      continue
    }
    const identity = identityOf(row, userToAnonymous)
    const seen = exposedVariant.get(identity)
    if (seen === undefined) exposedVariant.set(identity, raw)
    else if (seen !== raw) mixed.add(identity)
  }

  const converted = new Set<string>()
  let unexposedConversions = 0
  for (const row of ordered) {
    if (row.event_name !== experiment.goalEvent) continue
    const identity = identityOf(row, userToAnonymous)
    if (!exposedVariant.has(identity)) {
      unexposedConversions += 1
      continue
    }
    converted.add(identity)
  }

  const counts: VariantCounts[] = experiment.variants.map((variant) => ({
    variant,
    exposures: 0,
    conversions: 0,
  }))
  const byVariant = new Map(counts.map((row) => [row.variant, row]))
  for (const [identity, variant] of exposedVariant) {
    const bucket = byVariant.get(variant)
    if (!bucket) continue
    bucket.exposures += 1
    if (converted.has(identity)) bucket.conversions += 1
  }

  return {
    counts,
    mixedIdentities: mixed.size,
    unexposedConversions,
    unknownVariantRows,
  }
}
