import { CONSENT_DECISIONS } from '@/lib/analytics/consent'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/consent', () => ({ decideConsent: async () => {} }))

import ConsentBanner from './ConsentBanner'

/**
 * The banner is a Server Component with no client bundle, so what it ships
 * is what the visitor can do: refuse, accept, or choose per category, all as
 * plain forms that work before hydration.
 */
const out = renderToStaticMarkup(<ConsentBanner />)
// React's own form-replay bootstrap is inline script, not copy.
const text = out.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')

describe('<ConsentBanner>', () => {
  it('offers refusal and acceptance as equal one-click forms', () => {
    expect(out).toContain('name="decision" value="denied"')
    expect(out).toContain('name="decision" value="granted"')
    expect(text).toContain('לא תודה')
    expect(text).toContain('אישור')
  })

  it('offers a per-category choice that needs no JavaScript', () => {
    expect(out).toContain('<details')
    expect(out).toContain('name="decision" value="custom"')
    expect(out).toContain('name="analytics"')
    expect(out).toContain('name="marketing"')
    expect(text).toContain('שמירת הבחירה')
  })

  it('shows "necessary" as always on and never posts it as a choice', () => {
    const disabled = [...out.matchAll(/<input[^>]*\bdisabled\b[^>]*>/g)].map((m) => m[0])
    expect(disabled).toHaveLength(1)
    expect(disabled[0]).toMatch(/\bchecked\b/)
    expect(disabled[0]).not.toContain('name=')
  })

  it('posts only words the cookie parser accepts, plus the custom fold', () => {
    const posted = [...out.matchAll(/name="decision" value="([a-z]+)"/g)].map((m) => m[1])
    for (const word of posted) {
      expect(word === 'custom' || CONSENT_DECISIONS.includes(word as never), word).toBe(true)
    }
  })

  it('is Hebrew, with no Latin sentence a customer would read', () => {
    expect(text.replace(/Google Analytics|Meta/g, '')).not.toMatch(/[A-Za-z]{4,}/)
  })
})
