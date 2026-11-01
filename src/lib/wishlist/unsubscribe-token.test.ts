import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  canSignUnsubscribeTokens,
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from './unsubscribe-token'

const USER = '11111111-2222-3333-4444-555555555555'

describe('the signed wishlist unsubscribe token', () => {
  const previousDedicated = process.env.WISHLIST_UNSUB_SECRET
  const previousCron = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.WISHLIST_UNSUB_SECRET = 'a-test-secret-of-adequate-length'
    Reflect.deleteProperty(process.env, 'CRON_SECRET')
  })

  afterEach(() => {
    if (previousDedicated === undefined)
      Reflect.deleteProperty(process.env, 'WISHLIST_UNSUB_SECRET')
    else process.env.WISHLIST_UNSUB_SECRET = previousDedicated
    if (previousCron === undefined) Reflect.deleteProperty(process.env, 'CRON_SECRET')
    else process.env.CRON_SECRET = previousCron
  })

  it('round-trips the user and the scope', () => {
    const token = createUnsubscribeToken(USER, 'digest')
    expect(token).not.toBeNull()
    expect(verifyUnsubscribeToken(token)).toEqual({ userId: USER, scope: 'digest' })
  })

  it('refuses a token whose signature was tampered with', () => {
    const token = createUnsubscribeToken(USER, 'all')
    expect(token).not.toBeNull()
    const parts = (token as string).split('.')
    const sig = parts[3] as string
    parts[3] = sig.startsWith('A') ? `B${sig.slice(1)}` : `A${sig.slice(1)}`
    expect(verifyUnsubscribeToken(parts.join('.'))).toBeNull()
  })

  it('refuses a token whose scope was widened after signing', () => {
    // The attack that matters: a "digest" link edited to turn everything off.
    const token = createUnsubscribeToken(USER, 'digest') as string
    const widened = token.replace('.digest.', '.all.')
    expect(verifyUnsubscribeToken(widened)).toBeNull()
  })

  it('refuses an expired token but honours one inside its window', () => {
    const token = createUnsubscribeToken(USER, 'alerts', new Date('2026-01-01T00:00:00Z'))
    expect(verifyUnsubscribeToken(token, new Date('2026-06-01T00:00:00Z'))).not.toBeNull()
    expect(verifyUnsubscribeToken(token, new Date('2026-08-01T00:00:00Z'))).toBeNull()
  })

  it('refuses junk without computing anything', () => {
    for (const junk of ['', 'a', 'not.a.token', `${USER}.alerts.123`, `${'x'.repeat(300)}`]) {
      expect(verifyUnsubscribeToken(junk)).toBeNull()
    }
  })

  it('falls back to a key derived from CRON_SECRET, and the two keys differ', () => {
    const dedicated = createUnsubscribeToken(USER, 'all') as string

    Reflect.deleteProperty(process.env, 'WISHLIST_UNSUB_SECRET')
    process.env.CRON_SECRET = 'the-cron-bearer-secret'
    expect(canSignUnsubscribeTokens()).toBe(true)
    const derived = createUnsubscribeToken(USER, 'all') as string

    // A token signed under one key must not verify under the other.
    expect(verifyUnsubscribeToken(dedicated)).toBeNull()
    expect(verifyUnsubscribeToken(derived)).not.toBeNull()
  })

  it('signs nothing when no secret exists, rather than signing weakly', () => {
    Reflect.deleteProperty(process.env, 'WISHLIST_UNSUB_SECRET')
    Reflect.deleteProperty(process.env, 'CRON_SECRET')
    expect(canSignUnsubscribeTokens()).toBe(false)
    expect(createUnsubscribeToken(USER, 'all')).toBeNull()
    expect(verifyUnsubscribeToken(`${USER}.all.99999999999.AAAA`)).toBeNull()
  })
})
