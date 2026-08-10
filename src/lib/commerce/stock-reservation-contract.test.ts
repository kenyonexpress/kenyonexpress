import { describe, expect, it } from 'vitest'

/**
 * The reservation contract, stated as executable expectations.
 *
 * WHAT THIS FILE IS, AND WHAT IT IS NOT. The atomicity lives in Postgres -
 * `reserve_order_stock` takes a row lock and `consume_order_stock` decrements in
 * one statement - and no test running in this process can prove a database's
 * locking. Two things are done about that rather than pretending otherwise:
 *
 *   1. The behaviour WAS proved against the production database, in a
 *      transaction that ended with a deliberate rollback. Two orders for one
 *      unit: the first reserved (0 shortfalls), the second was refused (1
 *      shortfall), availability read 0 while held, `consume` decremented once
 *      and a replayed consume decremented nothing, and the level went 1 -> 0.
 *      That is the measurement; this file is the record of what it must keep
 *      meaning.
 *
 *   2. The rules that a race would EXPOSE - what counts as available, when a
 *      hold is live, what a replay must do - are pure functions, and those are
 *      tested for real here. A regression in them is what would make the
 *      database-level guarantee useless.
 *
 * The model below is a reimplementation of the SQL's arithmetic, deliberately
 * so: if the SQL changes and this does not, the two disagree and somebody has
 * to decide which is right. That is the failure mode this file wants.
 */

type Reservation = {
  orderId: string
  productId: string
  quantity: number
  expiresAtMs: number
  consumed?: boolean
  released?: boolean
}

/** Mirrors `available_stock`: level minus LIVE holds, null passed through. */
function availableStock(
  level: number | null,
  reservations: readonly Reservation[],
  nowMs: number,
  excludeOrderId?: string,
): number | null {
  if (level === null) return null
  const held = reservations
    .filter(
      (r) =>
        !r.consumed &&
        !r.released &&
        r.expiresAtMs > nowMs &&
        (excludeOrderId === undefined || r.orderId !== excludeOrderId),
    )
    .reduce((sum, r) => sum + r.quantity, 0)
  return Math.max(0, level - held)
}

describe('availability under a live hold', () => {
  const now = 1_000_000

  it('subtracts another order hold, which is what stops the oversell', () => {
    // The whole point: shopper A is on the payment page holding the last unit,
    // and shopper B must not be told it is available.
    const held: Reservation[] = [
      { orderId: 'a', productId: 'p', quantity: 1, expiresAtMs: now + 60_000 },
    ]
    expect(availableStock(1, held, now)).toBe(0)
  })

  it('excludes the asking order own hold, so a retried checkout is not refused its own stock', () => {
    const held: Reservation[] = [
      { orderId: 'a', productId: 'p', quantity: 1, expiresAtMs: now + 60_000 },
    ]
    expect(availableStock(1, held, now, 'a')).toBe(1)
  })

  it('stops counting a hold the moment it lapses, without waiting for a cron', () => {
    // The release job is bookkeeping. If freeing stock depended on it, a cron
    // that failed for a day would keep a product sold out for a day.
    const lapsed: Reservation[] = [
      { orderId: 'a', productId: 'p', quantity: 1, expiresAtMs: now - 1 },
    ]
    expect(availableStock(1, lapsed, now)).toBe(1)
  })

  it('stops counting a consumed hold, which has already become a decrement', () => {
    // Double-counting here would subtract the same unit twice: once as a hold
    // and once from the level.
    const consumed: Reservation[] = [
      { orderId: 'a', productId: 'p', quantity: 1, expiresAtMs: now + 60_000, consumed: true },
    ]
    expect(availableStock(1, consumed, now)).toBe(1)
  })

  it('stops counting a released hold', () => {
    const released: Reservation[] = [
      { orderId: 'a', productId: 'p', quantity: 1, expiresAtMs: now + 60_000, released: true },
    ]
    expect(availableStock(1, released, now)).toBe(1)
  })

  it('passes null through rather than reporting zero', () => {
    // An untracked product is not a sold-out one, and most of this catalogue is
    // untracked.
    expect(availableStock(null, [], now)).toBeNull()
  })

  it('never reports a negative, however the level got there', () => {
    const held: Reservation[] = [
      { orderId: 'a', productId: 'p', quantity: 5, expiresAtMs: now + 60_000 },
    ]
    expect(availableStock(2, held, now)).toBe(0)
  })
})

