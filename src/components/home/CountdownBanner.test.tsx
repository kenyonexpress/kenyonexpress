import CountdownBanner from '@/components/home/CountdownBanner'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

/**
 * The server-rendered half of the countdown, which is the half that ships in
 * the prerendered home page.
 *
 * WHAT IS BEING PROTECTED: the first paint must not contain a computed
 * remaining time. Rendering one on the server is a hydration mismatch by
 * construction - the server's number is stale before the browser reads it - and
 * on the LCP page a mismatch is a re-render of the whole subtree.
 */
describe('CountdownBanner, server render', () => {
  const html = (props: Parameters<typeof CountdownBanner>[0]) =>
    renderToStaticMarkup(<CountdownBanner {...props} />)

  it('paints the deadline, not the digits', () => {
    const out = html({
      title: 'סוף העונה',
      subtitle: null,
      deadline: '2026-12-31T21:00:00+02:00',
    })
    expect(out).toContain('סוף העונה')
    // A duration would look like `12:34:56`. What is here is a printed date.
    expect(out).not.toMatch(/\d{2}:\d{2}:\d{2}/)
  })

  it('renders nothing at all for a deadline that is not a date', () => {
    expect(html({ title: 'x', subtitle: null, deadline: 'not-a-date' })).toBe('')
  })

  it('renders the banner before the first tick even when the deadline has passed', () => {
    // Deliberate: the browser decides. Rendering nothing on the server for a
    // passed deadline and then nothing on the client is the same result, but
    // rendering nothing on the server for a deadline that passed in a DIFFERENT
    // time zone would remove a live banner from a prerendered page.
    expect(html({ title: 'ישן', subtitle: null, deadline: '2020-01-01T00:00:00Z' })).toContain(
      'ישן',
    )
  })

  it('writes the digits left to right, the way a price and a phone number are', () => {
    expect(html({ title: 'x', subtitle: null, deadline: '2026-12-31T21:00:00+02:00' })).toContain(
      'dir="ltr"',
    )
  })

  it('renders a call to action only when a link is configured', () => {
    const without = html({ title: 'x', subtitle: null, deadline: '2026-12-31T21:00:00+02:00' })
    expect(without).not.toContain('<a')
    const withLink = html({
      title: 'x',
      subtitle: null,
      deadline: '2026-12-31T21:00:00+02:00',
      linkUrl: '/products',
      ctaLabel: 'לדילים',
    })
    expect(withLink).toContain('href="/products"')
    expect(withLink).toContain('לדילים')
  })
})
