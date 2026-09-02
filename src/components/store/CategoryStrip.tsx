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
export default function CategoryStrip({ inHero = false }: { inHero?: boolean } = {}) {
  const stripVars = {
    height: C.height,
    '--cat-end': `${C.offsetInlineEnd}px`,
    '--cat-w': `${C.maxWidth}px`,
    '--cat-hover-shadow': C.hoverShadow,
  } as CSSProperties

  // Inside the hero's center column (live: 728px, five 145.6px cells) the strip
  // fills its parent; standalone it keeps the page frame for the phone layout.
  return (
    <section aria-label="קטגוריות מובילות" className="bg-white font-sans">
      <div className={inHero ? 'w-full' : 'mx-auto max-w-page'}>
        <ul
          className={
            inHero
              ? 'm-0 flex w-full list-none flex-nowrap p-0'
              : 'm-0 flex list-none flex-wrap p-0 lg:ms-auto lg:me-[var(--cat-end)] lg:max-w-[var(--cat-w)] lg:flex-nowrap'
          }
          style={stripVars}
        >
          {CATEGORIES.map((cat) => (
            <li
              key={cat.id}
              className="flex w-1/2 border-e first:border-s lg:w-[20%] lg:flex-[0_0_20%]"
              style={{ borderColor: C.borderColor }}
            >
              <Link
                href={cat.href}
                className={`group mx-auto flex h-full flex-col items-center text-center transition-shadow hover:shadow-[var(--cat-hover-shadow)] max-lg:min-h-11 max-lg:justify-center ${
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
