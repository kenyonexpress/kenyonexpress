import { describe, expect, it } from 'vitest'
import { browserSubscriptionSchema } from './browser-subscription'

const valid = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
}

describe('browserSubscriptionSchema', () => {
  it('accepts what a browser hands over', () => {
    expect(browserSubscriptionSchema.safeParse(valid).success).toBe(true)
  })

  it('refuses an http endpoint and malformed keys', () => {
    expect(
      browserSubscriptionSchema.safeParse({ ...valid, endpoint: 'http://push.example/x' }).success,
    ).toBe(false)
    expect(
      browserSubscriptionSchema.safeParse({ ...valid, keys: { p256dh: 'x', auth: '!' } }).success,
    ).toBe(false)
  })
})
