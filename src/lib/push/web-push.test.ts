import { describe, expect, it } from 'vitest'
import {
  PUSH_PLAINTEXT_BUDGET_BYTES,
  classifyWebPushStatus,
  encodePushPayload,
  toPushPayload,
  vapidConfig,
} from './web-push'

/**
 * The decisions, without a push service.
 *
 * Everything here is the part with consequences: a 410 read as a retry is a
 * dead subscription that costs a round trip every run forever, and a 429 read
 * as gone is a subscription deleted because a push service was busy for a
 * minute. The encryption itself is `web-push`'s and is not this file's to
 * re-test.
 */

const CONTENT = { title: 'הקופון פג מחר', body: 'עיסוי זוגי', data: { url: '/account/coupons' } }

describe('the payload the service worker will actually parse', () => {
  it('carries the three fields public/sw.js reads', () => {
    expect(toPushPayload(CONTENT)).toEqual({
      title: 'הקופון פג מחר',
      body: 'עיסוי זוגי',
      url: '/account/coupons',
    })
  })

  it('drops a click target that is not a same-origin path', () => {
    // The worker would fall back to '/' anyway; normalising at the sending end
    // means the intent is visible on both sides rather than only enforced on
    // one of them.
    for (const url of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '']) {
      expect(toPushPayload({ ...CONTENT, data: { url } }).url).toBe('/')
    }
  })

  it('passes a tag through, so re-sends collapse instead of stacking', () => {
    const payload = toPushPayload({ ...CONTENT, data: { url: '/', tag: 'voucher:7' } })
    expect(payload.tag).toBe('voucher:7')
  })

  it('omits the tag rather than sending an empty one', () => {
    // An empty string is a valid tag and collapses EVERY notification into one.
    expect(toPushPayload({ ...CONTENT, data: { url: '/', tag: '' } })).not.toHaveProperty('tag')
  })
})

describe('the size ceiling', () => {
  it('encodes an ordinary notification', () => {
    expect(encodePushPayload(CONTENT)).toContain('הקופון פג מחר')
  })

  it('refuses an oversized one rather than truncating it', () => {
    // A lock-screen notification cut mid-sentence is worse than one that did
    // not arrive, because the customer cannot tell it was cut.
    const huge = { ...CONTENT, body: 'א'.repeat(PUSH_PLAINTEXT_BUDGET_BYTES) }
    expect(encodePushPayload(huge)).toBeNull()
  })

  it('measures BYTES and not characters, which is the whole point in Hebrew', () => {
    // Every Hebrew letter is two bytes in UTF-8. A length check would let a
    // payload twice the budget through, and the push service would answer 413.
    const body = 'א'.repeat(Math.floor(PUSH_PLAINTEXT_BUDGET_BYTES / 2) + 50)
    expect(body.length).toBeLessThan(PUSH_PLAINTEXT_BUDGET_BYTES)
    expect(encodePushPayload({ ...CONTENT, body })).toBeNull()
  })
})

describe('what a push service status means', () => {
  it.each([200, 201, 202])('treats %i as delivered', (status) => {
    expect(classifyWebPushStatus(status)).toEqual({ kind: 'sent' })
  })

  it.each([404, 410])('treats %i as gone for good', (status) => {
    // The two that cause a row to be deleted. Getting these wrong in either
    // direction is expensive: as retry, a round trip forever; as gone applied
    // to something else, a subscription deleted for a transient fault.
    expect(classifyWebPushStatus(status)).toEqual({ kind: 'gone', status })
  })

  it('retries a throttle rather than deleting the subscription', () => {
    expect(classifyWebPushStatus(429)).toMatchObject({ kind: 'retry', status: 429 })
  })

  it.each([500, 502, 503, 504])('retries %i, which is the service and not us', (status) => {
    expect(classifyWebPushStatus(status)).toMatchObject({ kind: 'retry', status })
  })

  it.each([400, 401, 403, 413])('rejects %i permanently, because it is ours', (status) => {
    // Retrying a malformed VAPID JWT or an oversized payload is a loop that
    // burns the row's five attempts and changes nothing.
    expect(classifyWebPushStatus(status)).toMatchObject({ kind: 'rejected', status })
  })
})

describe('the VAPID identity', () => {
  it('is absent unless both halves are present', () => {
    expect(vapidConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull()
    expect(
      vapidConfig({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub' } as unknown as NodeJS.ProcessEnv),
    ).toBeNull()
    expect(vapidConfig({ VAPID_PRIVATE_KEY: 'priv' } as unknown as NodeJS.ProcessEnv)).toBeNull()
  })

  it('defaults the subject rather than sending without one', () => {
    // An absent subject fails at send time with a message nobody reads.
    const config = vapidConfig({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
    } as unknown as NodeJS.ProcessEnv)
    expect(config?.subject).toMatch(/^https:\/\//)
  })

  it('prefers a configured subject', () => {
    const config = vapidConfig({
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      VAPID_SUBJECT: 'mailto:ops@kenyonexpress.co.il',
    } as unknown as NodeJS.ProcessEnv)
    expect(config?.subject).toBe('mailto:ops@kenyonexpress.co.il')
  })
})
