import type { SupplierStorefront } from '@/lib/supplier-storefront'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SupplierStorefrontHeader from './SupplierStorefrontHeader'

/**
 * The regression this file exists for is not a crash: it is a page that quietly
 * renders less than it fetched.
 *
 * `loadSupplierStorefront` already selected `logo_url` and `contact_phone`, and
 * `SupplierStorefront` already carried both, and the header printed neither.
 * Nothing failed, nothing was undefined, and the page looked finished. Measured
 * against production on 2026-09-09: of 12 suppliers, 6 have a phone, 6 a
 * WhatsApp number, 1 a logo and 0 an address -- so the single field the page
 * did render was the only one nobody had filled.
 *
 * Rendered as server markup because that is what it is: no client state.
 */

const BASE: SupplierStorefront = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'ספא כרמל',
  city: 'חיפה',
  logoUrl: null,
  address: null,
  contactPhone: null,
  whatsapp: null,
}

function render(overrides: Partial<SupplierStorefront> = {}): string {
  return renderToStaticMarkup(<SupplierStorefrontHeader supplier={{ ...BASE, ...overrides }} />)
}

describe('SupplierStorefrontHeader', () => {
  it('renders the phone the loader had all along', () => {
    const html = render({ contactPhone: '04-7654321' })
    expect(html).toContain('04-7654321')
    expect(html).toContain('tel:+9724765432')
  })

  it('renders a WhatsApp link, which is the field that gets answered here', () => {
    const html = render({ whatsapp: '0524635550' })
    expect(html).toContain('wa.me/972524635550')
  })

  it('does not build the wa.me link by stripping non-digits', () => {
    // `wa.me/0524635550` is not a dead link, it is WhatsApp's "the number
    // shared via link is not on WhatsApp" screen. The shared helper normalises
    // to international digits first; this asserts the leading zero is gone.
    expect(render({ whatsapp: '052-463-5550' })).not.toContain('wa.me/052')
  })

  it('renders the logo when there is one', () => {
    const html = render({ logoUrl: '/images/logo.webp' })
    expect(html).toContain('logo.webp')
  })

  it('drops a logo on a host next.config does not list, instead of throwing', () => {
    // An unlisted remote host is a render-time throw in next/image, and a
    // supplier logo pasted in by an operator is exactly where one arrives.
    const html = render({ logoUrl: 'https://not-configured.example/logo.png' })
    expect(html).not.toContain('not-configured.example')
    expect(html).toContain('ספא כרמל')
  })

  it('renders nothing for a field that is empty, rather than an empty row', () => {
    const html = render()
    expect(html).toContain('ספא כרמל')
    expect(html).not.toContain('tel:')
    expect(html).not.toContain('wa.me')
    expect(html).not.toContain('<img')
  })

  it('links the address to Waze when there is one, and omits the line when there is not', () => {
    // Zero suppliers have an address today, which is why the unconditional line
    // this replaced printed nothing on every page.
    expect(render({ address: 'הרצל 12' })).toContain('waze.com')
    expect(render()).not.toContain('waze.com')
  })
})
