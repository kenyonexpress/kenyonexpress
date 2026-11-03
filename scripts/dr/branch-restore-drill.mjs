#!/usr/bin/env node
/**
 * Restore drill onto the Supabase staging branch (C189).
 *
 *   node scripts/dr/branch-restore-drill.mjs [--keychain] [--keep] [--tables=a,b]
 *
 * restore-drill.mjs (C71) never restored anything: its "production counts"
 * were the string "(manual verification needed)". This one does the round
 * trip with nothing but the management API's /database/query, so it needs no
 * database password, no pg_dump and no pg_restore:
 *
 *   1. production (read-only): per table, row count, a checksum over every
 *      row as jsonb text, and the rows themselves as JSON.
 *   2. staging branch: load those rows into a scratch schema `dr_drill`, both
 *      raw (jsonb, for the checksum) and typed (json_populate_recordset onto
 *      the branch's own public.<table>, proving the rows fit the schema).
 *   3. compare count and checksum, production vs restored. Exit 1 on any
 *      mismatch.
 *   4. drop `dr_drill` unless --keep. Only the scratch schema this script
 *      created is dropped; public.* on the branch is never written.
 *
 * Production is never written. Token: SUPABASE_ACCESS_TOKEN, or the CLI
 * keychain entry with --keychain.
 */

import { API_BASE, managementToken, projectRef } from './supabase-mgmt.mjs'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const opt = (name, fallback) =>
  argv.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback

const BRANCH_REF = process.env.SUPABASE_BRANCH_REF?.trim() || 'sjojzzppqhjxvjlvnwdb'
const TABLES = opt(
  '--tables',
  'categories,suppliers,products,vouchers,orders,order_items,seo_redirects',
)
  .split(',')
  .map((t) => t.trim())
  .filter((t) => /^[a-z_][a-z0-9_]*$/.test(t))
const CHUNK = 200

const token = managementToken(process.env, { allowKeychain: has('--keychain') })
if (!token) {
  console.error('error no SUPABASE_ACCESS_TOKEN (or pass --keychain)')
  process.exit(1)
}
const prodRef = projectRef()

async function query(ref, sql) {
  const res = await fetch(`${API_BASE}/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: sql }),
    signal: AbortSignal.timeout(120_000),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${ref} ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : []
}

const lit = (s) => `'${String(s).replaceAll("'", "''")}'`
// Same expression on both sides: jsonb text is canonical (sorted keys, one
// spacing), so equal rows give equal text whichever database produced them.
const checksumSql = (expr, from) =>
  `select count(*)::int as n, coalesce(md5(string_agg(${expr}::text, E'\\n' order by ${expr}::text)), '') as md5 from ${from}`

const t0 = Date.now()
console.log(`restore drill ${new Date().toISOString()}`)
console.log(`source  ${prodRef} (production, read-only)`)
console.log(`target  ${BRANCH_REF} (staging branch, scratch schema dr_drill)`)

await query(BRANCH_REF, 'drop schema if exists dr_drill cascade; create schema dr_drill;')

const rows = []
let failed = 0
for (const table of TABLES) {
  const started = Date.now()
  const r = { table, prod: null, raw: null, typed: null, note: '' }
  try {
    const [src] = await query(prodRef, checksumSql('to_jsonb(t)', `public.${table} t`))
    r.prod = src
    const [{ data }] = await query(
      prodRef,
      `select coalesce(json_agg(to_jsonb(t)::text), '[]'::json) as data from public.${table} t`,
    )
    // Each row stays a jsonb TEXT string end to end. Parsing rows into JS
    // objects rounds numerics (10.50 -> 10.5) and big ints, which changes
    // the restored bytes; the first run of this drill measured exactly that.
    const records = typeof data === 'string' ? JSON.parse(data) : data

    await query(BRANCH_REF, `create table dr_drill.${table}_raw (row jsonb not null);`)
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = JSON.stringify(records.slice(i, i + CHUNK))
      await query(
        BRANCH_REF,
        `insert into dr_drill.${table}_raw (row) select value::jsonb from jsonb_array_elements_text(${lit(chunk)}::jsonb);`,
      )
    }
    const [raw] = await query(BRANCH_REF, checksumSql('row', `dr_drill.${table}_raw`))
    r.raw = raw

    try {
      await query(
        BRANCH_REF,
        `create table dr_drill.${table}_typed as select * from jsonb_populate_recordset(null::public.${table}, (select coalesce(jsonb_agg(row), '[]'::jsonb) from dr_drill.${table}_raw));`,
      )
      const [typed] = await query(
        BRANCH_REF,
        `select count(*)::int as n from dr_drill.${table}_typed`,
      )
      r.typed = typed.n
    } catch (e) {
      r.note = `typed load failed: ${e.message.slice(0, 120)}`
    }
  } catch (e) {
    r.note = e.message.slice(0, 160)
  }
  const ok =
    r.prod && r.raw && r.prod.n === r.raw.n && r.prod.md5 === r.raw.md5 && r.typed === r.prod.n
  if (!ok) failed++
  r.ok = ok
  r.ms = Date.now() - started
  rows.push(r)
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${table.padEnd(14)} prod n=${r.prod?.n ?? '-'} md5=${r.prod?.md5 ?? '-'} | restored n=${r.raw?.n ?? '-'} md5=${r.raw?.md5 ?? '-'} typed=${r.typed ?? '-'} ${r.ms}ms ${r.note}`,
  )
}

if (!has('--keep')) {
  await query(BRANCH_REF, 'drop schema if exists dr_drill cascade;')
  const left = await query(
    BRANCH_REF,
    "select count(*)::int as n from pg_namespace where nspname = 'dr_drill'",
  )
  console.log(`cleanup dr_drill schemas left on branch: ${left[0].n}`)
}

const total = rows.reduce((s, r) => s + (r.prod?.n ?? 0), 0)
console.log(
  `result  ${rows.length - failed}/${rows.length} tables identical, ${total} rows, ${((Date.now() - t0) / 1000).toFixed(1)}s elapsed`,
)
process.exit(failed ? 1 : 0)
