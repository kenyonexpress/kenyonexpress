import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  GUARDED_COLUMNS,
  type GuardedColumn,
  STATUS_TRANSITIONS,
  isLegalTransition,
  statesOf,
  terminalStatesOf,
} from '@/server/domain/orders/status-transitions'
import { REDEEMABLE_SETTLEMENT_STATUSES } from '@/server/domain/vouchers/mark-order-item-redeemed'
import { describe, expect, it } from 'vitest'

/**
 * One assertion per transition, legal and illegal, plus the check that the SQL
 * and this table have not drifted.
 *
 * WHY THIS FILE EXISTS. The previous 137 passed DDL and would then have raised
 * 23514 on every voucher scan in production, because it had no rule reaching
 * `redeemed` while `markOrderItemRedeemed` writes it. Nothing caught that,
 * because a migration's transition table had no test of any kind. A guard is
 * exactly the sort of code where "it applied cleanly" and "it is correct" are
 * unrelated statements.
 */

/**
 * 137 and 166 are both APPLIED in production. 137 guards orders, order_items
 * and payments (verified 2026-09-01); 166 guards vouchers, applied 2026-09-03
 * as `voucher_transition_guard_166` and re-verified 2026-09-09, when
 * `pg_trigger` returned FOUR guard triggers and this file knew about three.
 *
 * An applied migration eventually moves out of `migrations/pending/`, and this
 * test reads the files to prove the table below has not drifted from them. So
 * look in every place a file can be and say which one was missing if it is in
 * none of them, rather than failing with a bare ENOENT that reads like the test
 * is broken.
 */
const MIGRATION_CANDIDATES: Record<string, string[]> = {
  // Applied through MCP on 2026-09-03 and moved out of `pending/`.
  '137_order_transition_guard.sql': [
    'migrations/applied/137_order_transition_guard.sql',
    'migrations/pending/137_order_transition_guard.sql',
    'supabase/migrations/137_order_transition_guard.sql',
  ],
  '166_voucher_transition_guard.sql': [
    'migrations/applied/166_voucher_transition_guard.sql',
    'migrations/pending/166_voucher_transition_guard.sql',
    'supabase/migrations/166_voucher_transition_guard.sql',
  ],
}

const MIGRATIONS = Object.entries(MIGRATION_CANDIDATES).map(([name, candidates]) => {
  for (const candidate of candidates) {
    const full = resolve(process.cwd(), candidate)
    if (existsSync(full)) return full
  }
  throw new Error(
    `${name} is in none of ${candidates.join(', ')}. The guard is live in production; this test needs the file to compare it against.`,
  )
})

/** The `('from','to')` pairs the migrations actually contain, per guard. */
function pairsInMigration(): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {}
  for (const file of MIGRATIONS) {
    const sql = readFileSync(file, 'utf8')
    // Each guard body is one IN (...) list, preceded by its function name.
    const blocks = sql.split('CREATE OR REPLACE FUNCTION public.fn_').slice(1)
    for (const block of blocks) {
      const name = block.slice(0, block.indexOf('_guard'))
      const list = block.slice(block.indexOf('IN ('), block.indexOf('  ) THEN'))
      const found = new Set<string>()
      for (const m of list.matchAll(/\('([a-z_]+)','([a-z_]+)'\)/g)) {
        found.add(`${m[1]}->${m[2]}`)
      }
      out[name] = found
    }
  }
  return out
}

const FN_NAME: Record<GuardedColumn, string> = {
  'orders.status': 'orders_status',
  'order_items.settlement_status': 'order_items_settlement_status',
  'payments.status': 'payments_status',
  'vouchers.status': 'vouchers_status',
}

/**
 * Every guard live in production, so a fifth one cannot arrive unmirrored the
 * way the fourth did. Read from `pg_trigger` on 2026-09-09:
 *
 *   tg_orders_status_guard                   orders
 *   tg_order_items_settlement_status_guard   order_items
 *   tg_payments_status_guard                 payments
 *   tg_vouchers_status_guard                 vouchers
 *
 * Re-measure with:
 *   select c.relname, tg.tgname from pg_trigger tg
 *     join pg_class c on c.oid = tg.tgrelid
 *    where not tg.tgisinternal and tg.tgname like '%status_guard%';
 */
const GUARD_TRIGGERS_IN_PRODUCTION = [
  'order_items.settlement_status',
  'orders.status',
  'payments.status',
  'vouchers.status',
]

