import { describe, expect, it } from 'vitest'
import { CLIENT_EVENT_NAMES, SERVER_EVENT_NAMES } from './events'

/**
 * THE FIVE EVENTS STEP 13 NAMES, MAPPED TO THE FIVE THIS CODEBASE EMITS.
 *
 * The brief lists product_viewed, add_to_cart, order_placed, coupon_redeemed
 * and refund_issued. Grepping `src` for those literals on 2026-09-08 returns
 * ZERO hits for two of them, which reads exactly like two missing events and is
 * not:
 *
 *   product_viewed   -> view_product        client
 *   add_to_cart      -> add_to_cart         client   (the one exact match)
 *   order_placed     -> purchase            server
 *   coupon_redeemed  -> voucher_redeemed    server
 *   refund_issued    -> order_refunded      server
 *
 * Only one of the five names matches, so a check that greps for the brief's
 * words concludes 20% coverage on a funnel that is fully instrumented. That is
 * a live trap in this repo, not a hypothetical: docs/ENV.md records that the
 * PostHog key was once "read by a module with no callers, so setting it
 * produced no events and no error", which is the same shape of wrong answer
 * arrived at from the opposite direction.
 *
 * The mapping is written here rather than in prose so that renaming an event
 * without revisiting the brief fails a test instead of quietly re-opening the
 * question.
 */

/** brief name -> the name this codebase actually emits. */
const STEP_13_EVENTS = {
  product_viewed: 'view_product',
  add_to_cart: 'add_to_cart',
  order_placed: 'purchase',
  coupon_redeemed: 'voucher_redeemed',
  refund_issued: 'order_refunded',
} as const

const ALL_NAMES: readonly string[] = [...CLIENT_EVENT_NAMES, ...SERVER_EVENT_NAMES]

describe("STEP 13's five named events all exist", () => {
  it('maps exactly five', () => {
    expect(Object.keys(STEP_13_EVENTS)).toHaveLength(5)
  })

  it.each(Object.entries(STEP_13_EVENTS))('%s is emitted as %s', (_brief, actual) => {
    expect(ALL_NAMES).toContain(actual)
  })

  it('emits four of the five under a different name, which is why a grep misleads', () => {
    const renamed = Object.entries(STEP_13_EVENTS).filter(([brief, actual]) => brief !== actual)
    expect(renamed.map(([brief]) => brief)).toEqual([
      'product_viewed',
      'order_placed',
      'coupon_redeemed',
      'refund_issued',
    ])
  })
})

/**
 * The three money events are SERVER side, and that is a security property
 * rather than an implementation detail: a browser must not be able to assert
 * that a purchase happened.
 */
describe('the money events are server-only', () => {
  it.each(['purchase', 'voucher_redeemed', 'order_refunded'])('%s is a server event', (name) => {
    expect(SERVER_EVENT_NAMES).toContain(name)
    expect(CLIENT_EVENT_NAMES as readonly string[]).not.toContain(name)
  })
})
