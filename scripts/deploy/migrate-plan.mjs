#!/usr/bin/env node
/**
 * Migrations through MCP: the plan, not the apply.
 *
 * The rule (CLAUDE.md, docs/RUNBOOK.md §5.2): `db push` is forbidden, a schema
 * change is a file in migrations/pending/, and it reaches production through
 * the Supabase MCP `apply_migration` tool after explicit approval. This
 * script is the step between the file and that tool call. It reads the
 * directory, reads the production ledger (a saved `list_migrations` result),
 * and emits the ordered list of `apply_migration` calls that are actually
 * still needed, with every reason a file must NOT be applied spelled out.
 *
 *   node scripts/deploy/migrate-plan.mjs                 # markdown plan to stdout
 *   node scripts/deploy/migrate-plan.mjs --json plan.json
 *   node scripts/deploy/migrate-plan.mjs --ledger fresh.json
 *   node scripts/deploy/migrate-plan.mjs --check         # exit 1 on drift
 *
 * What it catches that a directory listing cannot:
 *   - a file still in pending/ whose name is already in the ledger (applied,
 *     never moved: ten of them on 2026-09-17)
 *   - a file with no written rollback
 *   - a file whose preflight_NNN.sql exists and therefore must run first
 *   - a file that reads vault secrets and is blocked until they are seeded
 *   - a ledger snapshot too old to plan from
 *
 * It never connects to anything. The agent holding the MCP session pastes
 * the emitted calls one at a time, in order, and re-runs this after each.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
export const PENDING_DIR = join(ROOT, 'migrations', 'pending')
export const LEDGER_SNAPSHOT = join(ROOT, 'migrations', 'ledger.snapshot.json')
export const PROJECT_ID = 'ixvwfbuvfxxsjiywhbbb'
export const SNAPSHOT_MAX_AGE_DAYS = 7

/** `217_coupon_qr_redemption.sql` -> { number: '217', slug: 'coupon_qr_redemption' } */
export function parseFileName(fileName) {
  const base = fileName.replace(/\.sql$/, '')
  const m = base.match(/^(\d{3}[a-z]?)_(.+)$/)
  if (!m) return { number: null, slug: base }
  return { number: m[1], slug: m[2] }
}

/**
 * Ledger names come in three shapes and this normalises all of them to the
 * same key as parseFileName:
 *   `coupon_qr_redemption_217`  (number last, the MCP apply convention here)
 *   `217_coupon_qr_redemption`  (number first)
 *   `restore_carts`             (no number)
 */
export function parseLedgerName(name) {
  let m = name.match(/^(\d{3}[a-z]?)_(.+)$/)
  if (m) return { number: m[1], slug: m[2] }
  m = name.match(/^(.+)_(\d{3}[a-z]?)$/)
  if (m) return { number: m[2], slug: m[1] }
  return { number: null, slug: name }
}

/**
 * A pending file is applied when a ledger row carries the same slug, and,
 * when both sides carry a number, the same number. Number alone is not
 * enough: 169, 172, 126, 127 and 093 each appear twice in the ledger under
 * different slugs.
 */
export function ledgerMatch(fileName, ledger) {
  const file = parseFileName(fileName)
  return (
    ledger.find((row) => {
      const l = parseLedgerName(row.name)
      if (l.slug !== file.slug) return false
      if (l.number && file.number && l.number !== file.number) return false
      return true
    }) ?? null
  )
}

/** The name `apply_migration` should record, in this repo's convention: slug then number. */
export function mcpMigrationName(fileName) {
  const { number, slug } = parseFileName(fileName)
  return number ? `${slug}_${number}` : slug
}

export function hasRollback(sql) {
  return /--.*\brollback\b/i.test(sql)
}

export function readsVault(sql) {
  return /vault\.decrypted_secrets/i.test(sql)
}

/** Statements that cannot run in a transaction and must be applied one at a time. */
export function needsSplitApply(sql) {
  return /CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(sql)
}

export function snapshotAgeDays(measuredAt, now = new Date()) {
  const measured = new Date(measuredAt)
  if (Number.isNaN(measured.getTime())) return Number.POSITIVE_INFINITY
  return (now.getTime() - measured.getTime()) / 86_400_000
}

/**
 * The plan, from data only. `files` is [{ name, sql, hasPreflight }], `ledger`
 * is the migrations array from list_migrations.
 */
