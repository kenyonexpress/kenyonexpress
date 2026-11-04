#!/usr/bin/env node
/**
 * RLS smoke on the three money tables: orders, vouchers, wallet. Writes
 * supabase/rls-smoke.json; src/lib/auth/rls-smoke.test.ts holds the invariants.
 *
 * WHAT rls-role-matrix.mjs DOES NOT ANSWER. The matrix is count(*) per role, so
 * "customer sees 22 orders" passes whether those are the customer's 22 or
 * somebody else's. This script asks the isolation question directly: rows
 * visible to a customer that belong to ANOTHER user, and whether a customer
 * can write a row (insert, update, delete) that only the server may write.
 *
 * Every probe runs inside BEGIN ... ROLLBACK, as `SET LOCAL ROLE` with the JWT
 * claims a real session carries. A write that wrongly succeeds is reported and
 * then rolled back, so a failing smoke leaves production as it found it.
 *
 * Auth: SUPABASE_ACCESS_TOKEN (the CLI token from ~/.zshrc), falling back to
 * the keychain entry the CLI writes.
 *
 *   node scripts/rls-smoke.mjs [--project <ref>]
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const PROJECT = process.argv.includes('--project')
  ? process.argv[process.argv.indexOf('--project') + 1]
  : 'ixvwfbuvfxxsjiywhbbb'
const OUT = 'supabase/rls-smoke.json'

// Plain customers only: not admin, not support, no supplier membership, so
// every policy branch except "owner" is false and any foreign row is a leak.
const PLAIN_CUSTOMER = `p.role::text = 'customer'
  and not exists (select 1 from public.supplier_members sm where sm.user_id = p.id)`
const IDENTITIES = {
  customer: `select p.id from public.profiles p join auth.users u on u.id = p.id
    where u.email = 'e2e-customer@test.kenyonexpress.local' and ${PLAIN_CUSTOMER}`,
  customer_with_wallet: `select p.id from public.profiles p
    where ${PLAIN_CUSTOMER} and exists (select 1 from public.wallet_accounts w where w.user_id = p.id)
    order by p.created_at limit 1`,
  customer_no_orders: `select p.id from public.profiles p where ${PLAIN_CUSTOMER}
    and not exists (select 1 from public.orders o where o.user_id = p.id)
    order by p.created_at limit 1`,
}

function token() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.startsWith('sbp_'))
    return process.env.SUPABASE_ACCESS_TOKEN
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

// One probe = one statement. A read returns its count; a write returns the
// affected row count, or 'denied' on a privilege/RLS error. Generated
// columns (balance_ils_agorot, amount_ils_agorot) cannot be written by anyone,
// so the write probes target the base column they are derived from. Anything else is
// 'error:<sqlstate>' so a renamed column shows up as a red test, not a pass.
const PROBE_FN = `
CREATE OR REPLACE FUNCTION pg_temp.probe(q text, is_write boolean) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN
  BEGIN
    IF is_write THEN EXECUTE q; GET DIAGNOSTICS n = ROW_COUNT;
    ELSE EXECUTE q INTO n; END IF;
    RETURN n::text;
  EXCEPTION
    WHEN insufficient_privilege THEN RETURN 'denied';
    WHEN check_violation OR not_null_violation OR foreign_key_violation THEN RETURN 'denied';
    WHEN OTHERS THEN IF SQLSTATE = '42501' THEN RETURN 'denied'; END IF; RETURN 'error:' || SQLSTATE;
  END;
END $$;`

const me = '(select auth.uid())'
const READS = {
  // Positive controls: a policy that denied everything would also read 0
  // foreign rows. These prove the owner branch still works.
  orders_own: `select count(*) from public.orders where user_id = ${me}`,
  wallet_accounts_own: `select count(*) from public.wallet_accounts where user_id = ${me}`,
  orders_foreign: `select count(*) from public.orders where user_id is distinct from ${me}`,
  order_items_foreign: `select count(*) from public.order_items i join public.orders o on o.id = i.order_id where o.user_id is distinct from ${me}`,
  vouchers_foreign: `select count(*) from public.vouchers where user_id is distinct from ${me}`,
  voucher_redemptions_foreign: `select count(*) from public.voucher_redemptions r join public.vouchers v on v.id = r.voucher_id where v.user_id is distinct from ${me}`,
  wallet_accounts_foreign: `select count(*) from public.wallet_accounts where user_id is distinct from ${me}`,
  wallet_entries_foreign: `select count(*) from public.wallet_entries e where not exists (select 1 from public.wallet_accounts a where a.user_id = ${me} and a.id in (e.debit_account, e.credit_account))`,
}
const WRITES = {
  orders_insert: `insert into public.orders (user_id, status) values (${me}, 'paid')`,
  orders_update_own: `update public.orders set status = 'paid' where user_id = ${me}`,
  orders_update_any: 'update public.orders set notes = notes',
  orders_delete_any: 'delete from public.orders',
  order_items_update_any: 'update public.order_items set platform_percent = 0',
  vouchers_update_own: `update public.vouchers set status = 'redeemed', remaining_amount_due_agorot = 0 where user_id = ${me}`,
  vouchers_update_any: 'update public.vouchers set status = status',
  vouchers_insert: `insert into public.vouchers (code, user_id, status) values ('rls-smoke', ${me}, 'issued')`,
  voucher_redemptions_insert: `insert into public.voucher_redemptions (voucher_id, outcome) values (gen_random_uuid(), 'success')`,
  wallet_accounts_update_own: `update public.wallet_accounts set balance_ils = 999999 where user_id = ${me}`,
  wallet_accounts_insert: `insert into public.wallet_accounts (user_id, code) values (${me}, 'rls-smoke')`,
  wallet_entries_insert: `insert into public.wallet_entries (debit_account, credit_account, amount_ils, reason) values (gen_random_uuid(), gen_random_uuid(), 1, 'rls-smoke')`,
  wallet_entries_delete_any: 'delete from public.wallet_entries',
}

function lit(s) {
  return `'${s.replaceAll("'", "''")}'`
}

function claims(userId) {
  return `set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${userId}","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '${userId}', true);`
}

async function measure(setup) {
  const pairs = [
    ...Object.entries(READS).map(([k, q]) => `${lit(k)}, pg_temp.probe(${lit(q)}, false)`),
    ...Object.entries(WRITES).map(([k, q]) => `${lit(k)}, pg_temp.probe(${lit(q)}, true)`),
  ]
  const rows = await sql(
    `BEGIN;\n${PROBE_FN}\n${setup}\nSELECT jsonb_build_object(${pairs.join(',\n')}) AS m;\nROLLBACK;`,
  )
  const m = rows?.[0]?.m
  if (!m) throw new Error('no probe result returned')
  return m
}

const ids = {}
for (const [role, lookup] of Object.entries(IDENTITIES)) {
  const rows = await sql(lookup)
  ids[role] = rows?.[0]?.id ?? null
  if (!ids[role]) throw new Error(`no identity found for ${role}`)
}

const results = { anon: await measure('set local role anon;') }
for (const [role, id] of Object.entries(ids)) results[role] = await measure(claims(id))
// The control: the management connection bypasses RLS, so its foreign counts
// must be non-zero. If they were 0 the reads above would prove nothing.
const control = await sql(
  `select ${Object.entries(READS)
    .filter(([k]) => k.endsWith('_foreign'))
    .map(([k, q]) => `(${q.replaceAll(me, 'null::uuid')}) as ${k}`)
    .join(', ')}`,
)

writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      $what:
        'Cross-user reads and forbidden writes on orders, vouchers and wallet, per role, on production inside rolled-back transactions. Reads are count(*) of rows owned by SOMEONE ELSE; writes are affected-row counts or denied.',
      $how: 'node scripts/rls-smoke.mjs; invariants in src/lib/auth/rls-smoke.test.ts',
      measured_at: new Date().toISOString().slice(0, 10),
      control_service_role: control?.[0] ?? null,
      results,
    },
    null,
    2,
  )}\n`,
)
for (const [role, m] of Object.entries(results)) console.log(role, JSON.stringify(m))
console.log('control', JSON.stringify(control?.[0]))
