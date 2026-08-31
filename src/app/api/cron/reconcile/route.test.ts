import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The terminal reconciliation job, which is the only thing in this codebase
 * that can see money that moved at Cardcom and left no row here at all.
 *
 * The diff itself is pure and covered by `terminal-reconciliation.test.ts`.
 * What is tested here is everything AROUND the diff, because that is where this
 * job can fail quietly: querying one terminal instead of all of them, treating
 * an unreachable terminal as missing money, assigning a payment to the wrong
 * account, or mailing the same discrepancy twice because the window overlaps by
 * design.
 */

const rpc = vi.fn()
const from = vi.fn()
const listTransactions = vi.fn()
const loadCardcomEnv = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc, from }),
}))

vi.mock('@/lib/payments', () => ({
  loadCardcomEnv: () => loadCardcomEnv(),
  getPaymentProvider: (accountId: string) => ({
    listTransactions: (window: unknown) => listTransactions(accountId, window),
  }),
  getCardcomAccounts: () => ({
    list: () => [{ id: 'platform' }, { id: 'supplier-7' }],
    // The route must ask the registry which account a row belongs to rather
    // than defaulting to the first of the list. A null id is a pre-multi-account
    // row and belongs to the platform terminal.
    get: (id?: string | null) => ({ id: id ?? 'platform' }),
  }),
}))

vi.mock('@/lib/payments/payment-money-columns', () => ({
  resolvePaymentMoneySchema: async () => ({ kind: 'ils', amountColumn: 'amount_ils' }),
  readAmountAgorot: (_schema: unknown, row: Record<string, unknown>) =>
    Math.round(Number(row.amount_ils ?? 0) * 100),
}))

import { GET } from './route'

type PaymentRow = {
  id: string
  order_id: string
  status: string
  kind: 'charge' | 'refund' | null
  cardcom_transaction_id: string | null
  cardcom_account_id: string | null
  amount_ils: number
}

/** `from('payments').select(...).gte(...).lte(...).limit(...)` is a thenable. */
function paymentsReturning(rows: PaymentRow[], error: { message: string } | null = null) {
  const result = { data: error ? null : rows, error }
  const chain = {
    select: () => chain,
    gte: () => chain,
    lte: () => chain,
    limit: () => Promise.resolve(result),
  }
  return () => chain
}

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/reconcile', {
    headers: auth ? { authorization: auth } : {},
  })
}

const CHARGE: PaymentRow = {
  id: 'pay-1',
  order_id: 'order-1',
  status: 'succeeded',
  kind: 'charge',
  cardcom_transaction_id: 'tx-1',
  cardcom_account_id: 'platform',
  amount_ils: 12.3,
}

function terminalCharge(transactionId: string, amountAgorot: number) {
  return { transactionId, amountAgorot, occurredAt: null, isRefund: false }
}

