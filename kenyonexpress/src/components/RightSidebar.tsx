import Link from 'next/link'

const categories = [
  { label: 'דילים חמים', icon: '🔥', href: '/products' },
  { label: 'עד %%%', icon: '💰', href: '/coupons' },
  { label: 'החדשים', icon: '✨', href: '/products' },
  { label: 'מסעדות ובתי קפה', icon: '🍽️', href: '/products' },
  { label: 'יופי בריאות וטיפוח', icon: '💆', href: '/products' },
  { label: 'טלפונים מחשבים ואביזרים', icon: '📱', href: '/products' },
  { label: 'תינוקות וילדים', icon: '🧸', href: '/products' },
  { label: 'צימרים ובתי מלון', icon: '🏨', href: '/products' },
  { label: 'ציוד ומזון לבעלי חיים', icon: '🐾', href: '/products' },
  { label: 'בעלי מקצוע', icon: '🔧', href: '/products' },
  { label: 'קורסים Express - בקרוב...', icon: '🎓', href: '/', muted: true },
]

export default function RightSidebar() {
  return (
    <aside className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Solid yellow top block */}
      <div
        className="px-4 py-4 text-center"
        style={{ background: '#F5C518' }}
      >
        <p className="font-extrabold text-gray-900 text-sm tracking-tight">קניון EXPRESS</p>
        <p className="text-xs text-gray-800 mt-0.5 font-medium">מסדרים לך בילוי</p>
      </div>

      {/* Category list */}
      <div>
        {categories.map((cat, i) => (
          <Link
            key={i}
            href={cat.href}
            className={`flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0 transition-colors ${
              cat.muted
                ? 'text-gray-400 pointer-events-none'
                : 'hover:bg-gray-50 text-gray-700'
            }`}
          >
            <span className="text-sm shrink-0">{cat.icon}</span>
            <span className={`text-xs leading-snug ${cat.muted ? 'italic' : 'font-medium'}`}>
              {cat.label}
            </span>
          </Link>
        ))}
      </div>
    </aside>
  )
}
