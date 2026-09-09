import { afterEach, describe, expect, it, vi } from 'vitest'
import { giftHeldCopy } from './held-copy'

const NOW = new Date('2026-09-10T12:00:00.000Z')

afterEach(() => {
  vi.useRealTimers()
})

function at(now: Date) {
  vi.useFakeTimers()
  vi.setSystemTime(now)
}

describe('giftHeldCopy', () => {
  it('names the recipient, because it is the buyer’s own input read back', () => {
    at(NOW)
    const copy = giftHeldCopy({
      recipientName: 'דנה',
      recipientEmail: 'dana@example.com',
      deliverAt: null,
      queuedAt: '2026-09-10T11:00:00.000Z',
    })
    expect(copy.headline).toContain('דנה')
  })

  it('falls back to the email when no name was given', () => {
    at(NOW)
    const copy = giftHeldCopy({
      recipientName: null,
      recipientEmail: 'dana@example.com',
      deliverAt: null,
      queuedAt: null,
    })
    expect(copy.headline).toContain('dana@example.com')
  })

  it('falls back again rather than printing "null"', () => {
    at(NOW)
    const copy = giftHeldCopy({
      recipientName: null,
      recipientEmail: null,
      deliverAt: null,
      queuedAt: null,
    })
    expect(copy.headline).not.toContain('null')
    expect(copy.headline).toContain('המקבל')
  })

  it('says WILL be sent, in the future, for a scheduled gift', () => {
    /**
     * The reason this is one function and not three copies. `queuedAt` is set
     * the moment finalize runs, but with 226 the outbox row can be parked for
     * weeks - so a surface reading `queuedAt` alone would tell a customer their
     * gift had been sent two months before it goes out.
     */
    at(NOW)
    const copy = giftHeldCopy({
      recipientName: 'דנה',
      recipientEmail: null,
      deliverAt: '2026-12-24T00:00:00.000Z',
      queuedAt: '2026-09-10T11:00:00.000Z',
    })
    expect(copy.headline).toContain('יישלח')
    expect(copy.badge).toBe('מתנה מתוזמנת')
  })

  it('says it HAS been sent once the scheduled date has passed', () => {
    at(new Date('2026-12-25T00:00:00.000Z'))
    const copy = giftHeldCopy({
      recipientName: 'דנה',
      recipientEmail: null,
      deliverAt: '2026-12-24T00:00:00.000Z',
      queuedAt: '2026-09-10T11:00:00.000Z',
    })
    expect(copy.headline).toContain('נשלח')
    expect(copy.badge).toBe('מתנה')
  })

  it('does not claim it was sent when it has not been queued', () => {
    at(NOW)
    const copy = giftHeldCopy({
      recipientName: 'דנה',
      recipientEmail: null,
      deliverAt: null,
      queuedAt: null,
    })
    expect(copy.headline).toContain('מיועד')
  })

  it('always explains why there is no code, on every branch', () => {
    // A customer who bought a coupon and sees no code concludes the site is
    // broken. One who is told the code is with the person they sent it to
    // concludes it worked.
    at(NOW)
    for (const deliverAt of [null, '2026-12-24T00:00:00.000Z']) {
      for (const queuedAt of [null, '2026-09-10T11:00:00.000Z']) {
        const copy = giftHeldCopy({
          recipientName: 'דנה',
          recipientEmail: null,
          deliverAt,
          queuedAt,
        })
        // "למקבל בלבד" on every branch: the reason is stated, never inferred.
        expect(copy.explanation).toContain('מקבל')
        expect(copy.explanation).toContain('QR')
        expect(copy.explanation.length).toBeGreaterThan(20)
      }
    }
  })
})
