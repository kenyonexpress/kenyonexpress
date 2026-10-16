import { ChevronLeft } from '@/components/icons'
import BrandPlaceholder from '@/components/ui/BrandPlaceholder'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import Link from 'next/link'

const SB = ELECTRO_HERO.sideBanners

type BannerLine = { text: string; bold?: boolean }[]

type PromoBanner = {
  id: string
  href: string
  lines: BannerLine[]
}

/**
 * HEBREW, AND ABOUT THIS CATALOGUE.
 *
 * These three blocks arrived from the Electro template and were still selling
 * its demo catalogue in its language: "SHOP THE HOTTEST PRODUCTS", "CATCH BIG
 * DEALS ON THE CONSOLES", "LAPTOPS NOTEBOOKS AND MORE". Two of the three named
 * a product line this store does not carry -- KenyonExpress sells vouchers for
 * restaurants, spas, hotels, courses and tradespeople -- and all three were in
 * a language none of its customers shop in.
 *
 * The live site carries the same English (it runs the same theme), so there was
 * no Hebrew counterpart in `refs/` to copy: this is written copy, not measured
 * copy, and each line now matches the category it actually links to.
 *
 * The `bold` part of each line is the `<strong>` Electro puts inside the light
 * copy: same 17px, weight 700 against 200. It is a layout fact and not a
 * language one, so it stays.
 */
const PROMO_BANNERS: PromoBanner[] = [
  {
    id: 'das-1',
    href: '/category/hot-deals',
    lines: [[{ text: 'הדילים ' }, { text: 'החמים', bold: true }, { text: ' של השבוע' }]],
  },
  {
    id: 'das-2',
    href: '/category/vacation',
    lines: [[{ text: 'מבצעים ' }, { text: 'גדולים', bold: true }], [{ text: 'על צימרים ומלונות' }]],
  },
  {
    id: 'das-3',
    href: '/category/restaurants-cafes',
    lines: [[{ text: 'מסעדות, בתי קפה' }, { text: ' ועוד', bold: true }]],
  },
]

/**
 * Live's `.da-text`: 17px / 23px, weight 200, `<strong>` 700 at the same size
 * (sideBanners.copy*). `text-transform: uppercase` went with the English:
 * Hebrew has no letter case for it to act on, and `dir` is inherited.
 *
 * UX06 (14.10.2026): this rendered at 11px / 13px with a 13px strong, which is
 * the handheld da-block's type and not the slider column's; the whole block of
 * copy was 24px tall where live's two lines are 46.
 */
function BannerText({ lines }: { lines: BannerLine[] }) {
  return (
    <div
      className="da-text text-start text-heading"
      style={{
        fontSize: SB.copySize,
        lineHeight: `${SB.copyLineHeight}px`,
        fontWeight: SB.copyWeight,
      }}
    >
      {lines.map((line, lineIdx) => (
        <span key={line.map((p) => p.text).join('|')} className={lineIdx > 0 ? 'block' : undefined}>
          {line.map((part) =>
            part.bold ? (
              <strong key={`${part.text}-b`} className="font-bold">
                {part.text}
              </strong>
            ) : (
              <span key={`${part.text}-n`}>{part.text}</span>
            ),
          )}
        </span>
      ))}
    </div>
  )
}

/**
 * The banner's call to action: live's `.da-action`, 14px / 30px / 700, a flex
 * row whose `::after` is an 18px yellow disc with a chevron, 8px from
 * the text (sideBanners.action*, shopButtonSize). The row starts at the inline
 * start like the copy above it, so in this RTL column the text is right-aligned
 * under the copy and the disc sits to its left.
 *
 * UX06: it was `self-end` inside an `items-end` column, i.e. pinned to the
 * inline END -- the LEFT edge -- 70px away from the right-aligned copy it
 * belongs to, at 11px with a 26px disc.
 *
 * `Shop now` in Hebrew, and the chevron mirrored with it: a forward arrow
 * points in the direction reading advances, which is leftward here. Live keeps
 * Font Awesome's angle-right (its RTL sheet does not flip the glyph); that is
 * the one place this column does not copy it, by the standing RTL rule.
 */
