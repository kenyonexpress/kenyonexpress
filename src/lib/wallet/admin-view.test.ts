import {
  ADMIN_WALLET_LEDGER_CAP,
  type AdminWalletEntry,
  buildAdminWalletView,
} from '@/lib/wallet/admin-view'
import { describe, expect, it } from 'vitest'

function entry(overrides: Partial<AdminWalletEntry> = {}): AdminWalletEntry {
  return {
    id: 'entry-1',
    direction: 'credit',
    amountAgorot: 90,
    reason: 'order_cashback',
    orderId: null,
    createdAt: '2026-07-21T14:34:10.010Z',
    ...overrides,
  }
}

describe('buildAdminWalletView', () => {
  it('sums credits and debits from the ledger', () => {
    const view = buildAdminWalletView(180, [
      entry({ id: 'a', amountAgorot: 90 }),
      entry({ id: 'b', amountAgorot: 90 }),
    ])
    expect(view.totals).toEqual({
      complete: true,
      earnedAgorot: 180,
      redeemedAgorot: 0,
      ledgerBalanceAgorot: 180,
      driftAgorot: 0,
    })
  })

  it('reproduces the production row exactly', () => {
    // The one funded wallet on 2026-09-10: two order_cashback credits of 90
    // agorot each against a cached balance of 180. The screen this replaces
    // showed 0.00 for it.
    const view = buildAdminWalletView(180, [
      entry({ id: 'a', orderId: 'd3a5aa99-ed75-4bf4-8dfa-ad0035be848c' }),
      entry({ id: 'b', orderId: '79f488aa-549a-40dd-af80-eb66d886668f' }),
    ])
    expect(view.balanceAgorot).toBe(180)
    expect(view.entries).toHaveLength(2)
    expect(view.totals).toMatchObject({ complete: true, earnedAgorot: 180, driftAgorot: 0 })
  })

  it('counts a debit against the balance', () => {
    const view = buildAdminWalletView(50, [
      entry({ id: 'a', direction: 'credit', amountAgorot: 180 }),
      entry({ id: 'b', direction: 'debit', amountAgorot: 130, reason: 'checkout_redeem' }),
    ])
    expect(view.totals).toMatchObject({
      earnedAgorot: 180,
      redeemedAgorot: 130,
      ledgerBalanceAgorot: 50,
      driftAgorot: 0,
    })
  })

  it('reports drift when the cached balance disagrees with the ledger', () => {
    // The cached column says 500, the append-only ledger says 180. One of them
    // is wrong and the ledger is the one that cannot have been edited.
    const view = buildAdminWalletView(500, [entry({ id: 'a', amountAgorot: 180 })])
    expect(view.totals).toMatchObject({
      complete: true,
      ledgerBalanceAgorot: 180,
      driftAgorot: 320,
    })
  })

  it('reports negative drift too', () => {
    const view = buildAdminWalletView(100, [entry({ id: 'a', amountAgorot: 180 })])
    expect(view.totals).toMatchObject({ driftAgorot: -80 })
  })

  it('an empty ledger with a zero balance is complete and not drifting', () => {
    const view = buildAdminWalletView(0, [])
    expect(view.totals).toEqual({
      complete: true,
      earnedAgorot: 0,
      redeemedAgorot: 0,
      ledgerBalanceAgorot: 0,
      driftAgorot: 0,
    })
  })

  it('an empty ledger with a non-zero balance IS drift and says so', () => {
    // Exactly the shape a wallet takes when its entries were never written.
    const view = buildAdminWalletView(180, [])
    expect(view.totals).toMatchObject({ complete: true, ledgerBalanceAgorot: 0, driftAgorot: 180 })
  })

  it('stops claiming totals at the cap instead of understating them', () => {
    const rows = Array.from({ length: 4 }, (_, i) => entry({ id: `e${i}` }))
    const view = buildAdminWalletView(1000, rows, 4)
    expect(view.totals).toEqual({ complete: false })
    expect(view.entries).toHaveLength(4)
  })

  it('still claims totals one row below the cap', () => {
    const rows = Array.from({ length: 3 }, (_, i) => entry({ id: `e${i}` }))
    const view = buildAdminWalletView(270, rows, 4)
    expect(view.totals).toMatchObject({ complete: true, earnedAgorot: 270, driftAgorot: 0 })
  })

  it('has a cap high enough to be a guard rather than a policy', () => {
    expect(ADMIN_WALLET_LEDGER_CAP).toBeGreaterThanOrEqual(100)
  })
})
