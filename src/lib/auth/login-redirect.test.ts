import { describe, expect, it } from 'vitest'
import { loginRedirectUrl } from './login-redirect'
import { safeNextPath } from './safe-next'

const at = (href: string) => loginRedirectUrl(new URL(href, 'https://kenyonexpress.co.il'))

describe('loginRedirectUrl', () => {
  it('carries the query into next, which is where the order id lived', () => {
    // The measured failure: this page is `if (!orderId) notFound()`, so losing
    // the parameter turned a receipt into a 404 for someone who had just paid.
    const url = at('/checkout/return?order_id=3f6b8c1e-0000-4000-8000-000000000000')
    expect(url.pathname).toBe('/login')
    expect(url.searchParams.get('next')).toBe(
      '/checkout/return?order_id=3f6b8c1e-0000-4000-8000-000000000000',
    )
  })

  it('does not spill the original query onto /login as loose parameters', () => {
    // `nextUrl.clone()` did, and they meant nothing there but were logged.
    const url = at('/checkout/return?order_id=abc')
    expect(url.searchParams.get('order_id')).toBeNull()
    expect([...url.searchParams.keys()]).toEqual(['next'])
  })

  it('keeps every parameter, not just the first', () => {
    const url = at('/account/orders?page=3&sort=newest')
    expect(url.searchParams.get('next')).toBe('/account/orders?page=3&sort=newest')
  })

  it('leaves a bare path bare', () => {
    expect(at('/account').searchParams.get('next')).toBe('/account')
  })

  it('does not double an existing next parameter', () => {
    // A protected route may itself have been reached with `?next=`; that value
    // belongs inside the new one, not beside it.
    const url = at('/account?next=/somewhere')
    expect([...url.searchParams.keys()]).toEqual(['next'])
    expect(url.searchParams.get('next')).toBe('/account?next=/somewhere')
  })

  it('produces something safeNextPath will hand back unchanged', () => {
    // The gate on the other end. A path with a query is a plain same-site path
    // and passes; this pins the two halves together so a tightening of one
    // cannot silently start collapsing every redirect here to '/'.
    for (const href of [
      '/checkout/return?order_id=abc',
      '/account/orders?page=3&sort=newest',
      '/coupon/3f6b8c1e-0000-4000-8000-000000000000',
      '/supplier/scan?tab=history',
    ]) {
      const next = at(href).searchParams.get('next') ?? ''
      expect(safeNextPath(next), href).toBe(next)
    }
  })

  it('cannot be talked into an off-site login page', () => {
    // The URL is built from the request's own origin, so a Host-header game
    // changes where the visitor came from, not where /login is relative to it.
    const url = loginRedirectUrl(new URL('https://evil.example/account?x=1'))
    expect(url.origin).toBe('https://evil.example')
    expect(url.pathname).toBe('/login')
  })
})
