import { CANONICAL_PATH, LEGAL_DOCS } from '@/app/(legal)/_content'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CheckoutConsentText, { CheckoutPrivacyNote } from './CheckoutConsentText'

/**
 * Gate LP5 (docs/ARCHITECTURE-LEGAL-PAGES.md): the checkout tickbox links the
 * current terms. Held here as "links every legal document, at its canonical
 * path, in a new tab", so a sixth document or a moved path cannot leave the
 * consent sentence pointing at nothing.
 */
describe('CheckoutConsentText', () => {
  it('links all five legal documents at their canonical paths', () => {
    const { container } = render(<CheckoutConsentText />)
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(LEGAL_DOCS.map((doc) => CANONICAL_PATH[doc.slug]))
    expect(hrefs).toContain('/cookies')
    expect(hrefs).toContain('/terms-and-conditions')
  })

  it('opens each document in a new tab without leaking the opener', () => {
    const { container } = render(<CheckoutConsentText />)
    for (const a of container.querySelectorAll('a')) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
    }
  })

  it('reads as one Hebrew sentence with the last item joined by ו', () => {
    const { container } = render(<CheckoutConsentText />)
    const text = container.textContent ?? ''
    expect(text).toContain('קראתי ואני מסכים/ה לתקנון, למדיניות הפרטיות')
    expect(text).toMatch(/למדיניות העוגיות ולהצהרת הנגישות$/)
  })

  it('links the privacy policy from the privacy note', () => {
    const { container } = render(<CheckoutPrivacyNote />)
    expect(container.querySelector('a')?.getAttribute('href')).toBe(CANONICAL_PATH.privacy)
    expect(container.textContent).toContain('מדיניות הפרטיות.')
  })
})
