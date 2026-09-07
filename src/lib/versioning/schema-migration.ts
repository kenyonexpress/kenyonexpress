/**
 * Schema migration planning (MEGA 194). Pure, no DB connection, no execution.
 *
 * THIS MODULE DELIBERATELY CANNOT APPLY ANYTHING. The draft it replaces was
 * `migrateSchema(from, to)` -> `applyMigration(...)`, which is precisely the
 * shape this project forbids: `db push` is banned, schema changes live as
 * numbered files in `migrations/pending/`, and applying one to production is
 * one of the four actions that require explicit approval. A function that
 * applies a range on its own would let any caller walk straight past all three
 * rules. So this answers "what would run, in what order, and is it safe to
 * ask?" and stops there. The apply itself stays a human step in RUNBOOK.md.
 *
 * The input is `MIGRATION_MANIFEST`, generated from the tracked files by
 * `scripts/build-migration-manifest.mjs`. That manifest describes THE
 * REPOSITORY, not the database -- `applied` is this repo's record of an apply,
 * not a live probe -- so a plan is a statement about files, and the database's
 * own answer still lives in `supabase_migrations.schema_migrations`.
 */

import { MIGRATION_MANIFEST, type MigrationEntry } from '@/lib/admin/migration-manifest'

export type BlockReason = 'cancelled' | 'missing-preflight' | 'awaiting-approval'

export interface MigrationBlocker {
  number: string
  file: string
  reason: BlockReason
}

export interface MigrationPlan {
  /** Exclusive lower bound: the migration number already on the target. */
  from: number
  /** Inclusive upper bound. */
  to: number
  /** Files to apply, ascending. Empty when the range holds nothing. */
  steps: readonly MigrationEntry[]
  /** Everything in range that must be resolved before anyone applies. */
  blockers: readonly MigrationBlocker[]
  /** True only when there is work to do and nothing blocks it. */
  runnable: boolean
}

/**
 * Numeric value of a manifest `number`. The manifest stores them as strings
 * ('122') so the filename and the key never disagree; ordering has to be
 * numeric or 99 sorts after 100.
 */
export function migrationNumber(entry: Pick<MigrationEntry, 'number'>): number {
  const n = Number.parseInt(entry.number, 10)
  if (!Number.isInteger(n)) {
    throw new TypeError(`migration number is not an integer: ${entry.number}`)
  }
  return n
}

function coerceBound(value: number | string, label: string): number {
  const n = typeof value === 'number' ? value : Number.parseInt(value, 10)
  if (!Number.isInteger(n) || n < 0) {
    throw new TypeError(`${label} must be a non-negative integer, got ${String(value)}`)
  }
  return n
}

/**
 * Orders the migrations between two schema points and reports what stands in
 * the way.
 *
 * `from` is EXCLUSIVE and `to` is INCLUSIVE, matching how the numbers are used
 * in practice: "production is on 168, take it to 172" means 169..172.
 *
 * Backwards ranges throw rather than returning an empty plan. Nothing in
 * `migrations/` ships a down migration, so a caller asking to go from 172 to
 * 168 has a bug, and an empty plan would read as "nothing to do" and hide it.
 */
export function planSchemaMigration(
  from: number | string,
  to: number | string,
  manifest: readonly MigrationEntry[] = MIGRATION_MANIFEST,
): MigrationPlan {
  const lower = coerceBound(from, 'from')
  const upper = coerceBound(to, 'to')
  if (upper < lower) {
    throw new RangeError(
      `cannot migrate backwards: ${lower} -> ${upper}; no down migrations exist in this repo`,
    )
  }

  const inRange = manifest
    .filter((entry) => {
      const n = migrationNumber(entry)
      return n > lower && n <= upper
    })
    .sort((a, b) => migrationNumber(a) - migrationNumber(b))

  const blockers: MigrationBlocker[] = []
  for (const entry of inRange) {
    if (entry.state === 'cancelled') {
      blockers.push({ number: entry.number, file: entry.file, reason: 'cancelled' })
      continue
    }
    if (entry.state === 'pending') {
      // Order matters: a pending file with no preflight is the worse of the two
      // findings, because there is no way to check it before it runs.
      blockers.push({
        number: entry.number,
        file: entry.file,
        reason: entry.hasPreflight ? 'awaiting-approval' : 'missing-preflight',
      })
    }
  }

  return {
    from: lower,
    to: upper,
    steps: inRange,
    blockers,
    runnable: inRange.length > 0 && blockers.length === 0,
  }
}

/** The highest migration number the repository knows about. */
export function latestMigrationNumber(
  manifest: readonly MigrationEntry[] = MIGRATION_MANIFEST,
): number {
  return manifest.reduce((max, entry) => Math.max(max, migrationNumber(entry)), 0)
}

/**
 * A one-line-per-step summary for a runbook or a log. Text only: it renders no
 * UI, so it stays English like the rest of `migrations/`.
 */
export function describeMigrationPlan(plan: MigrationPlan): string {
  const header = `migration plan ${plan.from} -> ${plan.to}: ${plan.steps.length} step(s)`
  const steps = plan.steps.map((entry) => `  apply ${entry.file} [${entry.state}]`)
  const blockers = plan.blockers.map((b) => `  BLOCKED ${b.file}: ${b.reason}`)
  const verdict = plan.runnable ? '  ready to apply' : '  not runnable'
  return [header, ...steps, ...blockers, verdict].join('\n')
}