describe('terminal reconciliation cron', () => {
  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ error: null })
    from.mockReset().mockImplementation(paymentsReturning([CHARGE]))
    listTransactions.mockReset().mockResolvedValue({ ok: true, transactions: [] })
    loadCardcomEnv.mockReset().mockReturnValue({ checkoutEnabled: true })
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('auth', () => {
    it('rejects a request with no credential', async () => {
      expect((await GET(request())).status).toBe(401)
      expect(listTransactions).not.toHaveBeenCalled()
    })

    it('rejects a wrong credential', async () => {
      expect((await GET(request('Bearer wrong'))).status).toBe(401)
      expect(listTransactions).not.toHaveBeenCalled()
    })

    it('stays closed when CRON_SECRET is unset rather than opening', async () => {
      // This endpoint pulls every terminal's transaction list from Cardcom and
      // can mail an admin. An unconfigured deploy must not be an open one.
      vi.stubEnv('CRON_SECRET', '')
      expect((await GET(request('Bearer '))).status).toBe(401)
      expect(listTransactions).not.toHaveBeenCalled()
    })
  })

  describe('a machine that was never given Cardcom credentials', () => {
    it('skips instead of reporting every payment as missing', async () => {
      loadCardcomEnv.mockReturnValue({ checkoutEnabled: false })
      const response = await GET(request('Bearer s3cret'))
      expect(await response.json()).toEqual({ ok: true, skipped: 'provider_unconfigured' })
      expect(listTransactions).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })
  })

  describe('which terminals are asked', () => {
    it('asks every account, not only the platform one', async () => {
      // Cardcom scopes a deal to the terminal that took it, so a report pulled
      // from one account says nothing about the others, and this project runs a
      // terminal per supplier account.
      await GET(request('Bearer s3cret'))
      expect(listTransactions.mock.calls.map((c) => c[0])).toEqual(['platform', 'supplier-7'])
    })

    it('asks each of them for the same 48 hour window', async () => {
      // 48 hours for a daily job on purpose: a transaction either side of
      // midnight is seen twice rather than never.
      await GET(request('Bearer s3cret'))
      const [, window] = listTransactions.mock.calls[0] as [
        string,
        { fromIso: string; toIso: string },
      ]
      const spanHours = (Date.parse(window.toIso) - Date.parse(window.fromIso)) / 3_600_000
      expect(spanHours).toBeCloseTo(48, 5)
    })

    it('reports a terminal it could not reach as unreached, not as missing money', async () => {
      // "We could not ask" and "the money is gone" must never produce the same
      // alert. The first one wakes somebody for nothing every time a Cardcom
      // endpoint blips.
      listTransactions.mockResolvedValueOnce({ ok: false, reason: 'timeout' })
      const response = await GET(request('Bearer s3cret'))
      const body = await response.json()
      expect(body.critical).toBe(0)
      expect(body.accounts).toEqual([{ account: 'supplier-7', matched: 0, critical: 0 }])
      expect(rpc).not.toHaveBeenCalled()
    })

    it('still checks the other terminals when one is unreachable', async () => {
      listTransactions
        .mockResolvedValueOnce({ ok: false, reason: 'timeout' })
        .mockResolvedValueOnce({ ok: true, transactions: [terminalCharge('tx-ghost', 5000)] })
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body.critical).toBe(1)
    })
  })

  describe('which payments belong to which terminal', () => {
    it('gives a row with no account id to the platform terminal, not to the first of the list', async () => {
      // Defaulting to accounts[0] would silently reassign every pre-
      // multi-account row if the list order ever changed.
      from.mockImplementation(
        paymentsReturning([
          { ...CHARGE, cardcom_account_id: null, cardcom_transaction_id: 'tx-9' },
        ]),
      )
      listTransactions
        .mockResolvedValueOnce({ ok: true, transactions: [terminalCharge('tx-9', 1230)] })
        .mockResolvedValueOnce({ ok: true, transactions: [] })
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body.accounts).toEqual([
        { account: 'platform', matched: 1, critical: 0 },
        { account: 'supplier-7', matched: 0, critical: 0 },
      ])
    })

    it('does not match a supplier terminal charge against a platform payment', async () => {
      listTransactions
        .mockResolvedValueOnce({ ok: true, transactions: [] })
        .mockResolvedValueOnce({ ok: true, transactions: [terminalCharge('tx-1', 1230)] })
      const body = await (await GET(request('Bearer s3cret'))).json()
      // Same transaction id, wrong terminal: the platform payment is missing
      // remotely and the supplier charge is missing locally.
      expect(body.critical).toBe(1)
      expect(body.discrepancies).toBe(2)
    })
  })

  describe('who gets woken', () => {
    it('mails on a charge the terminal has and we do not', async () => {
      listTransactions.mockResolvedValueOnce({
        ok: true,
        transactions: [terminalCharge('tx-1', 1230), terminalCharge('tx-ghost', 9900)],
      })
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body.critical).toBe(1)
      expect(rpc).toHaveBeenCalledTimes(1)
      const [fn, payload] = rpc.mock.calls[0] as [string, Record<string, unknown>]
      expect(fn).toBe('fn_enqueue_notification')
      expect(payload.p_kind).toBe('reconciliation_gap')
    })

    it('mails on an amount both sides disagree about', async () => {
      listTransactions.mockResolvedValueOnce({
        ok: true,
        transactions: [terminalCharge('tx-1', 9999)],
      })
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body.critical).toBe(1)
      expect(rpc).toHaveBeenCalledTimes(1)
    })

    it('stays quiet when the only difference is a payment the terminal did not report', async () => {
      // missing_remotely is usually the window boundary, not a fault. Paging on
      // it would page every night.
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body.discrepancies).toBe(1)
      expect(body.critical).toBe(0)
      expect(rpc).not.toHaveBeenCalled()
    })

    it('stays quiet when everything matches', async () => {
      listTransactions.mockResolvedValueOnce({
        ok: true,
        transactions: [terminalCharge('tx-1', 1230)],
      })
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body).toMatchObject({ ok: true, discrepancies: 0, critical: 0 })
      expect(rpc).not.toHaveBeenCalled()
    })

    it('dedupes on the day, because the 48 hour window finds the same gap twice', async () => {
      listTransactions.mockResolvedValue({
        ok: true,
        transactions: [terminalCharge('tx-ghost', 100)],
      })
      await GET(request('Bearer s3cret'))
      const first = (rpc.mock.calls[0] as [string, Record<string, unknown>])[1].p_dedupe
      rpc.mockClear()
      await GET(request('Bearer s3cret'))
      const second = (rpc.mock.calls[0] as [string, Record<string, unknown>])[1].p_dedupe
      expect(second).toBe(first)
      expect(String(first)).toMatch(/^admin:reconciliation_gap:\d{4}-\d{2}-\d{2}$/)
    })

    it('caps the rows it mails, because an alert listing hundreds is one nobody reads', async () => {
      listTransactions.mockResolvedValueOnce({
        ok: true,
        transactions: Array.from({ length: 30 }, (_, i) => terminalCharge(`ghost-${i}`, 100)),
      })
      const body = await (await GET(request('Bearer s3cret'))).json()
      expect(body.critical).toBe(30)
      const payload = (rpc.mock.calls[0] as [string, Record<string, unknown>])[1] as {
        p_payload: { critical: number; rows: unknown[] }
      }
      // The full count still travels; only the listing is capped.
      expect(payload.p_payload.critical).toBe(30)
      expect(payload.p_payload.rows).toHaveLength(20)
    })

    it('still reports the gap when the alert could not be enqueued', async () => {
      // The diff is the valuable output. Losing it because the mailer is down
      // would turn one outage into two.
      rpc.mockResolvedValue({ error: { message: 'outbox down' } })
      listTransactions.mockResolvedValueOnce({
        ok: true,
        transactions: [terminalCharge('tx-ghost', 100)],
      })
      const response = await GET(request('Bearer s3cret'))
      expect(response.status).toBe(200)
      expect((await response.json()).critical).toBe(1)
    })
  })

  describe('when our own payments table cannot be read', () => {
    it('fails loudly instead of reporting an empty ledger', async () => {
      // An empty local list against a live terminal reads as "every charge is
      // missing locally", which is the loudest possible alert and entirely
      // wrong.
      from.mockImplementation(paymentsReturning([], { message: 'connection reset' }))
      const response = await GET(request('Bearer s3cret'))
      expect(response.status).toBe(500)
      expect(listTransactions).not.toHaveBeenCalled()
      expect(rpc).not.toHaveBeenCalled()
    })
  })
})
