// `bg` names a promo tint from the @theme block in globals.css, which mirrors
// SITE.promo in src/styles/tokens.ts. Kept as a var() string rather than a
// Tailwind class because it is data on the banner, not markup.
const banners = [
  {
    id: 'hottest',
    heading: 'SHOP THE HOTTEST PRODUCTS',
    emoji: '🚗',
    emojiLabel: 'Tesla',
    bg: 'var(--color-promo-rose)',
  },
  {
    id: 'consoles',
    heading: 'CATCH BIG DEALS ON THE CONSOLES',
    emoji: '🎮',
    emojiLabel: 'Consoles',
    bg: 'var(--color-promo-violet)',
  },
  {
    id: 'laptops',
    heading: 'LAPTOPS NOTEBOOKS AND MORE',
    emoji: '💻',
    emojiLabel: 'Laptops',
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
            <p className="font-extrabold text-xs text-gray-900 leading-snug uppercase tracking-tight">
              {b.heading}
            </p>
            <button
              type="button"
              className="mt-2.5 w-full text-white text-xs font-bold py-1.5 rounded-full transition-colors hover:opacity-90"
              style={{ background: 'var(--color-promo-flame)' }}
            >
              Shop now ←
            </button>
          </div>
        </div>
      ))}
    </aside>
  )
}
