import SmartImage from '@/components/ui/SmartImage'
import { HERO_CATEGORY_BANNERS } from '@/lib/assets'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import Link from 'next/link'
import type { CSSProperties } from 'react'

const C = ELECTRO_HERO.categoryStrip

/** refs/ke_live_singlefile.html — .product-categories-list .categories (5 items @ xl) */
const CATEGORIES = [
  {
    id: 'kids',
    label: 'תינוקות וילדים',
    href: '/category/baby-kids',
    image: HERO_CATEGORY_BANNERS.kids,
  },
  {
    id: 'courses',
    label: 'קורסים EXPRESS',
    href: '/products',
    image: HERO_CATEGORY_BANNERS.courses,
  },
  {
    id: 'hotels',
    label: 'צימרים מלונות ונופש',
    href: '/category/vacation',
    image: HERO_CATEGORY_BANNERS.hotels,
  },
  {
    id: 'pets',
    label: 'ציוד ומזון לבעלי חיים',
    href: '/category/pets',
    image: HERO_CATEGORY_BANNERS.pets,
  },
  {
    id: 'under99',
    label: 'עד 99',
    href: '/category/under-99',
    /* singlefile renders this tile as text-only (no icon) */
    image: null,
  },
] as const

// All colours, sizes, offsets and the hover shadow come from
// ELECTRO_HERO.categoryStrip (the measured token module). Responsive values are
// passed as CSS custom properties so the literals stay in tokens, not classes.
// Direction is handled with logical properties only (border-e / border-s /
// ms-auto / me-*), so RTL order and mirroring are automatic.
//
// FIVE ACROSS FROM md, NOT FROM lg. Live is five 146px cells at 768 exactly as
// it is at 1440 (ke_live_computed home, `.product-categories-list`: y=426 x=39
// w=729 h=170, items at x 39/185/331/476/622). Starting the row at lg left the
// tablet two-up and wrapped, and since the strip is a fixed 170px box the
// second row overflowed it and drew straight through the trust band below.
// The inline-end offset stays lg-only: 517px was measured inside the 1320px
// container, and at 768 live sits flush against the inline-start edge.
//
// BELOW md THE ROW STILL RENDERS, and that IS a divergence from live, which
// hides the strip under 768 entirely. Live can afford to: it has an off-canvas
// menu (`.off-canvas-navigation`, measured off-screen at x=769). This header is
// logo plus account plus cart, so hiding the strip would leave a phone with no
// way to reach a category from the homepage at all. The height is `auto` there
// so the wrapped rows have room instead of colliding.
export default function CategoryStrip() {
  const stripVars = {
    '--cat-h': `${C.height}px`,
    '--cat-end': `${C.offsetInlineEnd}px`,
    '--cat-w': `${C.maxWidth}px`,
    '--cat-hover-shadow': C.hoverShadow,
  } as CSSProperties

  return (
    <section aria-label="קטגוריות מובילות" className="bg-white font-sans">
      <div className="mx-auto max-w-page">
        <ul
          className="m-0 flex list-none flex-wrap p-0 md:ms-0 md:me-auto md:h-[var(--cat-h)] md:max-w-[var(--cat-w)] md:flex-nowrap lg:ms-auto lg:me-[var(--cat-end)]"
          style={stripVars}
        >
          {CATEGORIES.map((cat) => (
            <li
              key={cat.id}
              className="flex w-1/2 border-e first:border-s md:w-[20%] md:flex-[0_0_20%]"
              style={{ borderColor: C.borderColor }}
            >
              <Link
                href={cat.href}
                className={`group mx-auto flex h-full flex-col items-center text-center transition-shadow hover:shadow-[var(--cat-hover-shadow)] ${
                  cat.image ? 'justify-start' : 'justify-center'
                }`}
                style={{
                  paddingInline: C.itemPaddingInline,
                  paddingTop: cat.image ? C.itemPaddingTop : undefined,
                }}
              >
                {cat.image ? (
                  <div
                    className="relative"
                    style={{
                      width: C.image.size,
                      height: C.image.size,
                      marginBottom: C.image.marginBottom,
                    }}
                  >
                    <SmartImage
                      src={cat.image}
                      alt=""
                      fill
                      sizes={`${C.image.size}px`}
                      className="object-contain transition-transform duration-300 group-hover:scale-105"
                      fallbackClassName="absolute inset-0"
                      iconSize={C.image.fallbackIconSize}
                    />
                  </div>
                ) : null}
                {/* h2, not h4. The homepage outline runs h1 (hero slides) then
                    this, then h2 per product card, so an h4 here skipped two
                    levels and failed Lighthouse's heading-order. Every visual
                    property is set explicitly below, so the level carries no
                    styling and the rendered pixels are identical. */}
                <h2
                  className="m-0 whitespace-nowrap leading-snug"
                  style={{
                    fontSize: C.label.size,
                    fontWeight: C.label.weight,
                    color: C.label.color,
                  }}
                >
                  {cat.label}
                </h2>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
