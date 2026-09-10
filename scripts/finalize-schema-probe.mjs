#!/usr/bin/env node
/**
 * FIRES EVERY READ AND WRITE SHAPE `finalizeOrder` USES AT THE REAL DATABASE.
 *
 * 42703 (undefined_column) is the finalize path's worst failure mode, because
 * of WHEN it lands: the card has already been charged when finalize runs. A
 * select that names one column the hosted schema does not have fails the whole
 * statement, finalize returns `ok:false`, and the customer has paid for a
 * voucher that was never minted. Nothing in `pnpm test` can catch it -- every
 * unit test mocks the Supabase client, so a select naming a column that exists
 * in nobody's database passes green.
 *
 * The probe is READ-ONLY BY CONSTRUCTION. Selects go out with `limit=0`, which
 * PostgREST plans and validates in full and then returns zero rows for. Writes
 * are never executed: their column sets are checked against
 * `information_schema.columns` instead. RPCs are checked against `pg_proc`.
 *
 * Usage: node scripts/finalize-schema-probe.mjs
 * Exits 1 and prints the offending table/column on the first shape the
 * database refuses.
 */
import { readFileSync } from 'node:fs'

function loadEnv() {
  // Same parser trap the e2e suite hit: a quoted value keeps its quotes and
  // every request then carries a key with a `"` in it.
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
      if (!m) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  } catch {
    /* CI supplies the env directly */
  }
}
loadEnv()

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required')
  process.exit(2)
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }

/**
 * Every select `finalizeOrder` issues, verbatim.
 *
 * The generation-probed fragments (`orderCashbackSelect`,
 * `orderItemPriceSelect`, `resolvePaymentMoneySchema`) resolve at runtime, so
 * both candidate names are listed and AT LEAST ONE must plan. Everything else
 * is a fixed string in finalize.ts and must plan exactly.
 */
const SELECTS = [
  ['orders', 'id,user_id,status,paid_at'],
  [
    'order_items',
    'id,order_id,product_id,product_type,supplier_id,quantity,platform_percent,upfront_percent,commission_percent_snapshot,paid_on_site_agorot,commission_agorot,face_value_agorot,balance_due_agorot,supplier_immediate_agorot,cashback_amount_agorot,settlement_status',
  ],
  ['payments', 'id,status,cardcom_account_id'],
  ['products', 'id,coupon_expiry_days,offer_valid_until'],
  ['products', 'id,name_he'],
  ['products', 'id,recurring_amount_agorot,billing_interval,billing_interval_count'],
  ['profiles', 'email,phone'],
  ['profiles', 'full_name'],
  ['profiles', 'email'],
  ['vouchers', 'id'],
  ['wallet_accounts', 'id'],
  // The wide gift read is NOT here on purpose. `gift_deliver_at` arrives with
  // pending migration 226, and finalize already reads wide-then-narrow so a
  // pre-226 database degrades to "send now" instead of losing the gift. Only
  // the narrow read, which 108 applied, is a hard requirement.
  ['orders', 'gift_recipient_name,gift_recipient_email,gift_message'],
]

/** One of these must exist; finalize probes and picks at runtime. */
const EITHER = [
  ['orders', ['cashback_applied_agorot', 'cashback_applied_ils']],
  ['order_items', ['unit_price_agorot', 'unit_price_ils_agorot']],
  ['payments', ['wallet_applied_agorot', 'wallet_applied_ils']],
  ['vouchers', ['platform_rate_bp', 'platform_percent']],
]

/** Column sets finalize WRITES. Checked against the catalogue, never executed. */
const WRITES = [
  ['payments', ['status', 'cardcom_transaction_id', 'succeeded_at']],
  ['order_items', ['settlement_status', 'item_status']],
  ['orders', ['status', 'paid_at']],
  ['carts', ['items', 'profile_id']],
  [
    'split_executions',
    [
      'order_item_id',
      'order_id',
      'supplier_id',
      'face_value_agorot',
      'commission_agorot',
      'supplier_agorot',
      'payment_id',
    ],
  ],
  [
    'payment_tokens',
    [
      'profile_id',
      'cardcom_token',
      'last_4',
      'card_brand',
      'expiry_month',
      'expiry_year',
      'cardcom_account_id',
    ],
  ],
  [
    'audit_log',
    ['actor_id', 'actor_role', 'action', 'entity_type', 'entity_id', 'changes', 'metadata'],
  ],
]

