import { log } from '@/lib/observability/log'
import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  type ReportEvent,
  type SettlementEventKind,
  israelDayRangeUtc,
} from '@/server/domain/reports/settlement-report'

/**
 * The only read behind the admin reports. Everything about what the numbers
 * MEAN is decided in `server/domain/reports/settlement-report.ts`; this file
 * fetches rows and does nothing else with them.
 *
 * WHY THE SERVICE CLIENT AND NOT THE ADMIN'S OWN SESSION
 *
 * Measured against production on 2026-08-06: `settlement_events` has RLS
 * ENABLED and ZERO policies. That is the tightest state Postgres offers — a
 * deliberate service-role-only lock, not a gap — and it means a read through the
 * request-scoped client returns `[]` with `error === null`. Not a failure: an
 * empty array. A report built on that client would have rendered ₪0 across every
 * card, every day of the chart flat at the baseline, and no error anywhere, on a
 * screen whose entire job is to be believed. So the read goes through the
 * service client, after `requireSection('payments')` has already run in the page.
 *
 * WHY THE WINDOW IS COMPUTED AND NOT WRITTEN AS A DATE
 *
 * The buckets are Israel days (see the domain module), so the fetch has to ask
 * for Israel days too. `occurred_at >= '2026-08-01'` in Postgres is UTC
 * midnight, which is 03:00 in Tel Aviv in summer: three hours of sales on the
 * first of every month are never fetched at all, and a report cannot show a row
 * it was not given.
 */

/**
 * The row cap.
 *
 * One event per order line, plus one per redemption, refund and payout. At the
 * volumes this catalogue runs at a year of trading is far below this; the cap
 * exists so that a range typed into the URL cannot pull an unbounded result into
 * memory, and when it bites the page SAYS so rather than quietly under-reporting.
 */
const MAX_EVENTS = 20_000

const SELECT =
  'kind, occurred_at, supplier_id, paid_on_site_agorot, commission_agorot, supplier_due_agorot, discount_agorot, suppliers(name)'

/** Postgres: relation does not exist. Migration 094 has not been applied here. */
const UNDEFINED_TABLE = '42P01'

export type ReportEventsResult =
  | { available: true; events: ReportEvent[]; truncated: boolean }
  | { available: false; reason: string }

type Row = {
  kind: string
  occurred_at: string
  supplier_id: string | null
  paid_on_site_agorot: number | string | null
  commission_agorot: number | string | null
  supplier_due_agorot: number | string | null
  discount_agorot: number | string | null
  suppliers: { name: string | null } | { name: string | null }[] | null
}

/**
 * `bigint` arrives from PostgREST as a STRING once it exceeds 2^53, and as a
 * number below it. Both are coerced here rather than at the call site, because a
 * string that reaches the domain module turns `+` into concatenation and a total
 * of ₪1,000 into "5000005000".
 */
function toAgorot(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0)
  return Number.isFinite(parsed) ? Math.round(parsed) : 0
}

function supplierName(value: Row['suppliers']): string | null {
  const row = Array.isArray(value) ? (value[0] ?? null) : value
  return row?.name ?? null
}

export async function loadReportEvents(from: string, to: string): Promise<ReportEventsResult> {
  const { startUtc, endUtc } = israelDayRangeUtc(from, to)

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('settlement_events')
    .select(SELECT)
    .gte('occurred_at', startUtc)
    .lt('occurred_at', endUtc)
    .order('occurred_at', { ascending: true })
    .limit(MAX_EVENTS)

  if (error) {
    log.error('reports.events_unavailable', { reason: error.message, code: error.code })
    if (error.code === UNDEFINED_TABLE) {
      return {
        available: false,
        reason:
          'יומן הכסף אינו מותקן בבסיס הנתונים הזה: מיגרציה 094 לא הוחלה, ולכן הטבלה settlement_events אינה קיימת.',
      }
    }
    return { available: false, reason: 'לא ניתן לקרוא את יומן הכסף כרגע. נסה שוב.' }
  }

  const rows = (data ?? []) as Row[]
  return {
    available: true,
    truncated: rows.length >= MAX_EVENTS,
    events: rows.map((row) => ({
      kind: row.kind as SettlementEventKind,
      occurredAt: row.occurred_at,
      supplierId: row.supplier_id,
      supplierName: supplierName(row.suppliers),
      paidOnSiteAgorot: toAgorot(row.paid_on_site_agorot),
      commissionAgorot: toAgorot(row.commission_agorot),
      supplierDueAgorot: toAgorot(row.supplier_due_agorot),
      discountAgorot: toAgorot(row.discount_agorot),
    })),
  }
}
