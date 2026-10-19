#!/usr/bin/env node
/**
 * VALIDATES THE CATALOGUE'S MONEY AGAINST THE RULES THIS PROJECT ACTUALLY HAS.
 *
 * The rule is "money = agorot, integer only, every calculation through
 * src/lib/money.ts", and it is guarded in two places already:
 * `money-no-float.test.ts` scans the SOURCE for float arithmetic, and
 * `assertSafeInteger` refuses a float at runtime. Neither of them looks at the
 * DATA. A row seeded or imported with a fractional agora, or with a shekel
 * column that drifted from its agorot twin, passes both gates and is wrong on a
 * product page.
 *
 * That has happened here before: migrations 138-141 filled the agorot columns
 * once and then abandoned them, so they were NULL for every order created
 * afterwards. This checks the state those migrations were supposed to leave.
 *
 * WHAT IT CHECKS
 *
 *  1. Every `*_agorot` value is a whole number. A fractional agora has no
 *     representation in currency and means a float reached the column.
 *  2. Every shekel/agorot twin agrees, to the agora. `price_ils` = 12.90 with
 *     `price_ils_agorot` = 1290 is the pair being maintained; either one moving
 *     alone is the drift.
 *  3. No shekel column is set while its agorot twin is NULL - the 138-141
 *     failure exactly.
 *  4. Every active product carries `platform_percent` and `commission_percent`,
 *     both within 0..100. These are snapshotted onto `order_items` at purchase,
 *     so a NULL here becomes a NULL in a financial record that can never be
 *     reconstructed.
 *  5. No active product is priced at or below zero.
 *  6. The `order_items` snapshot arithmetic reproduces: the amount paid on site
 *     is the platform share of face value, commission is the commission share
 *     of THAT, and the balance due at the counter is the remainder.
 *
 * Rule 6 is the one worth having. The others catch bad data; this one catches a
 * bad FORMULA, by recomputing it from the frozen percentages rather than
 * trusting the number that was written.
 *
 * NOTE ON THE MODULE PATH. There is no `packages/money.ts` in this repo and
 * never has been. The canonical module is `src/lib/money.ts`.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... \
 *     node scripts/validate-seed-money.mjs [--json]
 *
 * Exit: 0 clean, 1 violations, 2 could not run.
 */

const JSON_OUT = process.argv.includes('--json')

