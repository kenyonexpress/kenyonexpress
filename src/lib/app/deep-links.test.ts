import { describe, expect, it } from 'vitest'
import {
  APP_RETURN_PATH,
  APP_SCHEME,
  appReturnDeepLink,
  appReturnUrl,
  appSchemeUrl,
  parseReturnStatus,
  universalLink,
} from './deep-links'

describe('appSchemeUrl', () => {
  it('produces a two-slash scheme URL with the path as the host segment', () => {
    expect(appSchemeUrl('/coupons/v1')).toBe('kenyonexpress://coupons/v1')
    expect(appSchemeUrl('coupons/v1')).toBe('kenyonexpress://coupons/v1')
  })

  it('encodes query values and drops empty ones', () => {
    expect(appSchemeUrl('/checkout/return', { order_id: 'a b', status: 'success' })).toBe(
      'kenyonexpress://checkout/return?order_id=a%20b&status=success',
    )
    expect(appSchemeUrl('/wallet', { ref: '', other: undefined })).toBe('kenyonexpress://wallet')
  })
})

describe('universalLink', () => {
  it('does not double the slash when the site url carries one', () => {
    expect(universalLink('https://kenyonexpress.co.il/', '/account')).toBe(
      'https://kenyonexpress.co.il/account',
    )
    expect(universalLink('https://kenyonexpress.co.il', 'account')).toBe(
      'https://kenyonexpress.co.il/account',
    )
  })
})

describe('appReturnUrl', () => {
  it('is an https url on our own origin, never the custom scheme', () => {
    // Cardcom redirects its own page here. iOS WKWebView blocks a third-party
    // page navigating to a custom scheme outright, so handing Cardcom
    // `kenyonexpress://` would strand every app payment.
    const url = appReturnUrl('https://kenyonexpress.co.il', 'order-1', 'success')
    expect(url.startsWith('https://')).toBe(true)
    expect(url).not.toContain(`${APP_SCHEME}://`)
    expect(url).toBe(
      'https://kenyonexpress.co.il/checkout/app-return?order_id=order-1&status=success',
    )
  })

  it('keeps the prefix the WebView matches on in one place', () => {
    expect(appReturnUrl('https://x.test', 'o', 'failed')).toContain(APP_RETURN_PATH)
  })
})

describe('appReturnDeepLink', () => {
  it('is the scheme link the return page bounces to', () => {
    expect(appReturnDeepLink('order-1', 'success')).toBe(
      'kenyonexpress://checkout/return?order_id=order-1&status=success',
    )
  })
})

describe('parseReturnStatus', () => {
  it('passes through the three known outcomes', () => {
    expect(parseReturnStatus('success')).toBe('success')
    expect(parseReturnStatus('failed')).toBe('failed')
    expect(parseReturnStatus('cancelled')).toBe('cancelled')
  })

  it('treats anything unrecognised as failed rather than paid', () => {
    // The redirect is cosmetic - GetLpResult decides - so the cheap mistake is
    // showing "we are checking" to someone who paid, not the reverse.
    expect(parseReturnStatus('paid')).toBe('failed')
    expect(parseReturnStatus(undefined)).toBe('failed')
    expect(parseReturnStatus(1)).toBe('failed')
  })
})
