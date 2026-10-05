import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SERVER_EVENT_NAMES } from './events'
import {
  POSTHOG_FUNNEL_EVENTS,
  POSTHOG_GIFT_SENT,
  POSTHOG_IDENTIFY,
  postHogEventName,
} from './posthog-names'

/**
 * Every name the PostHog funnel is built on has an emitter, and the emitters
 * go through the one table.
 *
 * The failure this guards is the one measured on 2026-10-05: six names in the
 * brief, two of them (`view_product`, `coupon_redeemed`) never sent under
 * those names, with nothing red anywhere because the events were being sent,
 * just as `view_item` and `voucher_redeemed`. A dashboard built on the brief
 * showed zero and looked like a traffic problem.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('the PostHog name table', () => {
  it("renames GA4's view_item to the funnel's view_product", () => {
    expect(postHogEventName('view_item')).toBe('view_product')
  })

  it("renames the whitelist's voucher_redeemed to the funnel's coupon_redeemed", () => {
    expect(postHogEventName('voucher_redeemed')).toBe('coupon_redeemed')
  })

  it('passes every other name through unchanged', () => {
    for (const name of [
      'add_to_cart',
      'begin_checkout',
      'purchase',
      'order_refunded',
      '$pageview',
    ]) {
      expect(postHogEventName(name)).toBe(name)
    }
  })

  it('reaches all six funnel names from the names the emitters use', () => {
    const sent = new Set<string>([
      // The browser fan-out, `trackCommerce(name)` for each GaEventName in use.
      ...['view_item', 'add_to_cart', 'begin_checkout'].map(postHogEventName),
      // The server fan-out, one per SERVER_EVENT_NAMES.
      ...SERVER_EVENT_NAMES.map(postHogEventName),
      POSTHOG_GIFT_SENT,
    ])
    for (const name of POSTHOG_FUNNEL_EVENTS) expect(sent.has(name)).toBe(true)
  })

  it('is the only way a name reaches PostHog from either fan-out', () => {
    const client = read('src/lib/analytics/commerce-client.ts')
    const server = read('src/server/analytics/track.ts')
    expect(client).toMatch(/trackEvent\(postHogEventName\(name\)/)
    expect(server).toMatch(/trackEvent\(postHogEventName\(input\.eventName\)/)
    expect(server).toMatch(/trackEvent\(\s*postHogEventName\(eventName\)/)
  })

  it('has an emitter for gift_sent on both gift paths and an identify on every login path', () => {
    expect(read('src/server/actions/gifts.ts')).toContain('POSTHOG_GIFT_SENT')
    expect(read('src/server/payments/finalize.ts')).toContain('POSTHOG_GIFT_SENT')
    for (const path of ['src/server/actions/auth.ts', 'src/app/auth/callback/route.ts']) {
      expect(read(path)).toContain('identifyPostHogUser(')
    }
    expect(read('src/server/actions/auth.ts').match(/identifyPostHogUser\(/g)?.length).toBe(2)
    expect(POSTHOG_IDENTIFY).toBe('$identify')
  })
})
