'use client'

import { Building2, Flame, UtensilsCrossed } from 'lucide-react'

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
 * Updated: Real SVG icons replaced emoji (Flame for hot deals, Building2 for hotels,
 * UtensilsCrossed for restaurants). Added hover zoom effect (scale 1.05),
 * border-radius 12, and enhanced shadow.
 */

type BannerIconType = typeof Flame | typeof Building2 | typeof UtensilsCrossed

const banners = [
  {
    id: 'hot-deals',
    heading: 'הדילים החמים של השבוע',
    icon: Flame as BannerIconType,
    iconLabel: 'דילים חמים',
    bg: 'var(--color-promo-rose)',
    gradient: 'from-rose-400 to-rose-600',
  },
  {
    id: 'vacation',
    heading: 'מבצעים גדולים על צימרים ומלונות',
    icon: Building2 as BannerIconType,
    iconLabel: 'צימרים ובתי מלון',
    bg: 'var(--color-promo-violet)',
    gradient: 'from-violet-400 to-violet-600',
  },
  {
    id: 'restaurants',
    heading: 'מסעדות, בתי קפה ועוד',
    icon: UtensilsCrossed as BannerIconType,
    iconLabel: 'מסעדות ובתי קפה',
    bg: 'var(--color-promo-sky)',
    gradient: 'from-sky-400 to-sky-600',
  },
]

export default function LeftSidebar() {
  return (
    <aside className="space-y-3">
      {banners.map((b) => {
        const Icon = b.icon
        return (
          <article
            key={b.id}
            className="border border-gray-200 overflow-hidden bg-white cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-gray-300"
            style={{ borderRadius: 'var(--radius-card)' }}
            aria-label={b.iconLabel}
          >
            {/* Product image area with hover zoom effect */}
            <div
              className={`flex items-center justify-center h-24 bg-gradient-to-b ${b.gradient} transition-transform duration-200 hover:scale-105 overflow-hidden`}
            >
              <Icon className="w-12 h-12 text-white drop-shadow-lg" aria-hidden="false" />
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
        )
      })}
    </aside>
  )
}
