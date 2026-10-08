import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { AUTHORED_LANDING_PAGES } from '@/lib/landing/authored'
import type { LandingBlock } from '@/lib/landing/blocks'
import { landingCampaignParams } from '@/lib/landing/campaign-links'
import LandingBlocks from './LandingBlocks'

// The products block is an async server component over the catalogue; the
// static renderer cannot await it, and what it paints is the home page's
// card, tested there. Here it is a marker.
vi.mock('./LandingProducts', () => ({
  default: ({ slugs }: { slugs: string[] }) => (
    <section data-block="products" data-count={slugs.length} />
  ),
}))

const welcome = AUTHORED_LANDING_PAGES[0]
if (!welcome) throw new Error('no authored landing page')

describe('LandingBlocks', () => {
  const campaign = landingCampaignParams(welcome, 'control', null)
  const html = renderToStaticMarkup(<LandingBlocks blocks={welcome.blocks} campaign={campaign} />)

  it('renders every authored block in order', () => {
    const kinds = welcome.blocks.map((block) => block.kind)
    let cursor = 0
    for (const kind of kinds) {
      const pos = html.indexOf(`data-block="${kind}"`, cursor)
      expect(pos, kind).toBeGreaterThan(-1)
      cursor = pos + 1
    }
  })

  it('paints the hero headline as the page h1', () => {
    const hero = welcome.blocks.find((block) => block.kind === 'hero')
    expect(hero?.kind).toBe('hero')
    if (hero?.kind === 'hero') expect(html).toContain(`<h1 class="`)
    if (hero?.kind === 'hero') expect(html).toContain(hero.headline)
  })

  it('stamps the campaign on the hero CTA and the closing CTA', () => {
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    expect(hrefs.length).toBeGreaterThanOrEqual(2)
    for (const href of hrefs) {
      expect(href).toContain('utm_source=landing')
      expect(href).toContain(`utm_campaign=${welcome.campaign}`)
      expect(href).toContain('utm_content=control')
    }
  })

  it('renders the countdown shaped but blank, the faq as a definition list, the benefits as a list', () => {
    const blocks: LandingBlock[] = [
      { kind: 'countdown', label: 'המבצע מסתיים בעוד', endsAt: '2099-01-01T00:00:00Z' },
      { kind: 'faq', items: [{ question: 'ש?', answer: 'ת.' }] },
      { kind: 'benefits', items: [{ title: 'א', text: 'ב' }] },
    ]
    const out = renderToStaticMarkup(<LandingBlocks blocks={blocks} campaign={{}} />)
    expect(out).toContain('--:--:--')
    expect(out).toContain('<dt')
    expect(out).toContain('<li')
    expect(out).toContain('ש?')
  })
})
