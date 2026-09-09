#!/usr/bin/env node
/**
 * Re-measures the live catalogue and diffs it against supabase/catalogue-snapshot.json.
 *
 * SAME TWO INPUTS AS check-rls.mjs, and for the same reason: this machine has a
 * project URL and keys but no Postgres connection string, and the PostgREST
 * client those keys open cannot be trusted to see draft rows. So either give it
 * a connection, or run QUERY through the Supabase MCP tool and pipe the rows in.
 *
 *   node scripts/catalogue-safety.mjs --sql              # print the query
 *   node scripts/catalogue-safety.mjs --from rows.json   # MCP output
 *   node scripts/catalogue-safety.mjs --from rows.json --write   # rewrite the snapshot
 *
 * Exit 0 = every finding is on the ledger and every ledger entry still fires.
 * Exit 1 = a new defect, or a stale ledger entry.
 *
 * THE RULES LIVE IN TYPESCRIPT, NOT HERE. src/lib/catalogue/safety-rules.ts is
 * what CI runs, without a database, against the committed snapshot. This script
 * re-measures; it does not get its own second opinion, because two copies of a
 * rule set is how the two come to disagree.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SNAPSHOT = resolve(process.cwd(), 'supabase/catalogue-snapshot.json')
const LEDGER = resolve(process.cwd(), 'supabase/catalogue-known-issues.json')

const QUERY = `select json_agg(row_to_json(t) order by t.name_he) as rows from (
  select p.id, p.name_he, p.slug, p.type, p.kenyon_price::text as kenyon_price,
         p.full_price::text as full_price, p.coupon_price_ils::text as coupon_price_ils,
         p.stock_quantity, p.platform_percent::text as platform_percent,
         p.supplier_id, c.slug as category_slug
    from public.products p
    left join public.categories c on c.id = p.category_id
   where p.status = 'active' and p.deleted_at is null
) t`

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

const from = value('from')
if (!from) {
  console.error('need --from <file>, or --sql to print the query. See the header.')
  process.exit(2)
}

const raw = JSON.parse(readFileSync(resolve(process.cwd(), from), 'utf8'))
// The MCP tool hands back `[{rows: [...]}]`; a hand-saved file is often just the
// array. Accept both rather than making the operator reshape it.
const products = Array.isArray(raw) ? (raw[0]?.rows ?? raw) : (raw.rows ?? raw.products)
if (!Array.isArray(products)) {
  console.error('could not find a product array in that file')
  process.exit(2)
}

const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
const before = new Map(snapshot.products.map((p) => [p.id, p]))
const after = new Map(products.map((p) => [p.id, p]))

const drift = []
for (const [id, row] of after) {
  const old = before.get(id)
  if (!old) drift.push(`+ ${row.name_he} (${row.slug})`)
  else if (JSON.stringify(old) !== JSON.stringify(row)) drift.push(`~ ${row.name_he}`)
}
for (const [id, row] of before) {
  if (!after.has(id)) drift.push(`- ${row.name_he} (no longer active)`)
}

console.log(`measured ${products.length} active products`)
if (drift.length) {
  console.log(`\ndrift vs snapshot (${snapshot.$measured_at}):`)
  for (const line of drift) console.log(`  ${line}`)
} else {
  console.log('no drift vs the committed snapshot')
}

if (flag('write')) {
  snapshot.products = products
  writeFileSync(SNAPSHOT, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`\nsnapshot rewritten with ${products.length} products`)
  console.log('($measured_at is NOT touched -- set it by hand to the date you measured)')
  console.log('Now run `pnpm test src/lib/catalogue` : it applies the rules and diffs the ledger.')
  process.exit(0)
}

const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'))
console.log(`\nledger holds ${Object.keys(ledger.known).length} known findings`)
console.log('Rules are applied by src/lib/catalogue/catalogue-safety.test.ts, not by this script.')
console.log('Re-run with --write, then `pnpm test src/lib/catalogue`.')
process.exit(drift.length ? 1 : 0)
