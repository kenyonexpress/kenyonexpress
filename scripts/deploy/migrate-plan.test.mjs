import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LEDGER_SNAPSHOT,
  hasRollback,
  ledgerMatch,
  loadPendingFiles,
  mcpMigrationName,
  needsSplitApply,
  parseFileName,
  parseLedgerName,
  planMigrations,
  readsVault,
  renderMarkdown,
  snapshotAgeDays,
} from './migrate-plan.mjs'

describe('name parsing', () => {
  it('splits a pending file name into number and slug', () => {
    expect(parseFileName('217_coupon_qr_redemption.sql')).toEqual({
      number: '217',
      slug: 'coupon_qr_redemption',
    })
    expect(parseFileName('135a_product_type_recurring.sql')).toEqual({
      number: '135a',
      slug: 'product_type_recurring',
    })
    expect(parseFileName('restore_carts.sql')).toEqual({ number: null, slug: 'restore_carts' })
  })

  it('reads the three ledger shapes to the same key', () => {
    expect(parseLedgerName('coupon_qr_redemption_217')).toEqual({
      number: '217',
      slug: 'coupon_qr_redemption',
    })
    expect(parseLedgerName('217_coupon_qr_redemption')).toEqual({
      number: '217',
      slug: 'coupon_qr_redemption',
    })
    expect(parseLedgerName('restore_carts')).toEqual({ number: null, slug: 'restore_carts' })
  })

  it('emits the slug-then-number name apply_migration records here', () => {
    expect(mcpMigrationName('242_job_dlq.sql')).toBe('job_dlq_242')
  })
})

describe('ledgerMatch', () => {
  const ledger = [
    { version: '1', name: 'audit_full_coverage_169' },
    { version: '2', name: 'analytics_server_event_names_169' },
    { version: '3', name: '093_product_commission_type' },
    { version: '4', name: 'restore_carts' },
  ]

  it('matches by slug AND number, so a reused number cannot mark the wrong file applied', () => {
    expect(ledgerMatch('169_analytics_server_event_names.sql', ledger)?.version).toBe('2')
    expect(ledgerMatch('169_something_else.sql', ledger)).toBeNull()
  })

  it('matches a number-first ledger name and a bare one', () => {
    expect(ledgerMatch('093_product_commission_type.sql', ledger)?.version).toBe('3')
    expect(ledgerMatch('restore_carts.sql', ledger)?.version).toBe('4')
  })

  it('refuses a slug match with a different number', () => {
    expect(ledgerMatch('094_product_commission_type.sql', ledger)).toBeNull()
  })
})

