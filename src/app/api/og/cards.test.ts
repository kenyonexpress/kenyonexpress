import { describe, expect, it } from 'vitest'
import { buildCategoryCard, buildCountdown, buildDealCard, clip } from './cards'
import { parseOgRequest } from './params'
import { ogImage, ogImageUrl } from './url'

/**
 * The card generator's only testable surface, and the reason it was split out.
 *
 * Everything below decides what a 1200x630 PNG SAYS. A wrong answer here does
 * not fail a build, does not throw, and does not appear on any page: it appears
 * in somebody else's WhatsApp, beside a link they just sent. So the strings are
 * asserted and the render is not.
 */

const NOW = new Date('2026-09-01T12:00:00.000Z')
const at = (ms: number) => new Date(NOW.getTime() + ms)

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('clip', () => {
  it('leaves a string that fits alone', () => {
    expect(clip('פיצה משפחתית', 60)).toBe('פיצה משפחתית')
  })

  it('cuts on a word boundary when one is near the limit', () => {
    // Satori has no ellipsis and no line clamp: text past the edge is cropped
    // by the PNG boundary with nothing to show it was cut. The … is drawn.
    const out = clip('ארוחה זוגית מפנקת במסעדה שף', 20)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(21)
    expect(out).not.toContain('  ')
  })

  it('hard-cuts a single long token that has no boundary to cut on', () => {
    expect(clip('א'.repeat(40), 10)).toBe(`${'א'.repeat(10)}…`)
  })

  it('collapses the whitespace an admin pasted in', () => {
    expect(clip('פיצה   \n  משפחתית', 60)).toBe('פיצה משפחתית')
  })
})

describe('the category card', () => {
  it('counts the products behind the category', () => {
    expect(
      buildCategoryCard({ nameHe: 'מסעדות', description: 'תיאור', total: 48 }).countLabel,
    ).toBe('48 מוצרים')
  })

  it('says מוצר אחד rather than 1 מוצרים', () => {
    expect(buildCategoryCard({ nameHe: 'מסעדות', description: 'תיאור', total: 1 }).countLabel).toBe(
      'מוצר אחד',
    )
  })

  it('draws no pill at all for an empty category', () => {
    // A card that boasts "0 מוצרים" is worse than a card that says nothing.
    expect(buildCategoryCard({ nameHe: 'מסעדות', description: 'תיאור', total: 0 }).countLabel).toBe(
      null,
    )
  })

  it('clips a description that would be drawn past the edge of the card', () => {
    const card = buildCategoryCard({
      nameHe: 'מסעדות',
      description: 'א'.repeat(400),
      total: 3,
    })
    expect(card.description.length).toBeLessThanOrEqual(106)
  })
})

