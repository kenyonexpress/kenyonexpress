import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieGet = vi.hoisted(() => vi.fn())
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }))
vi.mock('@/server/actions/consent', () => ({ decideConsent: async () => {} }))

import ConsentSettings, { summarizeConsent } from './ConsentSettings'

/**
 * Withdrawal must be as easy as consent: one click, from the account, with
 * the current state spelled out per category. The component reads the
 * banner's cookie, pre-ticks exactly the categories that are on, and keeps a
 * one-click "withdraw everything" for anyone who has anything on.
 */

async function html(): Promise<string> {
  return renderToStaticMarkup(await ConsentSettings())
}

/** `defaultChecked` renders as a bare `checked` attribute in static markup. */
function checked(out: string, category: string): boolean {
  const match = out.match(new RegExp(`<input[^>]*name="${category}"[^>]*>`))
  if (!match) throw new Error(`no checkbox for ${category}`)
  return / checked(?:=""|\s|\/|>)/.test(match[0])
}

describe('summarizeConsent', () => {
  it('reads the banner cookie, including the two partial words', () => {
    expect(summarizeConsent('granted.2')).toBe('granted')
    expect(summarizeConsent('denied.2')).toBe('denied')
    expect(summarizeConsent('analytics.2')).toBe('partial')
    expect(summarizeConsent('marketing.2')).toBe('partial')
  })

  it('treats no cookie, a broken one, or stale wording as undecided', () => {
    expect(summarizeConsent(undefined)).toBe('undecided')
    expect(summarizeConsent('')).toBe('undecided')
    expect(summarizeConsent('maybe.2')).toBe('undecided')
    expect(summarizeConsent('granted.1')).toBe('undecided')
  })
})

describe('<ConsentSettings>', () => {
  beforeEach(() => {
    cookieGet.mockReset()
  })

  it('pre-ticks both boxes and offers withdrawal to someone who consented to all', async () => {
    cookieGet.mockReturnValue({ value: 'granted.2' })
    const out = await html()
    expect(out).toContain('data-consent-summary="granted"')
    expect(checked(out, 'analytics')).toBe(true)
    expect(checked(out, 'marketing')).toBe(true)
    expect(out).toContain('name="decision" value="denied"')
    expect(out).toContain('ביטול ההסכמה כולה')
  })

  it('pre-ticks only the category that is on, and still offers full withdrawal', async () => {
    cookieGet.mockReturnValue({ value: 'analytics.2' })
    const out = await html()
    expect(out).toContain('data-consent-summary="partial"')
    expect(checked(out, 'analytics')).toBe(true)
    expect(checked(out, 'marketing')).toBe(false)
    expect(out).toContain('name="decision" value="denied"')
  })

  it('ticks nothing and hides the withdraw button for someone who declined', async () => {
    cookieGet.mockReturnValue({ value: 'denied.2' })
    const out = await html()
    expect(out).toContain('data-consent-summary="denied"')
    expect(checked(out, 'analytics')).toBe(false)
    expect(checked(out, 'marketing')).toBe(false)
    expect(out).not.toContain('name="decision" value="denied"')
  })

  it('posts through the custom decision so the cookie keeps one writer and one format', async () => {
    cookieGet.mockReturnValue(undefined)
    const out = await html()
    expect(out).toContain('data-consent-summary="undecided"')
    expect(out).toContain('name="decision" value="custom"')
    expect(checked(out, 'analytics')).toBe(false)
    expect(checked(out, 'marketing')).toBe(false)
  })

  it('is Hebrew, with no Latin sentence a customer would read', async () => {
    cookieGet.mockReturnValue({ value: 'granted.2' })
    // React's own form-replay bootstrap is inline script, not copy.
    const text = (await html()).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
    // Brand names are the only Latin allowed.
    expect(text.replace(/Google Analytics|Meta/g, '')).not.toMatch(/[A-Za-z]{4,}/)
  })
})