const fail = (msg) => {
  console.error(`validate-seed-money: ${msg}`)
  process.exit(2)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required')

const rest = async (path) => {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  if (!res.ok) fail(`${path} -> ${res.status} ${await res.text()}`)
  return res.json()
}

/** shekel column -> its agorot twin. Both directions are checked. */
const TWINS = [
  ['price_ils', 'price_ils_agorot'],
  ['kenyon_price', 'kenyon_price_agorot'],
  ['full_price', 'full_price_agorot'],
  ['compare_at_price', 'compare_at_price_agorot'],
  ['compare_at_price_ils', 'compare_at_price_ils_agorot'],
  ['coupon_price_ils', 'coupon_price_ils_agorot'],
]

/**
 * PostgREST returns `numeric` as a STRING to preserve exactness, which is the
 * whole reason the column is numeric and not double precision. Parsing it with
 * Number here would reintroduce the float this project spent months removing,
 * so shekels are compared as scaled integers via their decimal text.
 */
const shekelToAgorot = (value) => {
  const text = String(value).trim()
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null
  const negative = text.startsWith('-')
  const [whole, fraction = ''] = text.replace('-', '').split('.')
  const padded = `${fraction}00`.slice(0, 2)
  const magnitude = BigInt(whole) * 100n + BigInt(padded)
  return negative ? -magnitude : magnitude
}

const main = async () => {
  const problems = []
  const add = (rule, subject, detail) => problems.push({ rule, subject, detail })

  const products = await rest(
    `products?select=id,slug,status,deleted_at,platform_percent,commission_percent,${TWINS.flat().join(',')}`,
  )

  for (const p of products) {
    const active = p.status === 'active' && p.deleted_at === null
    const where = `product ${p.slug}`

    for (const [shekel, agorot] of TWINS) {
      const s = p[shekel]
      const a = p[agorot]

      if (a !== null && a !== undefined && !Number.isInteger(Number(a))) {
        add('integer-agorot', where, `${agorot} = ${a} is not a whole number`)
      }
      if (s !== null && s !== undefined && (a === null || a === undefined)) {
        add('orphan-shekel', where, `${shekel} = ${s} but ${agorot} is NULL`)
        continue
      }
      if (s === null || s === undefined || a === null || a === undefined) continue

      const expected = shekelToAgorot(s)
      if (expected === null) {
        add('unparseable', where, `${shekel} = ${s}`)
      } else if (expected !== BigInt(a)) {
        add('twin-drift', where, `${shekel}=${s} implies ${expected}, ${agorot}=${a}`)
      }
    }

    if (!active) continue

    for (const column of ['platform_percent', 'commission_percent']) {
      const raw = p[column]
      if (raw === null || raw === undefined) {
        add('missing-percent', where, `${column} is NULL on an active product`)
        continue
      }
      const pct = Number(raw)
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        add('percent-out-of-range', where, `${column} = ${raw}`)
      }
    }

    const price = p.price_ils_agorot
    if (price === null || Number(price) <= 0) {
      add('nonpositive-price', where, `price_ils_agorot = ${price}`)
    }
  }

  const ITEM_COLUMNS = [
    'id',
    'order_id',
    'face_value_agorot',
    'platform_percent',
    'paid_on_site_agorot',
    'commission_percent_snapshot',
    'commission_agorot',
    'balance_due_agorot',
  ]
  const items = await rest(`order_items?select=${ITEM_COLUMNS.join(',')}`)

  /** Half-up on a non-negative value, matching Postgres `round(numeric)`. */
  const share = (base, percent) => Math.round((Number(base) * Number(percent)) / 100)

  for (const it of items) {
    const where = `order_item ${it.id}`
    if (it.face_value_agorot === null || it.platform_percent === null) {
      add('snapshot-missing', where, 'face_value_agorot or platform_percent is NULL')
      continue
    }

    const expectedPaid = share(it.face_value_agorot, it.platform_percent)
    if (Number(it.paid_on_site_agorot) !== expectedPaid) {
      add(
        'snapshot-arithmetic',
        where,
        `paid_on_site_agorot=${it.paid_on_site_agorot}, ${it.platform_percent}% of ${it.face_value_agorot} is ${expectedPaid}`,
      )
    }

    if (it.commission_percent_snapshot !== null) {
      const expectedCommission = share(it.paid_on_site_agorot, it.commission_percent_snapshot)
      if (Number(it.commission_agorot) !== expectedCommission) {
        add(
          'snapshot-arithmetic',
          where,
          `commission_agorot=${it.commission_agorot}, expected ${expectedCommission}`,
        )
      }
    }

    const expectedBalance = Number(it.face_value_agorot) - Number(it.paid_on_site_agorot)
    if (Number(it.balance_due_agorot) !== expectedBalance) {
      add(
        'snapshot-arithmetic',
        where,
        `balance_due_agorot=${it.balance_due_agorot}, expected ${expectedBalance}`,
      )
    }
  }

  if (JSON_OUT) {
    console.log(
      JSON.stringify({ products: products.length, orderItems: items.length, problems }, null, 2),
    )
  } else {
    console.log(
      `validate-seed-money: ${products.length} products, ${items.length} order items checked`,
    )
    if (problems.length === 0) console.log('  every money value is integer agorot and consistent')
    for (const p of problems) console.error(`  ${p.rule.padEnd(22)} ${p.subject}: ${p.detail}`)
  }
  process.exit(problems.length === 0 ? 0 : 1)
}

main().catch((e) => fail(e.stack ?? String(e)))