describe('the deal card', () => {
  const base = {
    titleHe: 'ארוחה זוגית',
    businessName: 'מסעדת השף',
    validUntil: null,
    now: NOW,
  }

  it('quotes the absolute platform price and the sticker it saves against', () => {
    const card = buildDealCard({
      ...base,
      originalPrice: 400,
      platformPrice: 40,
      discountPercentage: 90,
    })
    expect(card.price).toBe('₪40')
    expect(card.wasPrice).toBe('₪400')
    expect(card.balance).toBe('+ ₪360 בבית העסק')
    expect(card.discountBadge).toBe('90%-')
  })

  it('derives the percentage when the column has none, rather than assuming 90', () => {
    // `/coupons/[id]` carries the long version of this: platform_price is an
    // absolute amount an admin sets, and the hardcoded 90 that used to sit
    // beside it was a pricing model abolished on 2026-07-24. Today's seed rows
    // all happen to be a tenth of their sticker, so a wrong constant would be
    // arithmetically true and invisible until the first deal that is not.
    const card = buildDealCard({
      ...base,
      originalPrice: 200,
      platformPrice: 150,
      discountPercentage: null,
    })
    expect(card.discountBadge).toBe('25%-')
  })

  it('says nothing about money when no platform price is set', () => {
    const card = buildDealCard({
      ...base,
      originalPrice: 400,
      platformPrice: null,
      discountPercentage: 90,
    })
    expect(card.price).toBe(null)
    expect(card.wasPrice).toBe(null)
    expect(card.balance).toBe(null)
    expect(card.discountBadge).toBe(null)
  })

  it('never strikes through a sticker price that is not actually higher', () => {
    const card = buildDealCard({
      ...base,
      originalPrice: 40,
      platformPrice: 40,
      discountPercentage: null,
    })
    expect(card.wasPrice).toBe(null)
    expect(card.balance).toBe(null)
    expect(card.discountBadge).toBe(null)
  })

  it('carries no comma or dash between two Hebrew runs', () => {
    // Satori has no bidi algorithm worth relying on for neutrals: one between
    // two Hebrew runs is placed by glyph order and lands on the wrong side of
    // the word. Measured on the first render of the home card.
    const card = buildDealCard({
      ...base,
      originalPrice: 400,
      platformPrice: 40,
      discountPercentage: 90,
      validUntil: at(3 * DAY),
    })
    for (const text of [
      card.balance,
      card.countdown.label,
      ...(card.countdown.kind === 'left' ? card.countdown.parts : []),
    ]) {
      expect(text ?? '', String(text)).not.toMatch(/[,،:()]/)
    }
  })
})

describe('the deal countdown', () => {
  it('states a duration rather than a date', () => {
    const c = buildCountdown(at(3 * DAY + 4 * HOUR), NOW)
    expect(c.kind).toBe('left')
    expect(c.label).toBe('מסתיים בעוד')
    expect(c.kind === 'left' && c.parts).toEqual(['3 ימים', '4 שעות'])
  })

  it('counts one and two inside the noun, the way Hebrew does', () => {
    // יומיים is two days. "2 ימים" is what a card written in English looks like.
    expect(buildCountdown(at(2 * DAY), NOW)).toMatchObject({ parts: ['יומיים'] })
    expect(buildCountdown(at(DAY), NOW)).toMatchObject({ parts: ['יום אחד'] })
    expect(buildCountdown(at(2 * HOUR), NOW)).toMatchObject({ parts: ['שעתיים'] })
    expect(buildCountdown(at(HOUR), NOW)).toMatchObject({ parts: ['שעה אחת'] })
  })

  it('drops to hours and minutes on the last day', () => {
    expect(buildCountdown(at(5 * HOUR + 30 * MINUTE), NOW)).toMatchObject({
      parts: ['5 שעות', '30 דקות'],
    })
  })

  it('never prints more than two units', () => {
    const c = buildCountdown(at(3 * DAY + 4 * HOUR + 20 * MINUTE), NOW)
    expect(c.kind === 'left' && c.parts.length).toBe(2)
  })

  it('rounds the last seconds up to a minute rather than showing nothing', () => {
    expect(buildCountdown(at(20_000), NOW)).toMatchObject({ parts: ['דקה אחת'] })
  })

  it('says the offer ended once it has', () => {
    // A forwarded link outlives the deal. The card is what tells the recipient.
    expect(buildCountdown(at(-HOUR), NOW)).toEqual({ kind: 'ended', label: 'המבצע הסתיים' })
    expect(buildCountdown(NOW, NOW).kind).toBe('ended')
  })

  it('falls back to an honest line when the admin set no deadline', () => {
    expect(buildCountdown(null, NOW)).toEqual({ kind: 'none', label: 'מבצע לזמן מוגבל' })
    expect(buildCountdown('not a date', NOW).kind).toBe('none')
  })
})