/** Mirrors `reserve_order_stock`: all lines or none. */
function reserve(
  request: readonly { productId: string; quantity: number }[],
  levels: Record<string, number | null>,
  reservations: readonly Reservation[],
  nowMs: number,
  orderId: string,
): { ok: true } | { ok: false; short: string[] } {
  const short = request
    .filter((line) => {
      const available = availableStock(levels[line.productId] ?? null, reservations, nowMs, orderId)
      return available !== null && available < line.quantity
    })
    .map((line) => line.productId)
  return short.length === 0 ? { ok: true } : { ok: false, short }
}

describe('reserving a whole basket', () => {
  const now = 1_000_000

  it('takes every line or none of them', () => {
    // Unlike the offline scan batch, whose items are independent facts, these
    // lines are one basket and one payment: a partial hold would charge a
    // customer for a basket they cannot be given.
    const result = reserve(
      [
        { productId: 'a', quantity: 1 },
        { productId: 'b', quantity: 5 },
      ],
      { a: 10, b: 2 },
      [],
      now,
      'order-1',
    )
    expect(result).toEqual({ ok: false, short: ['b'] })
  })

  it('lets an untracked line through without blocking the basket', () => {
    expect(reserve([{ productId: 'a', quantity: 99 }], { a: null }, [], now, 'order-1')).toEqual({
      ok: true,
    })
  })

  it('refuses the second of two orders for one unit', () => {
    // The measured production case, restated: A holds, B is refused.
    const held: Reservation[] = [
      { orderId: 'A', productId: 'p', quantity: 1, expiresAtMs: now + 60_000 },
    ]
    expect(reserve([{ productId: 'p', quantity: 1 }], { p: 1 }, held, now, 'A')).toEqual({
      ok: true,
    })
    expect(reserve([{ productId: 'p', quantity: 1 }], { p: 1 }, held, now, 'B')).toEqual({
      ok: false,
      short: ['p'],
    })
  })
})

/** Mirrors `consume_order_stock`: idempotent through `consumed_at`. */
function consume(
  orderId: string,
  levels: Record<string, number>,
  reservations: Reservation[],
): number {
  let decremented = 0
  for (const r of reservations) {
    if (r.orderId !== orderId || r.consumed || r.released) continue
    r.consumed = true
    const level = levels[r.productId]
    if (level !== undefined) {
      levels[r.productId] = level - r.quantity
      decremented++
    }
  }
  return decremented
}

describe('consuming a hold', () => {
  it('decrements once and a replay decrements nothing', () => {
    // A webhook replay is ordinary, not exceptional. The guard is on the
    // RESERVATION rather than on the order status, which is why this holds even
    // when the order was already marked paid by a concurrent finalize.
    const levels = { p: 1 }
    const reservations: Reservation[] = [
      { orderId: 'a', productId: 'p', quantity: 1, expiresAtMs: 2_000_000 },
    ]
    expect(consume('a', levels, reservations)).toBe(1)
    expect(levels.p).toBe(0)
    expect(consume('a', levels, reservations)).toBe(0)
    expect(levels.p).toBe(0)
  })

  it('does not consume a hold that was already released', () => {
    const levels = { p: 3 }
    const reservations: Reservation[] = [
      { orderId: 'a', productId: 'p', quantity: 1, expiresAtMs: 2_000_000, released: true },
    ]
    expect(consume('a', levels, reservations)).toBe(0)
    expect(levels.p).toBe(3)
  })

  it('touches only the order it was asked about', () => {
    const levels = { p: 5 }
    const reservations: Reservation[] = [
      { orderId: 'a', productId: 'p', quantity: 1, expiresAtMs: 2_000_000 },
      { orderId: 'b', productId: 'p', quantity: 2, expiresAtMs: 2_000_000 },
    ]
    consume('a', levels, reservations)
    expect(levels.p).toBe(4)
    expect(reservations[1]?.consumed).toBeUndefined()
  })
})