function ShopNowButton() {
  return (
    <span
      className="da-action flex items-center self-start font-bold text-heading"
      style={{ fontSize: SB.actionSize, lineHeight: `${SB.actionLineHeight}px`, gap: SB.actionGap }}
    >
      לרכישה
      <span
        aria-hidden="true"
        style={{ width: SB.shopButtonSize, height: SB.shopButtonSize }}
        // Dark ink, not live's white: white on #fed700 is 1.41:1 and the
        // brand-contrast gate (src/lib/a11y/brand-contrast.test.ts) refuses it
        // anywhere in src/, decoration included. The disc, its size and its
        // place are live's; the glyph colour is the site's standing rule.
        className="flex shrink-0 items-center justify-center rounded-full bg-brand-secondary text-brand-dark"
      >
        <ChevronLeft className="h-3 w-3" strokeWidth={3} />
      </span>
    </span>
  )
}

/**
 * THE LEFT COLUMN OF THE HERO ROW AT lg AND UP: live's three
 * `.slider-das-block` widgets, measured on refs/ke_live_1440.png (UX06,
 * 14.10.2026, logs/ux06/before.json against the same capture):
 *
 *   column   x135..x335, 201 wide (sideBanners.width); the slider starts at
 *            x336. Ours was 200, so the slider was 729 wide from x335.
 *   blocks   197 / 198 / 198 = 593 (min-height 197 on `.da-inner`, a 1px
 *            #e7e7e7 border-top on widgets 2 and 3), the 20px under them to
 *            the row's 613 white. Ours was `h-full`, 204.67 x 3.
 *   inner    16px padding, copy vertically centred, right edge at x320
 *   copy     17px / 23px / 200, strong 700 (was 11 / 13, strong 13)
 *   action   14px / 30px / 700, 18px disc 8px to its left, under the copy's
 *            right edge (was 11px, 26px disc, pinned to the LEFT edge)
 *   image    110px, rotated 16deg, 30 below and 10 past the bottom-left corner,
 *            clipped by the block (was 80 wide, 20 below)
 *   hover    none on live (`.da-media` has no :hover rule); the 40% brand tint
 *            and the 105% zoom were ours and are gone
 *
 * Below lg the column is `hidden`: live's `elementor-hidden-phone` column is
 * also `display:none` through 1199 via `.builder .slider-das-block`, and the
 * 768 capture shows the strip's five tiles straight under the slider with
 * nothing beside them.
 *
 * Each block is a wrapper (the hairline, as on live's widget) around the link
 * (the `.da-inner` box with the min-height), so the hairline adds to the 197
 * instead of being eaten by it: border-box min-height would have made the
 * column 591.
 */
export default function HeroPromoBanners() {
  return (
    <div
      dir="rtl"
      data-hero-promo=""
      style={{
        width: SB.width,
        minWidth: SB.width,
        maxWidth: SB.width,
        flex: `0 0 ${SB.width}px`,
      }}
      className="slider-das-block hidden shrink-0 flex-col self-start bg-white font-sans lg:flex"
    >
      {PROMO_BANNERS.map((banner, idx) => (
        <div
          key={banner.id}
          data-hero-promo-block={banner.id}
          className={`da-block bg-white ${idx > 0 ? 'border-t border-border-alt' : ''}`}
        >
          <Link
            href={banner.href}
            className="da-inner relative flex overflow-hidden bg-white"
            style={{ minHeight: SB.itemHeight, padding: SB.padding }}
          >
            <div className="da-media-body relative z-10 flex min-w-0 flex-1 flex-col justify-center">
              <BannerText lines={banner.lines} />
              <ShopNowButton />
            </div>

            <div
              aria-hidden="true"
              className="da-media-left pointer-events-none absolute z-0"
              style={{
                width: SB.imageSize,
                height: SB.imageSize,
                bottom: -SB.imageOverhangBottom,
                insetInlineEnd: -SB.imageOverhangEnd,
                transform: `rotate(${SB.imageRotateDeg}deg)`,
              }}
            >
              <BrandPlaceholder className="absolute inset-0 rounded-sm" markWidth={64} />
            </div>
          </Link>
        </div>
      ))}
    </div>
  )
}
