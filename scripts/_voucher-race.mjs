#!/usr/bin/env node
/**
 * Concurrent double-scan: two cashiers scan the same voucher at the same
 * instant, and exactly one of them may collect.
 *
 *   node scripts/_voucher-race.mjs
 *
 * This cannot live in tests/sql/voucher_redemption_lifecycle.sql. One psql
 * session is one connection, and a race needs two transactions in flight at
 * once; a sequential rescan in a single session proves only that a committed
 * redemption is visible afterwards, which is a much weaker claim and is what
 * the harness already covers.
 *
 * WHAT IS ACTUALLY BEING TESTED. redeem_voucher() decides the race with one
 * conditional UPDATE whose predicate includes `status = 'issued'`. The first
 * transaction takes the row lock. The second blocks there rather than reading
 * stale data, and when the first commits the second re-evaluates the predicate
 * under READ COMMITTED, matches zero rows, and reports already_redeemed. If
 * anyone ever splits that into a SELECT-then-UPDATE, both scans succeed, the
 * business hands over goods twice against one voucher, and this script is what
 * says so.
 *
 * Fixtures are committed rather than wrapped in a transaction, because two
 * connections cannot see each other's uncommitted rows. They are removed in a
 * finally block, and every id is generated per run, so a crashed run leaves
 * rows that belong to no other run rather than corrupting the next one.
 */

import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres'

// Crockford base32 without I, L, O, U, matching vouchers_code_format.
const CODE = `RACE${Math.floor(Math.random() * 900000 + 100000)}`

const ids = {
  supplier: randomUUID(),
  product: randomUUID(),
  buyer: randomUUID(),
  scannerA: randomUUID(),
  scannerB: randomUUID(),
  order: randomUUID(),
  item: randomUUID(),
  voucher: randomUUID(),
}

const sql = postgres(DB_URL, { max: 4, onnotice: () => {} })

function fail(message) {
  console.error(`\n  FAIL  ${message}\n`)
  process.exitCode = 1
}

async function seed() {
  await sql
    .unsafe(`ALTER TABLE public.wallet_accounts ALTER COLUMN owner_type SET DEFAULT 'user'`)
    .catch(() => {})

  await sql`
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at)
    SELECT u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
           u::text || '@race.local', '', now(), now(), now()
    FROM unnest(ARRAY[${ids.buyer}::uuid, ${ids.scannerA}::uuid, ${ids.scannerB}::uuid]) AS u`

  await sql`
    INSERT INTO public.profiles (id, email)
    SELECT u, u::text || '@race.local'
    FROM unnest(ARRAY[${ids.buyer}::uuid, ${ids.scannerA}::uuid, ${ids.scannerB}::uuid]) AS u
    ON CONFLICT (id) DO NOTHING`

  await sql`INSERT INTO public.suppliers (id, name) VALUES (${ids.supplier}, 'עסק מרוץ')`

  // Both scanners staff the SAME supplier. Two tills, one business: this is the
  // realistic shape of the race, and it is the one the supplier check cannot
  // help with.
  await sql`
    INSERT INTO public.supplier_members (supplier_id, user_id, is_active) VALUES
      (${ids.supplier}, ${ids.scannerA}, true),
      (${ids.supplier}, ${ids.scannerB}, true)`

  await sql`
    INSERT INTO public.products
      (id, supplier_id, type, slug, name_he, price_agorot, coupon_price_agorot,
       platform_percent, supplier_split_percent, coupon_expiry_days, offer_valid_until)
    VALUES
      (${ids.product}, ${ids.supplier}, 'coupon', ${`race-${CODE.toLowerCase()}`},
       'קופון מרוץ', 10000, 5000, 30, 70, 90, now() + interval '365 days')`

  await sql`
    INSERT INTO public.orders
      (id, user_id, status, subtotal_agorot, discount_agorot, wallet_applied_agorot,
       cashback_applied_agorot, customer_pays_now_agorot, total_agorot, paid_at)
    VALUES (${ids.order}, ${ids.buyer}, 'paid', 5000, 0, 0, 0, 5000, 5000, now())`

  await sql`
    INSERT INTO public.order_items
      (id, order_id, product_id, product_type, supplier_id, quantity,
       unit_price_agorot, total_price_agorot, face_value_agorot,
       customer_pays_now_agorot, platform_fee_agorot, supplier_due_agorot,
       cashback_amount_agorot, platform_bp, supplier_split_percent,
       settlement_status, item_status)
    VALUES
      (${ids.item}, ${ids.order}, ${ids.product}, 'coupon', ${ids.supplier}, 1,
       5000, 5000, 10000, 5000, 5000, 0, 0, 3000, 70, 'split_executed', 'issued')`

  await sql`
    INSERT INTO public.vouchers
      (id, code, qr_payload, order_id, order_item_id, product_id, supplier_id,
       user_id, face_value_agorot, coupon_price_agorot, remaining_amount_due_agorot,
       platform_bp, status, offer_valid_until, expires_at)
    VALUES
      (${ids.voucher}, ${CODE}, 'qr-race', ${ids.order}, ${ids.item}, ${ids.product},
       ${ids.supplier}, ${ids.buyer}, 10000, 5000, 5000, 3000, 'issued',
       now() + interval '30 days', now() + interval '30 days')`
}

