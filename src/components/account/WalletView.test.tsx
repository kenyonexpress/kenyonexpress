import { agorot } from '@/lib/money'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The wallet screen STEP 13 asks for: balance, transaction history, the
 * twelve-month expiry policy and the ₪20 referral reward, rendered from
 * mocked reads so the assertions are about what the customer sees.
 */

const getWalletSummary = vi.fn()
const getWalletLedger = vi.fn()
const getReferralProgram = vi.fn()

vi.mock('@/server/queries/account', async () => {
  const actual = await vi.importActual<typeof import('@/server/queries/account')>(
    '@/server/queries/account',
  )
  return {
    ...actual,
    getWalletSummary: (...args: unknown[]) => getWalletSummary(...args),
    getWalletLedger: (...args: unknown[]) => getWalletLedger(...args),
  }
})
vi.mock('@/server/referrals/program', () => ({
  getReferralProgram: (...args: unknown[]) => getReferralProgram(...args),
}))

import WalletView from './WalletView'

const LEDGER = [
  {
    id: 'r1',
    direction: 'credit' as const,
    signedAmountAgorot: agorot(2000),
    amountAgorot: agorot(2000),
    reason: 'referral_bonus',
    orderId: null,
    createdAt: '2026-09-20T10:00:00Z',
  },
  {
    id: 'r2',
    direction: 'credit' as const,
    signedAmountAgorot: agorot(1200),
    amountAgorot: agorot(1200),
    reason: 'order_cashback',
    orderId: 'order-1',
    createdAt: '2026-06-01T10:00:00Z',
  },
  {
    id: 'r3',
    direction: 'debit' as const,
    signedAmountAgorot: agorot(-500),
    amountAgorot: agorot(500),
    reason: 'order_spend',
    orderId: 'order-2',
    createdAt: '2026-07-01T10:00:00Z',
  },
]

beforeEach(() => {
  getWalletSummary.mockReset().mockResolvedValue({ balanceAgorot: agorot(2700), accountId: 'acct' })
  getWalletLedger.mockReset().mockResolvedValue(LEDGER)
  getReferralProgram.mockReset().mockResolvedValue(null)
})

async function render(): Promise<string> {
  return renderToStaticMarkup(await WalletView())
}

describe('WalletView', () => {
  it('shows the balance and every ledger row with a Hebrew reason', async () => {
    const html = await render()
    expect(html).toContain('27.00')
    expect(html).toContain('קאשבק חבר מביא חבר')
    expect(html).toContain('קאשבק על רכישה')
    expect(html).toContain('שימוש בארנק')
    // No raw reason code reaches the customer.
    expect(html).not.toContain('referral_bonus')
    expect(html).not.toContain('order_spend')
  })

  it('states the twelve-month policy and dates each expiring credit', async () => {
    const html = await render()
    expect(html).toContain('תקף ל-12 חודשים')
    // The referral credit lapses twelve months after 20.09.2026.
    expect(html).toContain('20.09.2027')
    // The order cashback lapses twelve months after 01.06.2026.
    expect(html).toContain('01.06.2027')
    // A spend has no expiry.
    expect(html).toContain('תוקף עד')
  })

  it('names the next credit to lapse, oldest first', async () => {
    const html = await render()
    // ₪12.00 earned 01.06 minus the ₪5.00 spend leaves ₪7.00, the soonest to lapse.
    expect(html).toMatch(/הקרוב לפקיעה: [^<]*7\.00[^<]*01\.06\.2027/)
  })

  it('promises the ₪20 referral reward only as "soon" while the programme is off', async () => {
    const html = await render()
    expect(html).toContain('בקרוב')
    expect(html).toContain('20.00')
    expect(html).toContain('href="/account/referrals"')
  })

  it('reads the live terms when the programme is on', async () => {
    getReferralProgram.mockResolvedValue({
      referrerBonus: agorot(2000),
      referredBonus: agorot(0),
      minOrder: agorot(5000),
      qualifyWindowDays: 14,
      requiresManualApproval: false,
    })
    const html = await render()
    expect(html).not.toContain('בקרוב')
    expect(html).toContain('50.00')
    expect(html).toContain('20.00')
  })

  it('names the ₪10 redemption floor on the balance card', async () => {
    const html = await render()
    expect(html).toContain('10.00')
  })

  it('has an empty state and no table when nothing moved', async () => {
    getWalletLedger.mockResolvedValue([])
    const html = await render()
    expect(html).toContain('עדיין אין תנועות בארנק')
    expect(html).not.toContain('<table')
  })
})
