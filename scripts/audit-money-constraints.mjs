#!/usr/bin/env node
/**
 * THE FOUR CONSTRAINTS THAT MAKE A REPLAYED MONEY OPERATION A NO-OP.
 *
 * Every replay defence on the money path is a UNIQUE constraint plus code that
 * treats 23505 as "already done". `supabase/migrations/060_idempotency_keys.sql`
 * enumerates them:
 *
 *   payments.idempotency_key                          UNIQUE
 *   ledger_journals.event_key                         UNIQUE
 *   payment_webhook_events(provider, external_event_id) UNIQUE
 *   wallet_entries.idempotency_key                    UNIQUE
 *
 * WHY THIS SCRIPT EXISTS. The Cardcom webhook inserts first and reads the error
 * code: a unique violation means Cardcom delivered the same callback twice and
 * the second is a no-op. WITHOUT THE CONSTRAINT the insert succeeds, the replay
 * is processed as a fresh event, and a charged card is finalised twice. The
 * code is correct and its correctness is entirely borrowed from the schema.
 *
 * AND THE SCHEMA CANNOT BE READ FROM THIS CHECKOUT. `supabase/migrations/`
 * declares all four, and this project's own notes record that that directory
 * DOES NOT DESCRIBE PRODUCTION - the hosted database is a different lineage.
 * The generated types describe production and do not express uniqueness. The
 * anon key sees none of these tables (PostgREST's schema doc lists zero), and
 * the admin key in `.env.local` answers 401.
 *
 * So this asks the catalogue, the same way `audit-role-separation.mjs` does and
 * for the same reason: pg_constraint is not reachable through PostgREST at all.
 *
 *   node scripts/audit-money-constraints.mjs           # needs SUPABASE_DB_URL
 *   node scripts/audit-money-constraints.mjs --sql     # print the query
 *   node scripts/audit-money-constraints.mjs --from m.json
 *
 * Exit: 0 all present, 1 something missing, 2 could not check.
 * It never reports "present" for a constraint it did not see.
 */
import { readFileSync } from 'node:fs'

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? null : (process.argv[i + 1] ?? null)
}
const PRINT_SQL = process.argv.includes('--sql')
const FROM = arg('from')

/** table -> the columns whose combination must be unique. */
const REQUIRED = [
  ['payments', ['idempotency_key'], 'a retried charge would create a second payment row'],
  ['ledger_journals', ['event_key'], 'a replayed journal would double-post the ledger'],
  [
    'payment_webhook_events',
    ['provider', 'external_event_id'],
    'a redelivered Cardcom callback would be finalised a second time on a card already charged',
  ],
  ['wallet_entries', ['idempotency_key'], 'a replayed wallet write would credit twice'],
]

const SQL = `
select c.conrelid::regclass::text as table_name,
       c.conname                  as constraint_name,
       array_agg(a.attname order by k.ord) as columns
  from pg_constraint c
  join lateral unnest(c.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
  join pg_namespace n on n.oid = c.connamespace
 where n.nspname = 'public'
   and c.contype in ('u', 'p')
   and c.conrelid::regclass::text in
       ('payments','ledger_journals','payment_webhook_events','wallet_entries')
 group by 1, 2
 order by 1, 2`

if (PRINT_SQL) {
  console.log(SQL.trim())
  process.exit(0)
}

function report(rows) {
  const have = new Map()
  for (const r of rows) {
    const cols = Array.isArray(r.columns) ? r.columns : String(r.columns ?? '').split(',')
    const key = `${r.table_name}:${cols
      .map((c) => String(c).trim())
      .sort()
      .join(',')}`
    have.set(key, r.constraint_name)
  }
  const missing = []
  for (const [table, cols, consequence] of REQUIRED) {
    const key = `${table}:${[...cols].sort().join(',')}`
    if (have.has(key)) console.log(`  OK       ${table}(${cols.join(', ')})  -> ${have.get(key)}`)
    else missing.push([table, cols, consequence])
  }
  if (missing.length === 0) {
    console.log(`\naudit-money-constraints: all ${REQUIRED.length} replay defences are in place`)
    process.exit(0)
  }
  console.error(`\naudit-money-constraints: ${missing.length} MISSING\n`)
  for (const [table, cols, consequence] of missing) {
    console.error(`  ${table}(${cols.join(', ')})`)
    console.error(`    without it: ${consequence}`)
  }
  process.exit(1)
}

if (FROM) {
  let parsed
  try {
    parsed = JSON.parse(readFileSync(FROM, 'utf8'))
  } catch (error) {
    console.error(`audit-money-constraints: cannot read ${FROM}: ${error.message}`)
    process.exit(2)
  }
  report(Array.isArray(parsed) ? parsed : (parsed.rows ?? []))
}

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!dbUrl) {
  console.error('audit-money-constraints: no SUPABASE_DB_URL and no --from file.')
  console.error('')
  console.error('These four constraints are the ONLY thing standing between a redelivered')
  console.error('Cardcom callback and a second finalisation of a card that was already')
  console.error('charged. Reporting them present without looking would be worse than not')
  console.error('looking, so this refuses.')
  console.error('')
  console.error('  node scripts/audit-money-constraints.mjs --sql   # paste through MCP')
  console.error('  node scripts/audit-money-constraints.mjs --from result.json')
  process.exit(2)
}

const { Client } = await import('pg').catch(() => ({ Client: null }))
if (!Client) {
  console.error('audit-money-constraints: SUPABASE_DB_URL is set but `pg` is not installed.')
  process.exit(2)
}
const client = new Client({ connectionString: dbUrl })
await client.connect()
const { rows } = await client.query(SQL)
await client.end()
report(rows)
