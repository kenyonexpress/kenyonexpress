import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/server/actions/help', () => ({ submitHelpRequest: async () => ({ ok: false }) }))

import HelpPage from '@/app/(store)/help/page'
import { HELP_TOPICS, groupFaqByTopic } from '@/content/help/topics'
import { faqEntries } from '@/content/legal/faq'
import { PUBLISHED_STORE_WHATSAPP } from '@/lib/whatsapp'
import HelpForm from './HelpForm'
import OrderHelpCard from './OrderHelpCard'
import WhatsAppSupportButton from './WhatsAppSupportButton'

const FULL = '6f1e2d3c-4b5a-4c6d-8e9f-0a1b2c3d4e5f'

describe('/help page', () => {
  const html = renderToStaticMarkup(<HelpPage />)

  it('renders every FAQ answer under its shelf, with an anchor per shelf', () => {
    // React escapes the straight quotes some answers carry.
    const asHtml = (text: string) => text.replaceAll('"', '&quot;')
    for (const entry of faqEntries) {
      expect(html).toContain(asHtml(entry.question))
      expect(html).toContain(asHtml(entry.answer))
    }
    for (const shelf of groupFaqByTopic(faqEntries)) {
      expect(html).toContain(`id="topic-${shelf.topic.id}"`)
      expect(html).toContain(`href="#topic-${shelf.topic.id}"`)
    }
  })

  it('does not render a heading for a shelf with no answers', () => {
    const empty = HELP_TOPICS.filter(
      (t) => !groupFaqByTopic(faqEntries).some((s) => s.topic.id === t.id),
    )
    expect(empty.map((t) => t.id)).toContain('other')
    for (const topic of empty) expect(html).not.toContain(`id="topic-${topic.id}"`)
  })

  it('offers WhatsApp and the email address above the fold, and links the full FAQ', () => {
    expect(html).toContain('data-testid="whatsapp-support"')
    expect(html).toContain(`https://wa.me/${PUBLISHED_STORE_WHATSAPP}?text=`)
    expect(html).toContain('href="mailto:info@kenyonexpress.co.il"')
    expect(html).toContain('href="/faq"')
    expect(html).toContain('href="/legal/returns"')
  })

  it('carries no FAQPage structured data, which stays on /faq alone', () => {
    expect(html).not.toContain('application/ld+json')
  })
})

describe('WhatsAppSupportButton', () => {
  it('dials the store number and prints the same number in local form', () => {
    const html = renderToStaticMarkup(<WhatsAppSupportButton />)
    expect(html).toContain(`https://wa.me/${PUBLISHED_STORE_WHATSAPP}?text=`)
    expect(html).toContain('052-463-5550')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})

describe('OrderHelpCard', () => {
  it('names the order the way the site does and links its pages', () => {
    const html = renderToStaticMarkup(<OrderHelpCard orderRef={FULL} />)
    expect(html).toContain('6F1E2D3C')
    expect(html).toContain(`href="/account/orders/${FULL}"`)
    expect(html).toContain(`href="/account/orders/${FULL}/receipt"`)
    expect(html).toContain(`href="/account/return/${FULL}"`)
    expect(html).toContain('wa.me')
  })
})

describe('HelpForm', () => {
  it('pre-selects the topic and pre-fills the order reference from the deep link', () => {
    const html = renderToStaticMarkup(<HelpForm defaultTopic="refunds" defaultOrderRef={FULL} />)
    expect(html).toMatch(
      /<option[^>]*selected[^>]*value="refunds"|<option[^>]*value="refunds"[^>]*selected/,
    )
    expect(html).toContain(`value="${FULL}"`)
    for (const topic of HELP_TOPICS) expect(html).toContain(`value="${topic.id}"`)
  })

  it('defaults to the "other" shelf with an empty order field, and keeps the honeypot', () => {
    const html = renderToStaticMarkup(<HelpForm />)
    expect(html).toMatch(
      /<option[^>]*selected[^>]*value="other"|<option[^>]*value="other"[^>]*selected/,
    )
    expect(html).toContain('name="orderRef"')
    expect(html).toContain('name="company"')
    expect(html).toContain('honeypot-offscreen')
  })
})
