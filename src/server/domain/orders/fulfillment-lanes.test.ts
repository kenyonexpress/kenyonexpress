import { describe, expect, it } from 'vitest'
import {
  FULFILLMENT_LANES,
  LANE_LABELS,
  laneFor,
  moveForDrop,
  movesForLanes,
  parcelLines,
} from './fulfillment-lanes'

/**
 * The lane is derived from two columns that already exist and is never
 * stored, so the derivation is the whole feature: a wrong branch here files a
 * shipped parcel under "paid" on every board load with no error anywhere.
 */

const physical = (item_status: string) => ({ product_type: 'physical', item_status })
const coupon = (item_status: string) => ({ product_type: 'coupon', item_status })

describe('laneFor', () => {
  it('reads the money lifecycle first: pending, cancelled, refunded, fulfilled, settled', () => {
    expect(laneFor({ status: 'pending', lines: [physical('pending')] })).toBe('new')
    expect(laneFor({ status: 'cancelled', lines: [physical('shipped')] })).toBe('cancelled')
    expect(laneFor({ status: 'refunded', lines: [physical('delivered')] })).toBe('cancelled')
    expect(laneFor({ status: 'fulfilled', lines: [physical('pending')] })).toBe('delivered')
    expect(laneFor({ status: 'platform_settled', lines: [] })).toBe('delivered')
  })

  it('a paid order with nothing shipped is paid, and a coupon-only order stays paid', () => {
    expect(laneFor({ status: 'paid', lines: [physical('pending')] })).toBe('paid')
    expect(laneFor({ status: 'paid', lines: [coupon('issued')] })).toBe('paid')
    expect(laneFor({ status: 'paid', lines: [] })).toBe('paid')
  })

  it('one shipped parcel puts the order in shipped, even with others still pending', () => {
    expect(laneFor({ status: 'paid', lines: [physical('shipped'), physical('pending')] })).toBe(
      'shipped',
    )
    expect(
      laneFor({
        status: 'partially_fulfilled',
        lines: [physical('delivered'), physical('pending')],
      }),
    ).toBe('shipped')
  })

  it('every parcel delivered reads as delivered before the order status catches up', () => {
    expect(laneFor({ status: 'paid', lines: [physical('delivered'), coupon('issued')] })).toBe(
      'delivered',
    )
  })

  it('a cancelled or refunded line is not a parcel', () => {
    expect(laneFor({ status: 'paid', lines: [physical('delivered'), physical('cancelled')] })).toBe(
      'delivered',
    )
    expect(laneFor({ status: 'paid', lines: [physical('refunded')] })).toBe('paid')
    expect(parcelLines([physical('refunded'), physical('shipped'), coupon('issued')])).toEqual([
      physical('shipped'),
    ])
  })
})

describe('board moves', () => {
  it('offers exactly the three audited moves and refuses the rest', () => {
    expect(moveForDrop('new', 'cancelled')).toBe('cancel')
    expect(moveForDrop('paid', 'shipped')).toBe('ship')
    expect(moveForDrop('shipped', 'delivered')).toBe('deliver')
    // Money moves belong to the refund console, and terminals are terminal.
    expect(moveForDrop('paid', 'cancelled')).toBeNull()
    expect(moveForDrop('paid', 'delivered')).toBeNull()
    expect(moveForDrop('delivered', 'shipped')).toBeNull()
    expect(moveForDrop('cancelled', 'new')).toBeNull()
    expect(moveForDrop('new', 'paid')).toBeNull()
  })

  it('bulk buttons follow the lanes in the selection', () => {
    expect(movesForLanes(['paid'])).toEqual(['ship'])
    expect(movesForLanes(['shipped'])).toEqual(['ship', 'deliver'])
    expect(movesForLanes(['new'])).toEqual(['cancel'])
    expect(movesForLanes(['delivered', 'cancelled'])).toEqual([])
    expect(movesForLanes(['new', 'paid', 'shipped'])).toEqual(['ship', 'deliver', 'cancel'])
  })

  it('names every lane in Hebrew, in board order', () => {
    expect(FULFILLMENT_LANES).toEqual(['new', 'paid', 'shipped', 'delivered', 'cancelled'])
    for (const lane of FULFILLMENT_LANES) expect(LANE_LABELS[lane]).toMatch(/^[֐-׿ ]+$/)
  })
})
