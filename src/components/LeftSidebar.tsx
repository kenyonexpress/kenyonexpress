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
 */
const banners = [
  {
    id: 'hot-deals',
    heading: 'הדילים החמים של השבוע',
    emoji: '🔥',
    emojiLabel: 'דילים חמים',
    bg: 'var(--color-promo-rose)',
  },
  {
    id: 'vacation',
    heading: 'מבצעים גדולים על צימרים ומלונות',
    emoji: '🏨',
    emojiLabel: 'צימרים ובתי מלון',
    bg: 'var(--color-promo-violet)',
  },
  {
    id: 'restaurants',
    heading: 'מסעדות, בתי קפה ועוד',
    emoji: '🍽️',
    emojiLabel: 'מסעדות ובתי קפה',
    bg: 'var(--color-promo-sky)',
  },
]

export default function LeftSidebar() {
  return (
    <aside className="space-y-3">
      {banners.map((b) => (
        <div
          key={b.id}
          className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow cursor-pointer"
        >
          {/* Product image area */}
          <div className="flex items-center justify-center h-24" style={{ background: b.bg }}>
            <span className="text-5xl select-none">{b.emoji}</span>
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
        </div>
      ))}
    </aside>
  )
}
