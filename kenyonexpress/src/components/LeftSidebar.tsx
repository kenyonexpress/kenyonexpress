const banners = [
  {
    heading: 'SHOP THE HOTTEST PRODUCTS',
    emoji: '🚗',
    emojiLabel: 'Tesla',
    bg: '#fff5f5',
  },
  {
    heading: 'CATCH BIG DEALS ON THE CONSOLES',
    emoji: '🎮',
    emojiLabel: 'Consoles',
    bg: '#f5f5ff',
  },
  {
    heading: 'LAPTOPS NOTEBOOKS AND MORE',
    emoji: '💻',
    emojiLabel: 'Laptops',
    bg: '#f0f7ff',
  },
]

export default function LeftSidebar() {
  return (
    <aside className="space-y-3">
      {banners.map((b, i) => (
        <div
          key={i}
          className="border border-gray-200 rounded-xl overflow-hidden bg-white hover:shadow-md transition-shadow cursor-pointer"
        >
          {/* Product image area */}
          <div
            className="flex items-center justify-center h-24"
            style={{ background: b.bg }}
          >
            <span className="text-5xl select-none">{b.emoji}</span>
          </div>
          {/* Text + button */}
          <div className="p-3">
            <p className="font-extrabold text-xs text-gray-900 leading-snug uppercase tracking-tight">
              {b.heading}
            </p>
            <button
              className="mt-2.5 w-full text-white text-xs font-bold py-1.5 rounded-full transition-colors hover:opacity-90"
              style={{ background: '#FF6B00' }}
            >
              Shop now ←
            </button>
          </div>
        </div>
      ))}
    </aside>
  )
}
