#!/usr/bin/env node
/**
 * Re-measures RLS coverage and diffs it against supabase/rls-manifest.json.
 *
 * TWO INPUTS, BECAUSE THIS MACHINE ONLY HAS ONE OF THEM.
 *
 *   1. A Postgres connection, if SUPABASE_DB_URL or DATABASE_URL is set. This
 *      is the path CI or an operator with the connection string takes, and it
 *      is the only fully automatic one.
 *   2. A JSON measurement on stdin or via --from <file>. This exists because
 *      the connection string is NOT available here: `.env.local` carries the
 *      project URL and keys only, and the PostgREST clients those keys open
 *      cannot read pg_class or pg_policies at all. What IS available is the
 *      Supabase MCP tool, which runs the query below and hands back rows. So
 *      the operator runs QUERY through MCP and pipes the result in.
 *
 * Either way the comparison, and therefore the verdict, is identical.
 *
 *   node scripts/check-rls.mjs                      # uses SUPABASE_DB_URL
 *   node scripts/check-rls.mjs --from measured.json # MCP output
 *   node scripts/check-rls.mjs --sql                # print the query and exit
 *   node scripts/check-rls.mjs --write              # rewrite the manifest's tables
 *
 * Exit 0 = manifest matches and every rule holds. Exit 1 = drift or a violation.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MANIFEST = resolve(process.cwd(), 'supabase/rls-manifest.json')

const QUERY = `select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname)::int as policy_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relname`

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const value = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

if (flag('sql')) {
  console.log(QUERY)
  process.exit(0)
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

/**
 * MCP hands back rows in more than one shape depending on how the query was
 * written (a bare select, or one wrapped in json_agg). Accepting all of them
 * beats making the operator reshape JSON by hand at the exact moment they are
 * checking whether the database is locked down.
 */
function normalise(parsed) {
  if (Array.isArray(parsed)) {
    if (parsed.length === 1 && typeof parsed[0]?.j === 'string') return JSON.parse(parsed[0].j)
    return parsed
  }
  if (Array.isArray(parsed?.tables)) return parsed.tables
  if (Array.isArray(parsed?.result)) return parsed.result
  throw new Error('unrecognised measurement shape')
}

async function measureFromDatabase(url) {
  const { default: postgres } = await import('postgres')
  const sql = postgres(url, { ssl: 'require', max: 1 })
  try {
    const rows = await sql.unsafe(QUERY)
    return rows.map((r) => ({
      table_name: r.table_name,
      rls_enabled: r.rls_enabled === true,
      policy_count: Number(r.policy_count),
    }))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function measure() {
  const fromFile = value('from')
  if (fromFile) return normalise(JSON.parse(readFileSync(fromFile, 'utf8')))

  const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  if (url) return measureFromDatabase(url)

  const piped = readStdin().trim()
  if (piped) return normalise(JSON.parse(piped))

  console.error('No measurement available.\n')
  console.error('Set SUPABASE_DB_URL, or run this query through the Supabase MCP tool')
  console.error('and pipe the rows back in:\n')
  console.error('  node scripts/check-rls.mjs --sql\n')
  console.error('  node scripts/check-rls.mjs --from measured.json')
  process.exit(2)
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const measured = (await measure())
  .map((r) => ({
    table_name: r.table_name,
    rls_enabled: r.rls_enabled === true,
    policy_count: Number(r.policy_count),
  }))
  .sort((a, b) => a.table_name.localeCompare(b.table_name))

const exempt = new Set(Object.keys(manifest.service_role_only).filter((k) => !k.startsWith('$')))
const problems = []

// Rule 1: RLS on, everywhere. No exceptions and no allowlist — a table in
// `public` with RLS off is readable by anon through PostgREST.
for (const row of measured) {
  if (!row.rls_enabled) problems.push(`RLS OFF: ${row.table_name}`)
}

// Rule 2: zero policies is allowed, but only where it was written down. RLS on
// with no policy denies every non-superuser role, which is the tightest state
// available — the failure mode worth catching is nobody having decided that.
for (const row of measured) {
  if (row.policy_count === 0 && !exempt.has(row.table_name)) {
    problems.push(`no policies and no service_role_only entry: ${row.table_name}`)
  }
}

// Rule 3: an exemption that no longer describes reality is worse than none.
for (const name of exempt) {
  const row = measured.find((r) => r.table_name === name)
  if (!row) problems.push(`service_role_only names ${name}, which no longer exists`)
  else if (row.policy_count > 0) {
    problems.push(`${name} now has ${row.policy_count} policies; drop the exemption`)
  }
}

// Drift against the committed snapshot, reported separately from the rules
// above: drift is a prompt to re-measure, a rule break is a security finding.
const before = new Map(manifest.tables.map((t) => [t.table_name, t]))
const after = new Map(measured.map((t) => [t.table_name, t]))
const drift = []
for (const [name, row] of after) {
  const old = before.get(name)
  if (!old) drift.push(`+ ${name} (new since ${manifest.measured_at})`)
  else if (old.rls_enabled !== row.rls_enabled || old.policy_count !== row.policy_count) {
    drift.push(
      `~ ${name}: rls ${old.rls_enabled}->${row.rls_enabled}, policies ${old.policy_count}->${row.policy_count}`,
    )
  }
}
for (const name of before.keys()) {
  if (!after.has(name)) drift.push(`- ${name} (gone since ${manifest.measured_at})`)
}

if (flag('write')) {
  manifest.tables = measured
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`manifest rewritten with ${measured.length} tables (measured_at NOT touched —`)
  console.log('set it by hand to the date you actually measured)')
}

console.log(`measured ${measured.length} tables in public`)
console.log(`RLS on: ${measured.filter((r) => r.rls_enabled).length}`)
console.log(`no policies (deny-all): ${measured.filter((r) => r.policy_count === 0).length}`)

if (drift.length) {
  console.log(`\ndrift vs manifest (${manifest.measured_at}):`)
  for (const line of drift) console.log(`  ${line}`)
}

if (problems.length) {
  console.error('\nFAIL:')
  for (const line of problems) console.error(`  ${line}`)
  process.exit(1)
}

if (drift.length && !flag('write')) {
  console.error('\nFAIL: manifest is stale. Re-run with --write and update measured_at.')
  process.exit(1)
}

console.log('\nOK')
