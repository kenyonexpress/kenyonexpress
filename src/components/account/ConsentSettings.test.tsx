import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieGet = vi.hoisted(() => vi.fn())
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }))
vi.mock('@/server/actions/consent', () => ({ decideConsent: async () => {} }))

import ConsentSettings, { summarizeConsent } from './ConsentSettings'

/**
 * Withdrawal must be as easy as consent: one click, from the account, with
 * the current state spelled out. The component reads the banner's cookie
 * and offers exactly the decision the visitor has not made.
 */

async function html(): Promise<string> {
  return renderToStaticMarkup(await ConsentSettings())
}

describe('summarizeConsent', () => {
  it('reads the banner cookie', () => {
    expect(summarizeConsent('granted.2')).toBe('granted')
    expect(summarizeConsent('denied.2')).toBe('denied')
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

  it('offers withdrawal, and only withdrawal, to someone who consented', async () => {
    cookieGet.mockReturnValue({ value: 'granted.2' })
    const out = await html()
    expect(out).toContain('data-consent-summary="granted"')
    expect(out).toContain('name="decision" value="denied"')
    expect(out).not.toContain('name="decision" value="granted"')
    expect(out).toContain('ביטול ההסכמה')
  })

  it('offers consent, and only consent, to someone who declined', async () => {
    cookieGet.mockReturnValue({ value: 'denied.2' })
    const out = await html()
    expect(out).toContain('data-consent-summary="denied"')
    expect(out).toContain('name="decision" value="granted"')
    expect(out).not.toContain('name="decision" value="denied"')
  })

  it('offers both to someone who has not decided', async () => {
    cookieGet.mockReturnValue(undefined)
    const out = await html()
    expect(out).toContain('data-consent-summary="undecided"')
    expect(out).toContain('name="decision" value="granted"')
    expect(out).toContain('name="decision" value="denied"')
  })

  it('is Hebrew, with no Latin sentence a customer would read', async () => {
    cookieGet.mockReturnValue({ value: 'granted.2' })
    // React's own form-replay bootstrap is inline script, not copy.
    const text = (await html()).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
    // Brand names are the only Latin allowed.
    expect(text.replace(/Google Analytics|Meta/g, '')).not.toMatch(/[A-Za-z]{4,}/)
  })
})
