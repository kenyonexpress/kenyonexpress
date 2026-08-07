import { parsePercentSnapshot } from '@/lib/cart/snapshot'
import { describe, expect, it } from 'vitest'

/**
 * The cart is stored as JSONB in a row the guest's own session owns, so
 * whatever is in `items` comes back exactly as written. The snapshot is only
 * ever written by the server from a fresh read of `public.products`, and this
 * function is the check that survives someone writing to that row anyway.
 */
describe('parsePercentSnapshot', () => {
  it('accepts a whole percent', () => {
    expect(parsePercentSnapshot(10)).toBe(10)
    expect(parsePercentSnapshot(0)).toBe(0)
    expect(parsePercentSnapshot(100)).toBe(100)
  })

  it('accepts a fractional percent, which the catalogue does store', () => {
    expect(parsePercentSnapshot(12.5)).toBe(12.5)
  })

  it('accepts the numeric string a JSONB column can hand back', () => {
    expect(parsePercentSnapshot('7.5')).toBe(7.5)
  })

  it('rejects a rate outside 0..100', () => {
    expect(parsePercentSnapshot(101)).toBeNull()
    expect(parsePercentSnapshot(-1)).toBeNull()
    expect(parsePercentSnapshot(1e9)).toBeNull()
  })

  it('rejects what is not a number at all', () => {
    expect(parsePercentSnapshot('ten')).toBeNull()
    expect(parsePercentSnapshot({})).toBeNull()
    expect(parsePercentSnapshot([])).toBeNull()
    expect(parsePercentSnapshot(Number.NaN)).toBeNull()
    expect(parsePercentSnapshot(Number.POSITIVE_INFINITY)).toBeNull()
  })

  it('returns null, not zero, when nothing is on file', () => {
    // The distinction C1 rests on: a missing percent makes the line
    // unpriceable, while a zero percent is a real rate that takes nothing.
    expect(parsePercentSnapshot(null)).toBeNull()
    expect(parsePercentSnapshot(undefined)).toBeNull()
  })

  it('does not let empty or boolean values coerce to a zero rate', () => {
    // Number('') and Number(false) are both 0. Reaching that by coercion would
    // turn a blank column into a line the platform earns nothing on.
    expect(parsePercentSnapshot('')).toBeNull()
    expect(parsePercentSnapshot('   ')).toBeNull()
    expect(parsePercentSnapshot(false)).toBeNull()
    expect(parsePercentSnapshot(true)).toBeNull()
  })
})