describe('the SQL guard and this table describe the same machine', () => {
  const inSql = pairsInMigration()

  it('covers every guard trigger production is running', () => {
    // The one this catches: a migration adds a fifth guard, nothing here
    // changes, and the new machine has no mirror and no drift test. That is
    // exactly what happened between 166 (2026-09-03) and 2026-09-09.
    expect([...GUARDED_COLUMNS].sort()).toEqual([...GUARD_TRIGGERS_IN_PRODUCTION].sort())
  })

  it('parses a rule set for each of them out of the migrations', () => {
    for (const column of GUARDED_COLUMNS) {
      expect(inSql[FN_NAME[column]], `no IN (...) list parsed for ${column}`).toBeDefined()
      expect((inSql[FN_NAME[column]] ?? new Set()).size).toBeGreaterThan(0)
    }
  })

  for (const column of GUARDED_COLUMNS) {
    it(`${column}: every rule here is in the migration, and vice versa`, () => {
      const expected = new Set<string>()
      for (const [from, tos] of Object.entries(STATUS_TRANSITIONS[column])) {
        for (const to of tos) expected.add(`${from}->${to}`)
      }
      expect([...(inSql[FN_NAME[column]] ?? [])].sort()).toEqual([...expected].sort())
    })
  }
})

describe('every legal transition is permitted', () => {
  for (const column of GUARDED_COLUMNS) {
    for (const [from, tos] of Object.entries(STATUS_TRANSITIONS[column])) {
      for (const to of tos) {
        it(`${column}: ${from} -> ${to}`, () => {
          expect(isLegalTransition(column, from, to)).toBe(true)
        })
      }
    }
  }
})

describe('every transition that is not declared is refused', () => {
  for (const column of GUARDED_COLUMNS) {
    const states = statesOf(column)
    for (const from of states) {
      const allowed = new Set(STATUS_TRANSITIONS[column][from] ?? [])
      for (const to of states) {
        if (to === from || allowed.has(to)) continue
        it(`${column}: ${from} -/-> ${to}`, () => {
          expect(isLegalTransition(column, from, to)).toBe(false)
        })
      }
    }
  }
})

describe('a status that does not move is always legal', () => {
  // An UPDATE that sets some other column leaves the status equal to itself.
  // Rejecting that would fail every unrelated write to these four tables.
  for (const column of GUARDED_COLUMNS) {
    for (const state of statesOf(column)) {
      it(`${column}: ${state} -> ${state}`, () => {
        expect(isLegalTransition(column, state, state)).toBe(true)
      })
    }
  }
})

describe('the moves the previous guard got wrong', () => {
  // Each of these is a bug that version would have shipped to production.

  it('every REDEEMABLE_SETTLEMENT_STATUSES state can reach redeemed', () => {
    // markOrderItemRedeemed writes `redeemed` from exactly these. The old guard
    // had no rule reaching `redeemed` at all, so every scan raised 23514 after
    // the customer had already been charged.
    for (const from of REDEEMABLE_SETTLEMENT_STATUSES) {
      expect(isLegalTransition('order_items.settlement_status', from, 'redeemed')).toBe(true)
    }
  })

  it('escrow_held can still move, because two production rows are in it', () => {
    expect(
      isLegalTransition('order_items.settlement_status', 'escrow_held', 'escrow_released'),
    ).toBe(true)
    expect(isLegalTransition('order_items.settlement_status', 'escrow_held', 'refunded')).toBe(true)
  })

  it('orders and payments both admit platform_settled, which the enums carry', () => {
    expect(isLegalTransition('orders.status', 'paid', 'platform_settled')).toBe(true)
    expect(isLegalTransition('payments.status', 'succeeded', 'platform_settled')).toBe(true)
  })

  it('finalize can move a line straight from pending to split_executed', () => {
    // finalize.ts updates `.in('settlement_status', ['pending', 'paid'])`, so
    // pending is a legal origin for that move and not only paid.
    expect(isLegalTransition('order_items.settlement_status', 'pending', 'split_executed')).toBe(
      true,
    )
    expect(isLegalTransition('order_items.settlement_status', 'paid', 'split_executed')).toBe(true)
  })
})

describe('terminal states', () => {
  it('are the ones nothing leaves', () => {
    expect(terminalStatesOf('orders.status')).toEqual(['cancelled', 'refunded'])
    expect(terminalStatesOf('order_items.settlement_status')).toEqual([
      'cancelled',
      'redeemed',
      'refunded',
    ])
    expect(terminalStatesOf('payments.status')).toEqual(['failed', 'refunded'])
    // Every non-issued voucher state is terminal, which is the whole model:
    // once a voucher leaves `issued` the value was consumed at the counter or
    // the money went back, and there is nothing left to move.
    expect(terminalStatesOf('vouchers.status')).toEqual([
      'cancelled',
      'expired',
      'redeemed',
      'refunded',
    ])
  })

  it('redeemed is terminal: consumed value is not refunded to the card', () => {
    // A goodwill refund after redemption is a wallet credit, which is a
    // different money movement and not a status change on this line.
    expect(STATUS_TRANSITIONS['order_items.settlement_status'].redeemed).toEqual([])
  })
})
