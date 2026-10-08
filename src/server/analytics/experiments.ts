import {
  type AnalyticsEventRow,
  type ExperimentAssignment,
  assignExperiment,
} from '@/lib/analytics/experiment-events'
import { type VariantStat, experimentStats } from '@/lib/analytics/experiment-stats'
import type { ExperimentDefinition, ExposureFilter } from '@/lib/analytics/experiments'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeOrTerm } from '@/lib/utils/search-escape'

/**
 * The rows behind one experiment's report, from first-party analytics.
 *
 * Pulls the exposure events and the goal event for the window and hands
 * them to the pure assignment (`experiment-events.ts`) and stats
 * (`experiment-stats.ts`). The only decision made here is WHICH rows: for a
 * landing experiment the exposure is a `page_view`, and pulling every
 * page_view of the month to find one page's would be most of the table, so
 * a caller may narrow the exposure rows by one JSON property
 * (`props->>lp_slug = <slug>`); the goal rows are never narrowed, because a
 * purchase carries no landing property and is joined by identity.
 *
 * Capped, and the cap is reported: a report built from a truncated window
 * must say so rather than show a confident number.
 */
export const MAX_EXPERIMENT_ROWS = 50_000

export type ExperimentReport =
  | {
      ok: true
      assignment: ExperimentAssignment
      stats: VariantStat[]
      rows: number
      truncated: boolean
    }
  | { ok: false; reason: string }

export async function loadExperimentReport(
  experiment: ExperimentDefinition,
  options: { days?: number; exposureFilter?: ExposureFilter } = {},
): Promise<ExperimentReport> {
  const days = options.days ?? 30
  // A registered experiment may carry its own narrowing (the homepage one
  // does: its exposure is the `/` page_view); an explicit option wins.
  const exposureFilter = options.exposureFilter ?? experiment.exposureFilter
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const admin = createAdminClient()
  const names = [...experiment.exposureEvents, experiment.goalEvent]

  let query = admin
    .from('analytics_events')
    .select('event_name, session_id, anonymous_id, user_id, props, occurred_at')
    .in('event_name', names)
    .gte('occurred_at', since)

  if (exposureFilter) {
    // A goal row, or an exposure row carrying the property. PostgREST's
    // `or` takes the JSON arrow path directly. Every interpolated term is
    // sanitised: inside an .or() expression `, ( ) " \` are syntax, and the
    // slug comes from a database row an editor typed.
    const goal = sanitizeOrTerm(experiment.goalEvent)
    const prop = sanitizeOrTerm(exposureFilter.prop)
    const value = sanitizeOrTerm(exposureFilter.value)
    query = query.or(`event_name.eq.${goal},props->>${prop}.eq.${value}`)
  }

  const { data, error } = await query
    .order('occurred_at', { ascending: true })
    .limit(MAX_EXPERIMENT_ROWS)
  if (error) return { ok: false, reason: error.message }

  const rows = (data ?? []) as AnalyticsEventRow[]
  const assignment = assignExperiment(rows, experiment)
  return {
    ok: true,
    assignment,
    stats: experimentStats(assignment.counts, experiment.control),
    rows: rows.length,
    truncated: rows.length >= MAX_EXPERIMENT_ROWS,
  }
}
