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
 * 137 is APPLIED in production (verified 2026-09-01: all three triggers present
 * and enabled on orders, order_items and payments). An applied migration
 * eventually moves out of `migrations/pending/`, and this test reads the file
 * to prove the table below has not drifted from it. So look in both places and
 * say which one was missing if neither is there, rather than failing with a
 * bare ENOENT that reads like the test is broken.
 */
const MIGRATION_CANDIDATES = [
  // Applied through MCP on 2026-09-03 and moved out of `pending/`.
  'migrations/applied/137_order_transition_guard.sql',
  'migrations/pending/137_order_transition_guard.sql',
  'supabase/migrations/137_order_transition_guard.sql',
]

const MIGRATION = (() => {
  for (const candidate of MIGRATION_CANDIDATES) {
    const full = resolve(process.cwd(), candidate)
    if (existsSync(full)) return full
  }
  throw new Error(
    `137_order_transition_guard.sql is in neither ${MIGRATION_CANDIDATES.join(' nor ')}. The guards are live in production; this test needs the file to compare them against.`,
  )
})()

/** The `('from','to')` pairs the migration actually contains, per column. */
function pairsInMigration(): Record<string, Set<string>> {
  const sql = readFileSync(MIGRATION, 'utf8')
  const out: Record<string, Set<string>> = {}
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
  return out
}

const FN_NAME: Record<GuardedColumn, string> = {
  'orders.status': 'orders_status',
  'order_items.settlement_status': 'order_items_settlement_status',
  'payments.status': 'payments_status',
}

describe('the SQL guard and this table describe the same machine', () => {
  const inSql = pairsInMigration()

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
  // Rejecting that would fail every unrelated write to these three tables.
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
  })

  it('redeemed is terminal: consumed value is not refunded to the card', () => {
    // A goodwill refund after redemption is a wallet credit, which is a
    // different money movement and not a status change on this line.
    expect(STATUS_TRANSITIONS['order_items.settlement_status'].redeemed).toEqual([])
  })
})
