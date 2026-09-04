import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * COMPONENTS 06-12 OF `docs/COMPONENT-QUEUE.md`, AND WHY MOST OF THEM ARE NOT
 * THE BLOCKS THE QUEUE NAMED.
 *
 * The queue's rows were derived from Electro's homepage template, on the rule
 * that "the live site wins on which sections exist and Electro wins on how each
 * one is laid out". The derivation assumed live runs Electro's homepage. It
 * does not: live's homepage is built with **Elementor**, twenty
 * `elementor-section`s of Jet widgets, and most of Electro's homepage classes
 * are simply absent from it.
 *
 * Counted on the live homepage, 2026-09-04:
 *
 *   home-v1-slider           0     section-onsale-product   0
 *   deals-block              0     tabs-block               0
 *   home-v1-banner-block     0     home-v1-da-block         0
 *   brands-carousel          0     da-block                 3
 *   product-categories-list  1     handheld-footer-bar      2
 *
 * And rendered, measured in a real browser at 380 and 1440 rather than grepped,
 * because a class can be in the markup and never paint:
 *
 *   .countdown        no such element at either width
 *   .brands-carousel  no such element at either width
 *   .footer-payment   no such element at either width
 *   .da-block         THREE, 201x197 at 1440, 0x0 at 380
 *   .handheld-footer-bar  380x137 at 380, position STATIC; 0x0 at 1440
 *
 * WHAT THAT DECIDES, row by row:
 *
 * 06 has no countdown and no tabs. Live's deals are one flat `jet-listing-grid`
 *    of 32 cards with no section title, which is what `DealsOfTheDay` renders.
 * 07 and 08 are the same three blocks, not a two-up and a four-up. Live's
 *    `electro_elementor_ads_block` renders exactly three `.da-block`s, and they
 *    still carry Electro's English ("Shop the Hottest Products", "Catch Big
 *    Deals on The Consoles", "Laptops Notebooks and More") -- the trap the queue
 *    records. `HeroPromoBanners` is those three, in Hebrew, about this
 *    catalogue.
 * 09 does not exist on live at all. Not built.
 * 12 is not a bottom nav. `.handheld-footer-bar` is `position: static` and
 *    137px tall at 380: a footer block, not a fixed bar. Building a fixed
 *    mobile nav would invent a navigation surface live does not have AND, being
 *    fixed, would cover content at the fold -- the defect the PWA banner and the
 *    consent banner each already had to pay for once.
 *
 * The queue rows that DID survive contact with live: 05 (`product-categories-
 * list`, 1), 10's footer (`site-footer`, 2; payment logos exist as live's own
 * `patment-icon.webp` rather than an Electro `.footer-payment`), and 11
 * (`handheld-header-v2` 1, `off-canvas` 9).
 *
 * This test pins the decisions so a future session does not rebuild them from
 * the Electro template and re-introduce what the gates block.
 */

const ROOT = process.cwd()
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8')

describe('the homepage sections live actually has', () => {
  it('renders the deals grid with no countdown and no tabs block', () => {
    const src = read('src/components/home/DealsOfTheDay.tsx')
    expect(src, 'live has no countdown on the deals grid').not.toMatch(/[Cc]ountdown/)
    expect(src, 'live has no tabs block on the deals grid').not.toMatch(/tabs-block|TabsBlock/)
  })

  it('renders three promo blocks, which is what live renders, not two and not four', () => {
    const src = read('src/components/home/HeroPromoBanners.tsx')
    expect(src.match(/id: 'das-\d'/g) ?? []).toHaveLength(3)
  })

  it('ships no brand strip, because live has none', () => {
    // `brands-carousel` is zero on live and renders nowhere at either width.
    const home = read('src/app/(store)/page.tsx')
    expect(home).not.toMatch(/Brand(Strip|sCarousel|sRail)/)
  })

  it('ships live’s handheld bar as a static footer block, not a fixed nav', () => {
    // Live's `.handheld-footer-bar` measures 380x137 at 380 with
    // `position: static`, and 0x0 at 1440. So it IS a section live has -- the
    // dark strip carrying the logo and the contact line -- and SiteFooter
    // already builds it, below `lg` only. What it is not is a fixed bottom
    // navigation bar, which is what the queue row's name suggests.
    //
    // The distinction is the whole finding. A fixed bar would cover content at
    // the fold, which is the defect the PWA banner and the consent banner each
    // had to pay for once, and it would invent a navigation surface live has
    // no counterpart for.
    const footer = read('src/components/layout/SiteFooter.tsx')
    expect(footer, 'live’s handheld footer bar is built').toMatch(/handheld-footer-bar/)
    expect(footer, 'and it is not fixed').not.toMatch(/\bfixed\b.*bottom-0|bottom-0.*\bfixed\b/)

    const home = read('src/app/(store)/page.tsx')
    expect(home, 'no separate bottom nav component').not.toMatch(/BottomNav/)
  })
})