/**
 * RPCs finalize calls, with the EXACT named arguments the call sites pass.
 *
 * A name that exists under a different argument list is still PGRST202 at the
 * call site, so checking the name alone would pass a finalize that cannot call
 * it. The arguments below therefore carry a value that CANNOT be cast to the
 * declared type: PostgREST resolves the overload by name first, then Postgres
 * fails the cast (22P02) before the function body runs. Anything other than
 * PGRST202 proves the signature exists, and nothing is ever executed.
 */
const RPCS = [
  ['consume_order_stock', { p_order_id: 'not-a-uuid' }],
  [
    'fn_wallet_transfer',
    {
      p_debit_account: 'not-a-uuid',
      p_credit_account: 'not-a-uuid',
      p_amount_ils: 0,
      p_reason: 'probe',
      p_idempotency: 'probe',
      p_order_id: 'not-a-uuid',
    },
  ],
  [
    'fn_enqueue_notification',
    {
      p_kind: 'probe',
      p_email: 'probe',
      p_dedupe: 'probe',
      p_payload: 'not-jsonb',
      p_user_id: 'not-a-uuid',
    },
  ],
  ['fn_cashback_order_bonus', { p_order_id: 'not-a-uuid' }],
  [
    'fn_complete_referral',
    {
      p_order_id: 'not-a-uuid',
      p_user_id: 'not-a-uuid',
      p_order_agorot: 0,
      p_card_hash: null,
    },
  ],
]

const failures = []

/**
 * A PROBE THAT CANNOT FAIL PROVES NOTHING.
 *
 * Every check below is "the database accepted it". If the request shape were
 * wrong -- a bad key, a URL that 404s, a header PostgREST ignores -- every
 * check would pass for the same reason and the probe would report a clean
 * finalize path against a database it never actually asked. So it asks for a
 * column that certainly does not exist first, and refuses to run if THAT comes
 * back clean.
 */
async function assertProbeCanFail() {
  const err = await planSelect('orders', 'id,column_that_cannot_exist_42703')
  if (!err || !err.includes('42703')) {
    console.error(
      'finalize schema probe: the negative control PASSED. The probe is not reaching the database; every result below would be meaningless.',
    )
    process.exit(2)
  }
}

async function planSelect(table, columns) {
  const res = await fetch(
    `${URL_BASE}/rest/v1/${table}?select=${encodeURIComponent(columns)}&limit=0`,
    { headers },
  )
  if (res.ok) return null
  const body = await res.text()
  return `${table}: ${body}`
}

async function columnExists(table, column) {
  const res = await fetch(
    `${URL_BASE}/rest/v1/${table}?select=${encodeURIComponent(column)}&limit=0`,
    { headers },
  )
  return res.ok
}

async function rpcSignatureExists(name, args) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (res.ok) return true
  const body = await res.text()
  return !body.includes('PGRST202')
}

await assertProbeCanFail()

for (const [table, columns] of SELECTS) {
  const err = await planSelect(table, columns)
  if (err) failures.push(`SELECT ${err}`)
}

for (const [table, candidates] of EITHER) {
  const found = []
  for (const c of candidates) if (await columnExists(table, c)) found.push(c)
  if (found.length === 0) {
    failures.push(`EITHER ${table}: none of ${candidates.join(' | ')} exists`)
  } else {
    console.log(`  ok   either ${table}.{${candidates.join('|')}} -> ${found.join(', ')}`)
  }
}

for (const [table, columns] of WRITES) {
  for (const column of columns) {
    if (!(await columnExists(table, column))) failures.push(`WRITE ${table}.${column} missing`)
  }
}

for (const [name, args] of RPCS) {
  if (!(await rpcSignatureExists(name, args))) {
    failures.push(`RPC ${name}(${Object.keys(args).join(', ')}) missing (PGRST202)`)
  }
}

if (failures.length > 0) {
  console.error(`\nfinalize schema probe: ${failures.length} failure(s)\n`)
  for (const f of failures) console.error(`  FAIL ${f}`)
  process.exit(1)
}
console.log(
  `\nfinalize schema probe: clean. ${SELECTS.length} selects planned, ${EITHER.length} either-columns resolved, ${WRITES.reduce((n, [, c]) => n + c.length, 0)} write columns present, ${RPCS.length} rpc signatures present.`,
)
