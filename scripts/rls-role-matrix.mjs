#!/usr/bin/env node
/**
 * Measures what each role can read in every public table, on production,
 * without leaving a row: one transaction per role, `SET LOCAL ROLE` plus the
 * JWT claims a real session would carry, `count(*)` on every table through a
 * temp function that turns a privilege error into the word `denied`, then
 * ROLLBACK. Writes supabase/rls-role-matrix.json.
 *
 * WHY NOT pgTAP. A pgTAP suite runs inside a database; this machine has no
 * local one it can run (docs/DB-RESTORE-RUNBOOK.md), and the hosted database
 * is the only one with the real policies. This script asks that database the
 * pgTAP question and keeps the answer where a test can read it.
 *
 * Auth: the Supabase CLI's login token, read from the macOS keychain the way
 * the CLI stores it (`go-keyring-base64:` + base64). Nothing here is written
 * to disk except the JSON, and no DDL is ever sent.
 *
 *   node scripts/rls-role-matrix.mjs [--project <ref>]
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const PROJECT = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : 'ixvwfbuvfxxsjiywhbbb'
const OUT = 'supabase/rls-role-matrix.json'

// Identities: the two e2e fixtures the repo seeds plus two production rows
// resolved by role, never a hard-coded admin id.
const ROLE_LOOKUPS = {
  customer: "select id from auth.users where email = 'e2e-customer@test.kenyonexpress.local'",
  supplier_member:
    "select id from auth.users where email = 'e2e-supplier@test.kenyonexpress.local'",
  customer_no_orders:
    "select p.id from public.profiles p where p.role::text = 'customer' and not exists (select 1 from public.orders o where o.user_id = p.id) order by p.created_at limit 1",
  admin: "select id from public.profiles where role::text = 'admin' order by created_at limit 1",
}

function token() {
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
    encoding: 'utf8',
  }).trim()
  const b64 = raw.startsWith('go-keyring-base64:') ? raw.slice('go-keyring-base64:'.length) : raw
  return Buffer.from(b64, 'base64').toString('utf8')
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body).slice(0, 300)}`)
  return body
}

const COUNT_FN = `
CREATE OR REPLACE FUNCTION pg_temp.count_or_err(t text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN
  BEGIN EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n; RETURN n::text;
  EXCEPTION WHEN insufficient_privilege THEN RETURN 'denied'; WHEN OTHERS THEN RETURN 'error:' || SQLSTATE; END;
END $$;`

const MATRIX_SELECT = `
SELECT jsonb_object_agg(x.tablename, x.result) AS m FROM (
  SELECT c.relname AS tablename, pg_temp.count_or_err(c.relname) AS result
  FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
) x;`

function claims(userId) {
  return `set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '${userId}', true);`
}

async function measure(setup) {
  const rows = await sql(`BEGIN;\n${COUNT_FN}\n${setup}\n${MATRIX_SELECT}\nROLLBACK;`)
  const m = rows?.[0]?.m
  if (!m) throw new Error('no matrix returned')
  return Object.fromEntries(Object.entries(m).sort(([a], [b]) => a.localeCompare(b)))
}

const ids = {}
for (const [role, lookup] of Object.entries(ROLE_LOOKUPS)) {
  const rows = await sql(lookup)
  ids[role] = rows?.[0]?.id ?? null
  if (!ids[role]) throw new Error(`no identity found for ${role}`)
}

const matrix = {
  anon: await measure('set local role anon;'),
  customer: await measure(claims(ids.customer)),
  customer_no_orders: await measure(claims(ids.customer_no_orders)),
  supplier_member: await measure(claims(ids.supplier_member)),
  admin: await measure(claims(ids.admin)),
  service_role: await measure(''),
}

const out = {
  $what:
    "Rows visible to each role in every public table, measured against production inside rolled-back transactions (SET LOCAL ROLE + request.jwt.claims). 'denied' is a privilege error, a number is count(*).",
  $why: 'pgTAP needs a database to run in and this project has none it can run one in; the matrix is the same assertion taken from the only database that exists, and src/lib/auth/rls-role-matrix.test.ts holds the invariants it must keep.',
  $how: 'node scripts/rls-role-matrix.mjs (needs the Supabase CLI login on this machine); re-measure after any policy change.',
  measured_at: new Date().toISOString().slice(0, 10),
  roles: {
    anon: 'no session',
    customer: 'the e2e customer fixture, role customer, with orders of its own',
    customer_no_orders: 'a production customer with no orders',
    supplier_member: 'the e2e supplier fixture, an owner member of one supplier',
    admin: 'a production account with role admin',
    service_role: 'no SET ROLE: the management connection, which bypasses RLS',
  },
  matrix,
}
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`)
console.log(
  `${OUT}: ${Object.keys(matrix.anon).length} tables x ${Object.keys(matrix).length} roles`,
)
