import type { ErrorEvent } from '@sentry/nextjs'
import { describe, expect, it } from 'vitest'
import { maskIdentifiers, redactUrl, scrubSentryEvent } from './sentry-scrub'

/**
 * Every runtime's `beforeSend` is this one function, so this is the test for
 * what leaves the process in an error report. Each case is a leak that was
 * possible before the module existed, from a runtime that did not have the
 * corresponding line.
 */

function event(partial: Partial<ErrorEvent>): ErrorEvent {
  return { type: undefined, ...partial } as ErrorEvent
}

describe('redactUrl', () => {
  it('hides the voucher token in the /redeem path (SEC-SCRUB)', () => {
    expect(redactUrl('https://kenyonexpress.co.il/redeem/abc.def-GHI?x=1')).toBe(
      'https://kenyonexpress.co.il/redeem/[redacted]?x=1',
    )
  })

  it('hides credentials in the query, whichever key names them', () => {
    expect(redactUrl('/a?token=t1&code=c2&secret=s3&keep=4&access_token=a5#frag')).toBe(
      '/a?token=[redacted]&code=[redacted]&secret=[redacted]&keep=4&access_token=[redacted]#frag',
    )
  })

  it('leaves an ordinary product URL alone', () => {
    expect(redactUrl('/product/gift-card-400?variant=2')).toBe('/product/gift-card-400?variant=2')
  })
})

describe('maskIdentifiers', () => {
  it('masks emails', () => {
    expect(maskIdentifiers('user dana.levi+shop@example.co.il not found')).toBe(
      'user [email] not found',
    )
  })

  it('masks Israeli phone numbers in local and international forms', () => {
    expect(maskIdentifiers('sms to 052-123-4567 failed')).toBe('sms to [phone] failed')
    expect(maskIdentifiers('sms to 0521234567 failed')).toBe('sms to [phone] failed')
    expect(maskIdentifiers('sms to +972 52 123 4567 failed')).toBe('sms to [phone] failed')
    expect(maskIdentifiers('landline 03-6543210')).toBe('landline [phone]')
  })

  it('does not mask order numbers, timestamps or uuids', () => {
    const text = 'order 1000000234 at 1696600000000 for 3f2b1c9e-0d1a-4c7b-9e2f-1234567890ab'
    expect(maskIdentifiers(text)).toBe(text)
  })
})

describe('scrubSentryEvent', () => {
  it('drops headers and cookies wholesale and redacts the request url and query', () => {
    const out = scrubSentryEvent(
      event({
        request: {
          headers: { cookie: 'sb-x-auth-token=abc', authorization: 'Bearer y' },
          cookies: { 'sb-x-auth-token': 'abc' },
          url: 'https://kenyonexpress.co.il/redeem/TOKEN123?code=XYZ',
          query_string: 'code=XYZ&page=2',
          data: { email: 'a@b.co', cardcom_token: 'tok', note: 'call 0501234567' },
        },
      }),
    )
    expect(out.request?.headers).toEqual({})
    expect(out.request?.cookies).toEqual({})
    expect(out.request?.url).toBe('https://kenyonexpress.co.il/redeem/[redacted]?code=[redacted]')
    expect(out.request?.query_string).toBe('code=[redacted]&page=2')
    expect(out.request?.data).toEqual({
      email: 'a@b.co',
      cardcom_token: '[redacted]',
      note: 'call 0501234567',
    })
  })

  it('masks identifiers inside a string request body', () => {
    const out = scrubSentryEvent(event({ request: { data: 'email=dana@example.com' } }))
    expect(out.request?.data).toBe('email=[email]')
  })

  it('keeps only the user id, whatever the call site set', () => {
    const out = scrubSentryEvent(
      event({ user: { id: 'uuid-1', email: 'x@y.z', ip_address: '1.2.3.4', username: 'dana' } }),
    )
    expect(out.user).toEqual({ id: 'uuid-1' })
    expect(scrubSentryEvent(event({ user: { email: 'x@y.z' } })).user).toBeUndefined()
  })

  it('redacts extra and every context by key, not only the payment one', () => {
    const out = scrubSentryEvent(
      event({
        extra: { idempotency_key: 'k', order_id: 'o' },
        contexts: {
          payment: { cardcom_token: 't', order_id: 'o' },
          supabase: { service_key: 'sk', table: 'orders' },
        },
      }),
    )
    expect(out.extra).toEqual({ idempotency_key: '[redacted]', order_id: 'o' })
    expect(out.contexts?.payment).toEqual({ cardcom_token: '[redacted]', order_id: 'o' })
    expect(out.contexts?.supabase).toEqual({ service_key: '[redacted]', table: 'orders' })
  })

  it('masks the exception message and the event message', () => {
    const out = scrubSentryEvent(
      event({
        message: 'login failed for dana@example.com',
        exception: {
          values: [{ type: 'Error', value: 'no account for dana@example.com / 052-1234567' }],
        },
      }),
    )
    expect(out.message).toBe('login failed for [email]')
    expect(out.exception?.values?.[0]?.value).toBe('no account for [email] / [phone]')
  })

  it('scrubs breadcrumbs: fetch urls, console messages and data keys', () => {
    const out = scrubSentryEvent(
      event({
        breadcrumbs: [
          {
            category: 'fetch',
            data: { url: '/api/x?token=abc', method: 'GET', status_code: 200 },
          },
          { category: 'console', message: 'sent otp to 0541234567 (user a@b.co)' },
          { category: 'navigation', data: { from: '/redeem/TOK', to: '/account' } },
          { category: 'ui.click', data: { api_key: 'k' } },
        ],
      }),
    )
    expect(out.breadcrumbs?.[0]?.data).toEqual({
      url: '/api/x?token=[redacted]',
      method: 'GET',
      status_code: 200,
    })
    expect(out.breadcrumbs?.[1]?.message).toBe('sent otp to [phone] (user [email])')
    expect(out.breadcrumbs?.[2]?.data).toEqual({ from: '/redeem/[redacted]', to: '/account' })
    expect(out.breadcrumbs?.[3]?.data).toEqual({ api_key: '[redacted]' })
  })

  it('never drops the event', () => {
    expect(scrubSentryEvent(event({}))).toBeTruthy()
  })
})
