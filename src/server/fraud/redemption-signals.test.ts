import { recordRedemptionSignals } from '@/server/fraud/redemption-signals'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const warn = vi.fn()
vi.mock('@/lib/observability/log', () => ({ log: { warn: (...args: unknown[]) => warn(...args) } }))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-01T12:00:00.000Z')

type Row = Record<string, unknown>

/** A minimal stand-in for the two `.select().eq().gte().limit()` reads this module makes. */
function client(
  byIpRows: Row[],
  byUserRows: Row[],
  opts?: { ipError?: string; userError?: string },
) {
  return {
    from: (table: string) => {
      expect(table).toBe('voucher_redemptions')
      return {
        select: (columns: string) => {
          const isIpQuery = columns === 'scanned_by'
          return {
            eq: () => ({
              gte: () => ({
                limit: () =>
                  Promise.resolve(
                    isIpQuery
                      ? { data: byIpRows, error: opts?.ipError ? { message: opts.ipError } : null }
                      : {
                          data: byUserRows,
                          error: opts?.userError ? { message: opts.userError } : null,
                        },
                  ),
              }),
            }),
          }
        },
      }
    },
  } as never
}

beforeEach(() => {
  warn.mockClear()
})

describe('recordRedemptionSignals', () => {
  it('logs nothing for ordinary traffic', async () => {
    await recordRedemptionSignals(client([{ scanned_by: USER_ID }], [{ outcome: 'success' }]), {
      userId: USER_ID,
      ip: '203.0.113.9',
      now: NOW,
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it('flags ip_shared_across_accounts when three accounts share one address', async () => {
    await recordRedemptionSignals(
      client(
        [{ scanned_by: 'a' }, { scanned_by: 'b' }, { scanned_by: 'c' }],
        [{ outcome: 'success' }],
      ),
      { userId: USER_ID, ip: '203.0.113.9', now: NOW },
    )
    expect(warn).toHaveBeenCalledWith(
      'fraud.redemption_velocity_flagged',
      expect.objectContaining({ flags: expect.arrayContaining(['ip_shared_across_accounts']) }),
    )
  })

  it('flags account_high_failure_rate without needing an address', async () => {
    const failures = Array.from({ length: 20 }, () => ({ outcome: 'already_redeemed' }))
    await recordRedemptionSignals(client([], failures), { userId: USER_ID, ip: null, now: NOW })
    expect(warn).toHaveBeenCalledWith(
      'fraud.redemption_velocity_flagged',
      expect.objectContaining({ flags: ['account_high_failure_rate'] }),
    )
  })

  it('never throws when a read fails, and reports zero rather than guessing', async () => {
    await expect(
      recordRedemptionSignals(client([], [], { ipError: 'boom', userError: 'boom' }), {
        userId: USER_ID,
        ip: '203.0.113.9',
        now: NOW,
      }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith('fraud.redemption_ip_read_failed', { reason: 'boom' })
    expect(warn).toHaveBeenCalledWith('fraud.redemption_user_read_failed', { reason: 'boom' })
  })

  it('never throws when the client itself throws', async () => {
    const throwing = {
      from: () => {
        throw new Error('client unavailable')
      },
    } as never
    await expect(
      recordRedemptionSignals(throwing, { userId: USER_ID, ip: '203.0.113.9', now: NOW }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      'fraud.redemption_signals_unavailable',
      expect.objectContaining({ userId: USER_ID }),
    )
  })
})
