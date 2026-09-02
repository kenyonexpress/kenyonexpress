#!/usr/bin/env node
/**
 * Structural (and optional live) dry-run of every SQL file that could hit
 * production.
 *
 * Always: read every .sql in migrations/pending and supabase/migrations, reject
 * empty files and statements that have no business in a migration
 * (DROP DATABASE, ALTER DATABASE, COPY FROM PROGRAM). Cross-check the remaining
 * list in docs/APPLY-ORDER.md against the files on disk.
 *
 * Optional live pass: if DATABASE_URL or CI_SUPABASE_DB_URL is set, wrap each
 * remaining pending file in a transaction and ROLLBACK. The production project
 * ref is refused by name so this job cannot dry-run against the live database.
 *
 * Exit: 0 clean, 1 failed, 2 APPLY-ORDER missing.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const PENDING_DIR = 'migrations/pending'
export const APPLIED_DIR = 'supabase/migrations'
export const APPLY_ORDER = 'docs/APPLY-ORDER.md'
export const PRODUCTION_PROJECT_REF = 'ixvwfbuvfxxsjiywhbbb'

const FORBIDDEN = [
  /\bDROP\s+DATABASE\b/i,
  /\bALTER\s+DATABASE\b/i,
  /\bCOPY\s+\S+\s+FROM\s+PROGRAM\b/i,
]

export function sqlFiles(dir) {
  return readdirSync(resolve(process.cwd(), dir))
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

export function parseApplyOrder(text) {
  const remaining = []
  const applied = []
  let section = null
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s+Remaining\b/i.test(line)) section = 'remaining'
    else if (/^##\s+Already applied\b/i.test(line)) section = 'applied'
    else if (/^##\s+/.test(line)) section = null
    const match = line.match(/(\d{3}[a-z]?_[\w-]+\.sql)/)
    if (!match || !section) continue
    const number = Number.parseInt(match[1].slice(0, 3), 10)
    // 085 and other applied-history files are named in rollback notes. They are
    // not in migrations/pending/ and must not join this list.
    if (number < 122) continue
    if (section === 'remaining' && !remaining.includes(match[1])) remaining.push(match[1])
    if (section === 'applied' && !applied.includes(match[1])) applied.push(match[1])
  }
  return { remaining, applied }
}

export function inspectSql(filename, source) {
  const errors = []
  if (!source.trim()) errors.push(`${filename}: empty file`)
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
  for (const re of FORBIDDEN) {
    if (re.test(code)) errors.push(`${filename}: forbidden statement ${re}`)
  }
  if (!source.includes(';')) errors.push(`${filename}: no SQL statement terminator`)
  return errors
}

function refuseProductionUrl(url) {
  return url.includes(PRODUCTION_PROJECT_REF)
}

function liveDryRun(files, url) {
  if (refuseProductionUrl(url)) {
    console.error(
      `migration-dry-run: refusing to touch production project ${PRODUCTION_PROJECT_REF}`,
    )
    process.exit(1)
  }
  for (const file of files) {
    const path = join(PENDING_DIR, file)
    const wrapped = `BEGIN;\n${readFileSync(path, 'utf8')}\nROLLBACK;\n`
    execFileSync('psql', [url, '-v', 'ON_ERROR_STOP=1', '-c', wrapped], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    console.log(`live rollback ok: ${file}`)
  }
}

export function runDryRun({ cwd = process.cwd(), env = process.env, live = true } = {}) {
  const errors = []
  const pending = sqlFiles(PENDING_DIR)
  const appliedDir = sqlFiles(APPLIED_DIR)

  for (const dir of [PENDING_DIR, APPLIED_DIR]) {
    for (const name of sqlFiles(dir)) {
      const source = readFileSync(join(dir, name), 'utf8')
      errors.push(...inspectSql(join(dir, name), source))
    }
  }

  let orderText
  try {
    orderText = readFileSync(resolve(cwd, APPLY_ORDER), 'utf8')
  } catch {
    return { ok: false, errors: [`${APPLY_ORDER} is missing`], pending, appliedDir }
  }
  const order = parseApplyOrder(orderText)
  const pendingSet = new Set(pending)
  for (const name of order.remaining) {
    if (!pendingSet.has(name)) errors.push(`APPLY-ORDER remaining names missing file: ${name}`)
  }
  for (const name of order.applied) {
    if (!pendingSet.has(name)) {
      errors.push(`APPLY-ORDER applied names missing pending file: ${name}`)
    }
  }
  const listed = new Set([...order.remaining, ...order.applied])
  for (const name of pending) {
    if (!listed.has(name)) errors.push(`pending file not listed in APPLY-ORDER.md: ${name}`)
  }

  const url = live ? env.CI_SUPABASE_DB_URL || env.DATABASE_URL || '' : ''
  return { ok: errors.length === 0, errors, pending, appliedDir, order, liveUrl: url }
}

function main() {
  const result = runDryRun()
  console.log(
    `migration-dry-run: pending=${result.pending.length} applied-dir=${result.appliedDir.length}`,
  )
  if (result.order) {
    console.log(
      `APPLY-ORDER remaining=${result.order.remaining.length} applied=${result.order.applied.length}`,
    )
  }
  if (!result.ok) {
    for (const err of result.errors) console.error(err)
    process.exit(result.errors.some((e) => e.includes('missing')) ? 2 : 1)
  }
  if (!result.liveUrl) {
    console.log(
      'migration-dry-run: no CI_SUPABASE_DB_URL/DATABASE_URL; structural pass only. Live ROLLBACK skipped.',
    )
    process.exit(0)
  }
  try {
    liveDryRun(result.order.remaining, result.liveUrl)
  } catch (err) {
    console.error(err.stderr || err.stdout || err.message)
    process.exit(1)
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)

if (isMain) main()
