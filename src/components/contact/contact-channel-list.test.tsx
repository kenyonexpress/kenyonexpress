import { DEFAULT_CONTACT_CHANNELS, topicsFor } from '@/lib/contact/channels'
import { t } from '@/lib/i18n/messages'
import { PUBLISHED_STORE_WHATSAPP } from '@/lib/whatsapp'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ContactChannelList from './ContactChannelList'

/**
 * S34: /contact shows every channel, each as its own wa.me link. Server render
 * only: the hrefs come from `topicsFor`, exactly as the page computes them.
 */
describe('the contact channel list', () => {
  const topics = topicsFor(DEFAULT_CONTACT_CHANNELS, PUBLISHED_STORE_WHATSAPP)
  const html = renderToStaticMarkup(<ContactChannelList channels={topics} />)
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) =>
    (m[1] ?? '').replace(/&amp;/g, '&'),
  )

  it('renders the five channels, in operator order, all visible at once', () => {
    const keys = [...html.matchAll(/data-channel="([^"]+)"/g)].map((m) => m[1])
    expect(keys).toEqual([
      'customer_service',
      'suggestions',
      'business_partnerships',
      'site_problem',
      'supplier_join',
    ])
    expect(html).not.toContain('<select')
    for (const channel of DEFAULT_CONTACT_CHANNELS) expect(html).toContain(channel.labelHe)
  })

  it('makes each card a wa.me link to the store number, prefilled with its own opener', () => {
    expect(hrefs).toHaveLength(5)
    hrefs.forEach((href, index) => {
      const url = new URL(href)
      expect(url.origin).toBe('https://wa.me')
      expect(url.pathname).toBe(`/${PUBLISHED_STORE_WHATSAPP}`)
      expect(url.searchParams.get('text')).toBe(DEFAULT_CONTACT_CHANNELS[index]?.messageHe)
    })
    expect(new Set(hrefs).size).toBe(5)
  })

  it('opens in a new tab without handing the opener to the chat page', () => {
    expect(html.match(/target="_blank"/g)).toHaveLength(5)
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(5)
  })

  it('says in one line what each channel is for', () => {
    for (const key of [
      'contact.hintCustomerService',
      'contact.hintSuggestions',
      'contact.hintPartnerships',
      'contact.hintSiteProblem',
      'contact.hintSupplierJoin',
    ] as const) {
      expect(html).toContain(t(key))
    }
  })

  it('renders a channel it has no line for, and nothing for an empty list', () => {
    const extra = renderToStaticMarkup(
      <ContactChannelList
        channels={[{ key: 'press', label: 'עיתונות', href: 'https://wa.me/972524635550?text=x' }]}
      />,
    )
    expect(extra).toContain('עיתונות')
    expect(extra).toContain('data-channel="press"')
    expect(renderToStaticMarkup(<ContactChannelList channels={[]} />)).toBe('')
  })
})