/**
 * One scan, in its own transaction on its own connection.
 *
 * The jwt claim is set with `false` as the third argument to set_config so it
 * persists for the transaction rather than only the statement, which is what
 * makes auth.uid() resolve inside the SECURITY DEFINER function.
 */
function scan(scannerId, label) {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims',
      json_build_object('sub', ${scannerId}::text, 'role', 'authenticated')::text, true)`
    const rows = await tx`
      SELECT public.redeem_voucher(${CODE}, 'camera', NULL, '203.0.113.99', ${label}) AS result`
    return rows[0].result
  })
}

async function cleanup() {
  await sql`DELETE FROM public.voucher_redemptions WHERE code_entered = ${CODE}`
  await sql`DELETE FROM public.vouchers WHERE id = ${ids.voucher}`
  await sql`DELETE FROM public.commission_ledger WHERE order_item_id = ${ids.item}`
  await sql`DELETE FROM public.order_items WHERE id = ${ids.item}`
  await sql`DELETE FROM public.orders WHERE id = ${ids.order}`
  await sql`DELETE FROM public.products WHERE id = ${ids.product}`
  await sql`DELETE FROM public.supplier_members WHERE supplier_id = ${ids.supplier}`
  await sql`DELETE FROM public.suppliers WHERE id = ${ids.supplier}`
  await sql`DELETE FROM public.wallet_entries WHERE debit_account IN
    (SELECT id FROM public.wallet_accounts WHERE user_id = ANY(ARRAY[${ids.buyer}::uuid, ${ids.scannerA}::uuid, ${ids.scannerB}::uuid]))`
  await sql`DELETE FROM public.wallet_accounts WHERE user_id = ANY(ARRAY[${ids.buyer}::uuid, ${ids.scannerA}::uuid, ${ids.scannerB}::uuid])`
  await sql`DELETE FROM public.profiles WHERE id = ANY(ARRAY[${ids.buyer}::uuid, ${ids.scannerA}::uuid, ${ids.scannerB}::uuid])`
  await sql`DELETE FROM auth.users WHERE id = ANY(ARRAY[${ids.buyer}::uuid, ${ids.scannerA}::uuid, ${ids.scannerB}::uuid])`
}

try {
  await seed()
  console.log(`  voucher ${CODE} issued, two members of one supplier scanning at once`)

  // Both in flight before either resolves. Promise.all, not sequential awaits:
  // awaiting the first would make this the same weak test the SQL harness
  // already performs.
  const [a, b] = await Promise.all([scan(ids.scannerA, 'till-A'), scan(ids.scannerB, 'till-B')])

  const outcomes = [a?.outcome, b?.outcome].sort()
  console.log(`  till-A: ${a?.outcome}   till-B: ${b?.outcome}`)

  const successes = outcomes.filter((o) => o === 'success').length
  if (successes !== 1) {
    fail(
      `${successes} of 2 concurrent scans succeeded. Exactly one may. Got ${JSON.stringify(outcomes)}`,
    )
  }
  if (!outcomes.includes('already_redeemed')) {
    fail(`the losing scan reported ${JSON.stringify(outcomes)}, expected already_redeemed`)
  }

  const [row] = await sql`
    SELECT status, redeemed_by_user_id, redeemed_amount_collected_agorot
    FROM public.vouchers WHERE id = ${ids.voucher}`
  if (row.status !== 'redeemed') fail(`voucher ended at ${row.status}, expected redeemed`)
  if (row.redeemed_amount_collected_agorot !== 5000) {
    fail(`collected ${row.redeemed_amount_collected_agorot} agorot, expected 5000`)
  }

  // The audit is what a dispute is settled with, so the loser must be in it too:
  // "the second till tried and was refused" is the answer to "we scanned it and
  // nothing happened".
  const audit = await sql`
    SELECT outcome, host(ip_address) AS ip, user_agent
    FROM public.voucher_redemptions WHERE code_entered = ${CODE} ORDER BY created_at`
  // host(), not ip_address::text: this server renders inet with its /32 mask,
  // so the plain cast compares '203.0.113.99/32' against the address that was
  // sent in and reports a data loss that did not happen.
  const successRows = audit.filter((r) => r.outcome === 'success')
  if (successRows.length !== 1) {
    fail(`${successRows.length} success rows in the audit, expected exactly 1`)
  }
  if (audit.length !== 2) {
    fail(`${audit.length} audit rows for 2 scans, expected 2`)
  }
  if (audit.some((r) => r.ip !== '203.0.113.99')) {
    fail(`an audit row lost its ip address: ${JSON.stringify(audit)}`)
  }

  if (!process.exitCode) {
    console.log('\n  PASS  one redemption, one refusal, both on the record\n')
  }
} catch (error) {
  fail(error?.message ?? String(error))
  console.error(error)
} finally {
  await cleanup().catch((e) => console.error('cleanup failed:', e.message))
  await sql.end()
}