export function planMigrations({ files, ledger, measuredAt, now = new Date(), blocked = {} }) {
  const stale = snapshotAgeDays(measuredAt, now) > SNAPSHOT_MAX_AGE_DAYS
  const drift = []
  const apply = []
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    const match = ledgerMatch(file.name, ledger)
    if (match) {
      drift.push({ file: file.name, ledgerName: match.name, version: match.version })
      continue
    }
    const reasons = []
    if (!hasRollback(file.sql)) reasons.push('no written rollback')
    if (readsVault(file.sql)) reasons.push('reads vault secrets that must be seeded first')
    if (blocked[file.name]) reasons.push(blocked[file.name])
    apply.push({
      file: file.name,
      name: mcpMigrationName(file.name),
      preflight: file.hasPreflight ? `preflight_${parseFileName(file.name).number}.sql` : null,
      splitApply: needsSplitApply(file.sql),
      blocked: reasons.length > 0,
      reasons,
      call: {
        tool: 'mcp__claude_ai_Supabase__apply_migration',
        project_id: PROJECT_ID,
        name: mcpMigrationName(file.name),
        query: file.sql,
      },
    })
  }
  return { stale, measuredAt, drift, apply }
}

export function renderMarkdown(plan) {
  const lines = []
  lines.push('# Migration plan (MCP apply_migration)')
  lines.push('')
  lines.push(
    `Ledger measured: ${plan.measuredAt}${plan.stale ? '  **STALE, refresh before applying**' : ''}`,
  )
  lines.push('')
  if (plan.drift.length > 0) {
    lines.push('## Applied in production but still in migrations/pending/ (move, do not apply)')
    lines.push('')
    lines.push('| file | ledger name | version |')
    lines.push('| --- | --- | --- |')
    for (const d of plan.drift) lines.push(`| ${d.file} | ${d.ledgerName} | ${d.version} |`)
    lines.push('')
  }
  lines.push('## To apply, in this order')
  lines.push('')
  lines.push('| # | file | apply_migration name | preflight | status |')
  lines.push('| --- | --- | --- | --- | --- |')
  plan.apply.forEach((a, i) => {
    const status = a.blocked
      ? `BLOCKED: ${a.reasons.join('; ')}`
      : a.splitApply
        ? 'ready (apply statement by statement)'
        : 'ready'
    lines.push(`| ${i + 1} | ${a.file} | ${a.name} | ${a.preflight ?? ''} | ${status} |`)
  })
  lines.push('')
  lines.push(
    'Each ready row is one `apply_migration` call with `project_id`, `name` and the file body as `query`.',
  )
  lines.push(
    'Run the preflight through `execute_sql` first where one is listed, and re-run this planner after every apply.',
  )
  lines.push('Nothing here runs without explicit approval (CLAUDE.md, stop-and-ask case 3).')
  return lines.join('\n')
}

export function loadPendingFiles(dir = PENDING_DIR) {
  const names = readdirSync(dir).filter((n) => /^\d{3}[a-z]?_.+\.sql$/.test(n))
  return names.map((name) => ({
    name,
    sql: readFileSync(join(dir, name), 'utf8'),
    hasPreflight: existsSync(join(dir, `preflight_${parseFileName(name).number}.sql`)),
  }))
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const [key, inline] = arg.slice(2).split('=', 2)
    out[key] = inline ?? (argv[i + 1]?.startsWith('--') ? 'true' : (argv[++i] ?? 'true'))
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const ledgerPath = args.ledger ? resolve(args.ledger) : LEDGER_SNAPSHOT
  const snapshot = JSON.parse(readFileSync(ledgerPath, 'utf8'))
  const ledger = snapshot.migrations ?? snapshot
  const measuredAt = snapshot.measured_at ?? new Date(0).toISOString()
  const plan = planMigrations({ files: loadPendingFiles(), ledger, measuredAt })

  if (args.json) {
    writeFileSync(args.json, JSON.stringify(plan, null, 2))
    console.log(
      `migrate-plan: wrote ${args.json} (${plan.apply.length} to apply, ${plan.drift.length} drift)`,
    )
  } else {
    console.log(renderMarkdown(plan))
  }

  if (args.check === 'true') {
    if (plan.drift.length > 0) {
      console.error(
        `migrate-plan: ${plan.drift.length} applied file(s) still in migrations/pending/`,
      )
      return 1
    }
    if (plan.stale) {
      console.error('migrate-plan: ledger snapshot is stale')
      return 1
    }
  }
  return 0
}

if (process.argv[1]?.endsWith('migrate-plan.mjs')) {
  main().then((code) => {
    process.exitCode = code
  })
}
