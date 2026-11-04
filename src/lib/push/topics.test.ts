import { REQUIRED_KINDS } from '@/lib/notifications/preferences'
import { describe, expect, it } from 'vitest'
import { PUSH_TOPICS, normalizeTopics, subscriptionWantsKind, topicForKind } from './topics'

/**
 * The kind -> topic map, and the three rules the sender relies on: required
 * kinds have no topic, a row with no topics (pre-259) gets everything, and
 * client input is either a clean list of known topics or refused.
 */

describe('topicForKind', () => {
  it('puts the expiry reminder and the post-expiry credit under expiry', () => {
    expect(topicForKind('voucher_expiring')).toBe('expiry')
    expect(topicForKind('voucher_expiry_credited')).toBe('expiry')
  })

  it('puts the order lifecycle under order_updates', () => {
    for (const kind of [
      'order_shipped',
      'voucher_redeemed',
      'cashback_credited',
      'invoice_ready',
    ]) {
      expect(topicForKind(kind)).toBe('order_updates')
    }
  })

  it('gives no required kind a topic, so no box can silence a receipt', () => {
    for (const kind of REQUIRED_KINDS) expect(topicForKind(kind)).toBeNull()
  })

  it('leaves the security alert untopical', () => {
    expect(topicForKind('security_alert')).toBeNull()
  })
})

describe('subscriptionWantsKind', () => {
  it('follows the topics a browser chose', () => {
    expect(subscriptionWantsKind('voucher_expiring', ['expiry'])).toBe(true)
    expect(subscriptionWantsKind('voucher_expiring', ['order_updates'])).toBe(false)
    expect(subscriptionWantsKind('order_shipped', [])).toBe(false)
  })

  it('sends a required kind to a browser with no topics at all', () => {
    expect(subscriptionWantsKind('order_paid', [])).toBe(true)
    expect(subscriptionWantsKind('refund_completed', [])).toBe(true)
  })

  it('treats a row without the column as subscribed to everything', () => {
    expect(subscriptionWantsKind('voucher_expiring', undefined)).toBe(true)
    expect(subscriptionWantsKind('order_shipped', null)).toBe(true)
  })
})

describe('normalizeTopics', () => {
  it('defaults an absent choice to both topics', () => {
    expect(normalizeTopics(undefined)).toEqual([...PUSH_TOPICS])
  })

  it('de-duplicates and orders a valid choice', () => {
    expect(normalizeTopics(['expiry', 'order_updates', 'expiry'])).toEqual([
      'order_updates',
      'expiry',
    ])
    expect(normalizeTopics([])).toEqual([])
  })

  it('refuses unknown topics and non-arrays rather than guessing', () => {
    expect(normalizeTopics(['marketing'])).toBeNull()
    expect(normalizeTopics('expiry')).toBeNull()
    expect(normalizeTopics(null)).toBeNull()
    expect(normalizeTopics(new Array(50).fill('expiry'))).toBeNull()
  })
})
