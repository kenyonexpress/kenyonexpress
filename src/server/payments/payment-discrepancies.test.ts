import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type DiscrepancyRecord,
  recordPaymentDiscrepancies,
  resetMissingTableLatchForTest,
} from './payment-discrepancies'

const error = vi.fn()
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (...args: unknown[]) => error(...args),
    warn: () => {},
    info: () => {},
  },
}))

const rpc = vi.fn()
const admin = { rpc } as unknown as SupabaseClient

function record(overrides: Partial<DiscrepancyRecord['discrepancy']> = {}): DiscrepancyRecord {
  return {
    accountId: 'platform',
    discrepancy: {
      kind: 'missing_locally',
      transactionId: 'tx-ghost',
      terminalAgorot: 9900,
      localAgorot: null,
      orderId: null,
      paymentId: null,
      ...overrides,
    },
  }
}

beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ error: null })
  error.mockReset()
  resetMissingTableLatchForTest()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('recordPaymentDiscrepancies', () => {
  it('does not talk to the database when there is nothing to record', async () => {
    await recordPaymentDiscrepancies(admin, [])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sends one batch, whatever the number of findings', async () => {
    await recordPaymentDiscrepancies(
      admin,
      Array.from({ length: 40 }, (_, i) => record({ transactionId: `tx-${i}` })),
    )
    expect(rpc).toHaveBeenCalledTimes(1)
    const [fn, args] = rpc.mock.calls[0] as [string, { p_rows: unknown[] }]
    expect(fn).toBe('fn_record_payment_discrepancies')
    expect(args.p_rows).toHaveLength(40)
  })

  it('carries the account, so one deal number on two terminals is two findings', async () => {
    // Cardcom scopes a deal number to the terminal that took it. Without the
    // account in the key the second terminal's row would overwrite the first.
    await recordPaymentDiscrepancies(admin, [
      { ...record(), accountId: 'platform' },
      { ...record(), accountId: 'supplier-7' },
    ])
    const [, args] = rpc.mock.calls[0] as [string, { p_rows: { cardcom_account_id: string }[] }]
    expect(args.p_rows.map((r) => r.cardcom_account_id)).toEqual(['platform', 'supplier-7'])
  })

  it('sends no timestamps and no counter, because those are the function to decide', async () => {
    // A client that sent `first_seen_at` would reset the age of every open
    // finding on every run, and a client that computed `seen_count` would lose
    // an increment whenever two runs overlap.
    await recordPaymentDiscrepancies(admin, [record()])
    const [, args] = rpc.mock.calls[0] as [string, { p_rows: Record<string, unknown>[] }]
    const row = args.p_rows[0] as Record<string, unknown>
    expect(row).not.toHaveProperty('first_seen_at')
    expect(row).not.toHaveProperty('last_seen_at')
    expect(row).not.toHaveProperty('seen_count')
    expect(row).toMatchObject({
      kind: 'missing_locally',
      transaction_id: 'tx-ghost',
      terminal_agorot: 9900,
      local_agorot: null,
    })
  })

  it('keeps a null on the side that has no amount, rather than inventing a zero', async () => {
    // `missing_locally` has no local amount and `missing_remotely` has no
    // terminal one. A zero would read as "we say it was free", which is a
    // different and much quieter claim than "we have no row".
    await recordPaymentDiscrepancies(admin, [
      record({ kind: 'missing_remotely', terminalAgorot: null, localAgorot: 1230 }),
    ])
    const [, args] = rpc.mock.calls[0] as [string, { p_rows: Record<string, unknown>[] }]
    expect(args.p_rows[0]).toMatchObject({ terminal_agorot: null, local_agorot: 1230 })
  })

  it('says the unapplied migration once, not once per run', async () => {
    rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'no such function' } })
    await recordPaymentDiscrepancies(admin, [record()])
    await recordPaymentDiscrepancies(admin, [record()])
    await recordPaymentDiscrepancies(admin, [record()])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error.mock.calls[0]?.[1]).toMatchObject({ not_applied: true })
  })

  it('says any other failure every time, because any other failure is a surprise', async () => {
    rpc.mockResolvedValue({ error: { code: '23514', message: 'check constraint' } })
    await recordPaymentDiscrepancies(admin, [record()])
    await recordPaymentDiscrepancies(admin, [record()])
    expect(error).toHaveBeenCalledTimes(2)
    expect(error.mock.calls[0]?.[1]).toMatchObject({ not_applied: false })
  })

  it('never throws, because recording is not the job', async () => {
    // The job is asking the terminal. A write that cannot land must not turn a
    // successful reconciliation into a 500 that the scheduler retries, because
    // the retry re-pulls every terminal.
    rpc.mockRejectedValue(new Error('socket hang up'))
    await expect(recordPaymentDiscrepancies(admin, [record()])).resolves.toBeUndefined()
    expect(error).toHaveBeenCalledTimes(1)
  })
})