describe('sql inspection', () => {
  it('finds a rollback comment in any casing', () => {
    expect(hasRollback('-- ROLLBACK:\n-- drop table x;')).toBe(true)
    expect(hasRollback('-- Rollback is one DROP TABLE')).toBe(true)
    expect(hasRollback('create table x();')).toBe(false)
  })
  it('flags vault reads and CONCURRENTLY', () => {
    expect(
      readsVault("select decrypted_secret from vault.decrypted_secrets where name = 'x'"),
    ).toBe(true)
    expect(readsVault('select 1')).toBe(false)
    expect(needsSplitApply('CREATE INDEX CONCURRENTLY IF NOT EXISTS i ON t(a);')).toBe(true)
    expect(needsSplitApply('CREATE UNIQUE INDEX CONCURRENTLY i ON t(a);')).toBe(true)
    expect(needsSplitApply('CREATE INDEX IF NOT EXISTS i ON t(a);')).toBe(false)
  })
  it('measures snapshot age and treats garbage as infinitely old', () => {
    const now = new Date('2026-09-17T00:00:00Z')
    expect(snapshotAgeDays('2026-09-15T00:00:00Z', now)).toBe(2)
    expect(snapshotAgeDays('not a date', now)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('planMigrations', () => {
  const now = new Date('2026-09-17T12:00:00Z')
  const files = [
    {
      name: '242_job_dlq.sql',
      sql: 'create table if not exists job_dlq();\n-- ROLLBACK: drop table job_dlq;',
      hasPreflight: false,
    },
    { name: '217_coupon_qr_redemption.sql', sql: 'select 1;', hasPreflight: false },
    {
      name: '162_cron_schedule.sql',
      sql: "select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret';\n-- rollback: cron.unschedule",
      hasPreflight: true,
    },
    {
      name: '184_orders_monthly_partitioning.sql',
      sql: 'alter table orders ...;\n-- ROLLBACK: see foot',
      hasPreflight: true,
    },
    { name: '240_perf.sql', sql: 'create index if not exists a on b(c);', hasPreflight: false },
  ]
  const ledger = [{ version: '20260909134818', name: 'coupon_qr_redemption_217' }]

  it('separates drift (already applied) from the apply list, ordered by file name', () => {
    const plan = planMigrations({ files, ledger, measuredAt: '2026-09-17T06:00:00Z', now })
    expect(plan.stale).toBe(false)
    expect(plan.drift).toEqual([
      {
        file: '217_coupon_qr_redemption.sql',
        ledgerName: 'coupon_qr_redemption_217',
        version: '20260909134818',
      },
    ])
    expect(plan.apply.map((a) => a.file)).toEqual([
      '162_cron_schedule.sql',
      '184_orders_monthly_partitioning.sql',
      '240_perf.sql',
      '242_job_dlq.sql',
    ])
  })

  it('blocks a vault reader and a file without a rollback, and names the preflight', () => {
    const plan = planMigrations({ files, ledger, measuredAt: '2026-09-17T06:00:00Z', now })
    const byFile = Object.fromEntries(plan.apply.map((a) => [a.file, a]))
    expect(byFile['162_cron_schedule.sql']).toMatchObject({
      blocked: true,
      reasons: ['reads vault secrets that must be seeded first'],
      preflight: 'preflight_162.sql',
    })
    expect(byFile['240_perf.sql']).toMatchObject({
      blocked: true,
      reasons: ['no written rollback'],
    })
    expect(byFile['184_orders_monthly_partitioning.sql']).toMatchObject({
      blocked: false,
      preflight: 'preflight_184.sql',
    })
    expect(byFile['242_job_dlq.sql']).toMatchObject({ blocked: false, preflight: null })
  })

  it('emits a complete apply_migration call per file, with the file body as the query', () => {
    const plan = planMigrations({ files, ledger, measuredAt: '2026-09-17T06:00:00Z', now })
    const call = plan.apply.find((a) => a.file === '242_job_dlq.sql').call
    expect(call).toEqual({
      tool: 'mcp__claude_ai_Supabase__apply_migration',
      project_id: 'ixvwfbuvfxxsjiywhbbb',
      name: 'job_dlq_242',
      query: files[0].sql,
    })
  })

  it('accepts an operator-supplied block reason', () => {
    const plan = planMigrations({
      files,
      ledger,
      measuredAt: '2026-09-17T06:00:00Z',
      now,
      blocked: { '242_job_dlq.sql': 'waiting for batch approval' },
    })
    expect(plan.apply.find((a) => a.file === '242_job_dlq.sql')).toMatchObject({
      blocked: true,
      reasons: ['waiting for batch approval'],
    })
  })

  it('marks a snapshot older than seven days as stale', () => {
    expect(planMigrations({ files, ledger, measuredAt: '2026-09-01T00:00:00Z', now }).stale).toBe(
      true,
    )
  })

  it('renders drift and order in the markdown', () => {
    const md = renderMarkdown(
      planMigrations({ files, ledger, measuredAt: '2026-09-17T06:00:00Z', now }),
    )
    expect(md).toContain('still in migrations/pending/ (move, do not apply)')
    expect(md).toContain('| 217_coupon_qr_redemption.sql | coupon_qr_redemption_217 |')
    expect(md).toContain('BLOCKED: reads vault secrets')
    expect(md).toContain('stop-and-ask case 3')
  })
})

describe('against the real directory and the saved ledger', () => {
  const snapshot = JSON.parse(readFileSync(LEDGER_SNAPSHOT, 'utf8'))
  const files = loadPendingFiles()

  it('loads every numbered pending file and the two preflights', () => {
    expect(files.length).toBeGreaterThan(5)
    expect(files.find((f) => f.name.startsWith('162_'))?.hasPreflight).toBe(true)
    expect(files.find((f) => f.name.startsWith('184_'))?.hasPreflight).toBe(true)
  })

  /**
   * Measured 2026-09-17: ten files were applied on 09-09/09-10 through MCP and
   * never moved out of pending/. The planner must SEE that, because a plan
   * that re-emits an applied file as an apply call is the double-apply
   * RUNBOOK §5.2 warns about. This pins the detection, not the drift: when the
   * files are moved, the expectation becomes an empty array and that is the
   * correct edit.
   */
  it('reports every pending file whose name is already in the production ledger', () => {
    const plan = planMigrations({
      files,
      ledger: snapshot.migrations,
      measuredAt: snapshot.measured_at,
    })
    const driftNumbers = plan.drift.map((d) => parseFileName(d.file).number).sort()
    const expectedApplied = ['217', '223', '224', '226', '227', '228', '231', '232', '233', '234']
    for (const n of expectedApplied) {
      const present = files.some((f) => f.name.startsWith(`${n}_`))
      if (present) expect(driftNumbers).toContain(n)
    }
    // And never an apply call for one of them.
    for (const a of plan.apply) expect(expectedApplied).not.toContain(parseFileName(a.file).number)
  })

  it('never emits an apply call whose name is already in the ledger', () => {
    const plan = planMigrations({
      files,
      ledger: snapshot.migrations,
      measuredAt: snapshot.measured_at,
    })
    const ledgerNames = new Set(snapshot.migrations.map((m) => m.name))
    for (const a of plan.apply) expect(ledgerNames.has(a.name)).toBe(false)
  })
})
