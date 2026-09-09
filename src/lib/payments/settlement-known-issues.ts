import ledger from '../../../supabase/settlement-known-issues.json'

/**
 * The measured floor of settlement findings that are true of production today.
 *
 * IMPORTED, NOT READ FROM DISK. `supabase/catalogue-known-issues.json` is read
 * with `readFileSync` because its only consumer is a test, which has a
 * filesystem. This one is consumed by a route that runs on Vercel, where the
 * repository is not on disk beside the bundle, so it has to be an import the
 * bundler can follow.
 *
 * The file stays in `supabase/` beside the catalogue ledger anyway. Two ledgers
 * of the same kind in two directories would be the more expensive mistake.
 */

type LedgerFile = {
  $measured_at: string
  known: Record<string, { order?: string; detail: string }>
}

const file = ledger as LedgerFile

/** Finding ids the job must not page about. Order is not significant. */
export const KNOWN_SETTLEMENT_ISSUES: readonly string[] = Object.keys(file.known)

/** When the floor above was last measured against production. */
export const SETTLEMENT_ISSUES_MEASURED_AT = file.$measured_at

/** The human-facing note for one id, for a report that has to explain itself. */
export function knownIssueDetail(id: string): string | null {
  return file.known[id]?.detail ?? null
}