describe('what the route accepts', () => {
  const parse = (qs: string) => parseOgRequest(new URL(`https://kenyonexpress.co.il/api/og?${qs}`))

  it('reads the four templates', () => {
    expect(parse('t=product&slug=pizza')).toEqual({ template: 'product', slug: 'pizza', id: null })
    expect(parse('t=category&slug=food')).toEqual({ template: 'category', slug: 'food', id: null })
    expect(parse('t=default')).toEqual({ template: 'default', slug: null, id: null })
  })

  it('decodes a Hebrew slug, which is what the category table actually holds', () => {
    expect(parse(`t=category&slug=${encodeURIComponent('מסעדות')}`).slug).toBe('מסעדות')
  })

  it('falls back to the default card instead of answering 400', () => {
    // A 400 renders as a broken image beside a live link in a real chat, which
    // reads as a broken site. The generic brand card is what the share would
    // have carried if the page had never asked for an image at all.
    for (const qs of ['', 't=nonsense', 't=product', 't=category&slug=', 't=deal&id=7']) {
      expect(parse(qs).template, qs).toBe('default')
    }
  })

  it('takes only a uuid for a deal, so a wild id never becomes a query', () => {
    const id = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607'
    expect(parse(`t=deal&id=${id}`)).toEqual({ template: 'deal', slug: null, id })
    expect(parse('t=deal&id=; drop table coupon_deals').template).toBe('default')
  })

  it('refuses an unbounded slug, which is a cache key the caller chooses', () => {
    expect(parse(`t=product&slug=${'a'.repeat(200)}`).template).toBe('default')
  })

  it('refuses a slug carrying control characters', () => {
    expect(parse('t=product&slug=piz%00za').template).toBe('default')
    expect(parse('t=product&slug=%E0%A4%A').template).toBe('default')
  })

  it('takes NO free text, which is the whole point', () => {
    // The obvious shape for a share-image endpoint is ?title=&price=, and it is
    // the shape that turns a branded origin into a forgery kit: a card with the
    // site's yellow, the site's logo and any price the caller likes, served
    // from kenyonexpress.co.il and indistinguishable from a real one.
    const req = parse('t=default&title=iPhone%20%E2%82%AA1&price=1&img=https://evil.example/x.png')
    expect(req).toEqual({ template: 'default', slug: null, id: null })
  })
})

describe('the URL the pages put in their metadata', () => {
  it('round-trips through the parser it is a contract with', () => {
    // The failure this guards is the one the whole route is built to avoid: a
    // mistyped parameter answers 200 with a valid PNG of the WRONG card, and
    // nothing anywhere reports it.
    const targets = [
      { template: 'product', slug: 'pizza-family' },
      { template: 'category', slug: 'מסעדות' },
      { template: 'deal', id: '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607' },
      { template: 'default' },
    ] as const

    for (const target of targets) {
      const parsed = parseOgRequest(new URL(ogImageUrl(target), 'https://kenyonexpress.co.il'))
      expect(parsed.template, JSON.stringify(target)).toBe(target.template)
      if ('slug' in target) expect(parsed.slug).toBe(target.slug)
      if ('id' in target) expect(parsed.id).toBe(target.id)
    }
  })

  it('escapes a slug that would otherwise end the query string', () => {
    const url = ogImageUrl({ template: 'category', slug: 'a&t=deal' })
    expect(parseOgRequest(new URL(url, 'https://kenyonexpress.co.il'))).toEqual({
      template: 'category',
      slug: 'a&t=deal',
      id: null,
    })
  })

  it('declares 1200x630, which is what decides a large card over a thumbnail', () => {
    // The reason the product card exists at all: WhatsApp crops a non-2:1 image
    // to a thumbnail beside the link, and an image with no declared size is
    // often shown small even when it is the right shape.
    expect(ogImage({ template: 'default' }, 'קניון אקספרס')).toEqual({
      url: '/api/og?t=default',
      width: 1200,
      height: 630,
      alt: 'קניון אקספרס',
    })
  })

  it('stays relative, so metadataBase absolutises it', () => {
    expect(ogImageUrl({ template: 'default' }).startsWith('/api/og?')).toBe(true)
  })
})
