import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Guards on `migrations/pending/006-product-type-foundation.sql`.
 *
 * A pending migration cannot be run here, so it gets no feedback at all until
 * someone applies it against production, which is the worst possible moment to
 * discover a typo. Each assertion below corresponds to a mistake that was
 * actually made while writing the file and caught only by querying the live
 * catalog:
 *
 *   - `CREATE TYPE product_type` fails: the enum already exists with
 *     (coupon, physical, service).
 *   - `role IN ('admin','staff')` fails with 22P02: the live user_role enum has
 *     no 'staff' member. The database's own helper is `is_admin()`.
 *   - Using a value in the same transaction that added it fails: Postgres
 *     forbids it after ALTER TYPE ... ADD VALUE, and apply_migration is one
 *     transaction.
 *
 * These are cheap tests for an expensive failure.
 */

const sql = readFileSync(
  resolve(process.cwd(), 'migrations/pending/006-product-type-foundation.sql'),
  'utf8',
)

/**
 * The file without its comments. Every "must not contain" assertion runs
 * against this, because the header deliberately QUOTES the statements that
 * would fail in order to explain why they are absent, and a naive grep over
 * the whole file cannot tell an explanation from a mistake.
 */
const executable = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('006: statements that would fail against the live database', () => {
  it('does not try to create an enum type that already exists', () => {
    expect(executable).not.toMatch(/CREATE\s+TYPE\s+(public\.)?product_type/i)
    expect(sql).toMatch(/ALTER TYPE public\.product_type ADD VALUE IF NOT EXISTS 'split'/)
    expect(sql).toMatch(/ALTER TYPE public\.product_type ADD VALUE IF NOT EXISTS 'subscription'/)
  })

  it("never names a 'staff' role, which is not in the live user_role enum", () => {
    expect(executable).not.toMatch(/'staff'/)
    expect(sql).toMatch(/public\.is_admin\(\)/)
  })

  it('does not use a newly added enum member in the same transaction', () => {
    // The two new members must not appear in any executable position.
    expect(executable).not.toMatch(/DEFAULT\s+'split'/i)
    expect(executable).not.toMatch(/DEFAULT\s+'subscription'/i)
    expect(executable).not.toMatch(/INSERT\s+INTO\s+public\.product_type_config/i)
    // The default it does set is an already existing member, which is legal.
    expect(executable).toMatch(/ALTER COLUMN type SET DEFAULT 'coupon'/)
  })

  it('adds no second spelling of products.type', () => {
    // The brief asked for a `product_type` column on products. That column is
    // `products.type`; a second one would give one fact two spellings.
    expect(executable).not.toMatch(
      /ALTER TABLE public\.products[\s\S]{0,80}ADD COLUMN[^\n]*product_type/i,
    )
  })
})

describe('006: money and access', () => {
  it('keeps subscription money in integer agorot', () => {
    expect(sql).toMatch(/amount_agorot\s+bigint\s+NOT NULL/)
    expect(sql).toMatch(/CHECK \(amount_agorot > 0\)/)
    // No numeric shekel column that a later migration would have to convert.
    expect(executable).not.toMatch(/amount_ils/)
    expect(executable).not.toMatch(/monthly_amount\s+numeric/)
  })

  it('snapshots platform_percent per subscription rather than reading it live', () => {
    expect(sql).toMatch(/platform_percent\s+numeric\(5,2\)/)
  })

  it('puts the Cardcom token out of anon reach', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.subscriptions FROM anon/)
    expect(sql).toMatch(/ALTER TABLE public\.subscriptions ENABLE ROW LEVEL SECURITY/)
  })

  it('refuses an active subscription with no scheduled charge', () => {
    // "active with no next_charge_at" is what a silently stopped subscription
    // looks like in production, so the constraint names it.
    expect(sql).toMatch(/subscriptions_active_is_scheduled/)
    expect(sql).toMatch(/subscriptions_canceled_is_terminal/)
  })
})

describe('006: the conflict with PENDING-109 is stated, not silent', () => {
  it('says out loud that both files must not be applied', () => {
    expect(sql).toMatch(/PENDING-109/)
    expect(sql).toMatch(/BOTH MUST NOT BE APPLIED/)
  })

  it('writes no product data', () => {
    // 61 live rows say 'physical'. Renaming them to 'split' is a data change on
    // the money path and is deliberately not here.
    expect(executable).not.toMatch(/UPDATE public\.products/i)
    expect(sql).toMatch(/NO BACKFILL/)
  })
})
