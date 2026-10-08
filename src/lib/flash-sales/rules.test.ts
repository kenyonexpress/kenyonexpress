import { describe, expect, it } from 'vitest'
import {
  CLAIM_OUTCOME_HE,
  type FlashSale,
  isClaimOutcome,
  isLiveHold,
  isMissingFlashSchema,
  percentOff,
  phaseOf,
  pickHomeFlashSale,
  remainingOf,
  secondsUntil,
} from './rules'

/**
 * The pure half of flash sales (STEP 61). Pinned: the phase is decided from
 * the window and the flag against the clock passed in; the home banner picks
 * the live sale ending soonest, else the next one within a day, else nothing;
 * a hold bound to an order is live past its own expiry and an unbound one is
 * not; the percentage is a whole number from two integers; and the absent
 * schema is recognised under both the Postgres and the PostgREST codes.
 */

const NOW = new Date('2026-10-08T12:00:00Z')

function sale(overrides: Partial<FlashSale> = {}): FlashSale {
  return {
    id: 'a',
    product_id: 'p',
    name_he: 'מבצע',
    price_agorot: 9900,
    reference_agorot: 19900,
    allocation: 10,
    max_per_claim: 1,
    hold_minutes: 10,
    starts_at: '2026-10-08T11:00:00Z',
    ends_at: '2026-10-08T13:00:00Z',
    is_active: true,
    ...overrides,
  }
}

describe('phaseOf', () => {
  it('reads live inside the window, upcoming before it, ended at and after the end', () => {
    expect(phaseOf(sale(), NOW)).toBe('live')
    expect(phaseOf(sale({ starts_at: '2026-10-08T12:30:00Z' }), NOW)).toBe('upcoming')
    expect(phaseOf(sale({ ends_at: '2026-10-08T12:00:00Z' }), NOW)).toBe('ended')
    expect(phaseOf(sale({ ends_at: '2026-10-08T11:59:59Z' }), NOW)).toBe('ended')
  })

  it('is off when the flag is off or a date is unreadable, whatever the clock says', () => {
    expect(phaseOf(sale({ is_active: false }), NOW)).toBe('off')
    expect(phaseOf(sale({ starts_at: 'never' }), NOW)).toBe('off')
  })
})

describe('pickHomeFlashSale', () => {
  it('prefers the live sale that ends soonest', () => {
    const later = sale({ id: 'later', ends_at: '2026-10-08T15:00:00Z' })
    const sooner = sale({ id: 'sooner', ends_at: '2026-10-08T12:30:00Z' })
    expect(pickHomeFlashSale([later, sooner], NOW)?.id).toBe('sooner')
  })

  it('falls back to the next sale opening within a day, and ignores one further out', () => {
    const tomorrow = sale({
      id: 'tomorrow',
      starts_at: '2026-10-09T11:00:00Z',
      ends_at: '2026-10-09T13:00:00Z',
    })
    const nextWeek = sale({
      id: 'next-week',
      starts_at: '2026-10-15T11:00:00Z',
      ends_at: '2026-10-15T13:00:00Z',
    })
    expect(pickHomeFlashSale([nextWeek, tomorrow], NOW)?.id).toBe('tomorrow')
    expect(pickHomeFlashSale([nextWeek], NOW)).toBeNull()
  })

  it('never picks an ended or switched-off sale', () => {
    const ended = sale({ id: 'ended', ends_at: '2026-10-08T11:30:00Z' })
    const off = sale({ id: 'off', is_active: false })
    expect(pickHomeFlashSale([ended, off], NOW)).toBeNull()
    expect(pickHomeFlashSale([], NOW)).toBeNull()
  })
})

describe('holds and counts', () => {
  it('counts remaining as allocation minus taken, floored at zero and truncated', () => {
    expect(remainingOf(10, 3)).toBe(7)
    expect(remainingOf(10, 12)).toBe(0)
    expect(remainingOf(10.9, -2)).toBe(10)
  })

  it('treats a bound hold as live past its expiry and an unbound one as lapsed', () => {
    const past = '2026-10-08T11:59:00Z'
    const future = '2026-10-08T12:05:00Z'
    expect(isLiveHold({ status: 'held', expires_at: future, order_id: null }, NOW)).toBe(true)
    expect(isLiveHold({ status: 'held', expires_at: past, order_id: null }, NOW)).toBe(false)
    expect(isLiveHold({ status: 'held', expires_at: past, order_id: 'o1' }, NOW)).toBe(true)
    expect(isLiveHold({ status: 'queued', expires_at: future, order_id: null }, NOW)).toBe(false)
    expect(isLiveHold({ status: 'consumed', expires_at: null, order_id: 'o1' }, NOW)).toBe(false)
  })

  it('counts whole seconds until a moment, floored at zero, null for garbage', () => {
    expect(secondsUntil('2026-10-08T12:00:10Z', NOW)).toBe(10)
    expect(secondsUntil('2026-10-08T11:00:00Z', NOW)).toBe(0)
    expect(secondsUntil(null, NOW)).toBeNull()
    expect(secondsUntil('soon', NOW)).toBeNull()
  })
})

describe('percentOff', () => {
  it('rounds the whole percent from two integer prices and is zero without a higher reference', () => {
    expect(percentOff(9900, 19900)).toBe(50)
    expect(percentOff(7000, 10000)).toBe(30)
    expect(percentOff(9900, 9900)).toBe(0)
    expect(percentOff(9900, null)).toBe(0)
    expect(percentOff(9900, 5000)).toBe(0)
  })
})

describe('outcomes and the absent schema', () => {
  it('has a Hebrew line for every outcome the RPC can answer', () => {
    for (const outcome of Object.keys(CLAIM_OUTCOME_HE)) {
      expect(isClaimOutcome(outcome)).toBe(true)
      expect(CLAIM_OUTCOME_HE[outcome as keyof typeof CLAIM_OUTCOME_HE]).toMatch(/[֐-׿]/)
    }
    expect(isClaimOutcome('surprise')).toBe(false)
    expect(isClaimOutcome(null)).toBe(false)
  })

  it('recognises the absent table or function under every code the two layers answer', () => {
    expect(isMissingFlashSchema({ code: '42P01', message: 'x' })).toBe(true)
    expect(isMissingFlashSchema({ code: 'PGRST205', message: 'x' })).toBe(true)
    expect(isMissingFlashSchema({ code: '42883', message: 'x' })).toBe(true)
    expect(isMissingFlashSchema({ code: 'PGRST202', message: 'x' })).toBe(true)
    expect(isMissingFlashSchema({ message: 'relation "public.flash_sales" does not exist' })).toBe(
      true,
    )
    expect(isMissingFlashSchema({ code: '23505', message: 'duplicate key' })).toBe(false)
    expect(isMissingFlashSchema(null)).toBe(false)
  })
})
