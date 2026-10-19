'use client'

import Image from 'next/image'

// `bg` names a promo tint from the @theme block in globals.css, which mirrors
// SITE.promo in src/styles/tokens.ts. Kept as a var() string rather than a
// Tailwind class because it is data on the banner, not markup.
/**
 * HEBREW, AND ABOUT THIS CATALOGUE.
 *
 * The three headings were Electro's demo copy -- Teslas, games consoles and
 * laptops -- in English, on a Hebrew storefront that sells vouchers for
 * restaurants, spas, hotels and tradespeople. The emoji went with them: a car,
 * a gamepad and a laptop illustrated a catalogue that does not exist here.
 *
 * The same three blocks in the homepage hero are `HeroPromoBanners`; this is
 * the (main) route group's copy of them and it had drifted out of sight.
 *
 * Updated: Real product images replaced emoji. Added hover zoom effect (scale 1.05),
 * border-radius 12, and enhanced shadow.
 */

const banners = [
  {
    id: 'hot-deals',
    heading: 'הדילים החמים של השבוע',
    image: '/images/products/ke-live-deal-1.avif',
    imageAlt: 'דילים חמים - תמונת מוצר',
    bg: 'var(--color-promo-rose)',
  },
  {
    id: 'vacation',
    heading: 'מבצעים גדולים על צימרים ומלונות',
    image: '/images/products/ke-live-deal-10.avif',
    imageAlt: 'צימרים ומלונות - תמונת מוצר',
    bg: 'var(--color-promo-violet)',
  },
  {
    id: 'restaurants',
    heading: 'מסעדות, בתי קפה ועוד',
    image: '/images/products/ke-live-deal-26.avif',
    imageAlt: 'מסעדות - תמונת מוצר',
    bg: 'var(--color-promo-sky)',
  },
]

export default function LeftSidebar() {
  return (
    <aside className="space-y-3">
      {banners.map((b) => (
        <article
          key={b.id}
          className="border border-gray-200 overflow-hidden bg-white cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-gray-300"
          style={{ borderRadius: 'var(--radius-card)' }}
        >
          {/* Product image area with hover zoom effect */}
          <div className="relative h-24 w-full overflow-hidden transition-transform duration-200 hover:scale-105">
            <Image
              src={b.image}
              alt={b.imageAlt}
              fill
              sizes="(max-width: 768px) 100vw, 320px"
              className="object-cover"
              priority={false}
            />
          </div>
          {/* Text + button */}
          <div className="p-3">
            <p className="font-extrabold text-xs text-gray-900 leading-snug tracking-tight">
              {b.heading}
            </p>
            <button
              type="button"
              className="mt-2.5 w-full text-white text-xs font-bold py-1.5 rounded-full transition-colors hover:opacity-90"
              style={{ background: 'var(--color-promo-flame)' }}
            >
              לרכישה ←
            </button>
          </div>
        </article>
      ))}
    </aside>
  )
}
