import { UNDER_99_LABEL } from '@/lib/ke-live-hero-data'
import Link from 'next/link'

const categories = [
  { id: 'hot', label: 'דילים חמים', icon: '🔥', href: '/products' },
  { id: 'pct', label: UNDER_99_LABEL, icon: '💰', href: '/category/under-99' },
  { id: 'new', label: 'החדשים', icon: '✨', href: '/products' },
  { id: 'restaurants', label: 'מסעדות ובתי קפה', icon: '🍽️', href: '/products' },
  { id: 'beauty', label: 'יופי בריאות וטיפוח', icon: '💆', href: '/products' },
  { id: 'tech', label: 'טלפונים מחשבים ואביזרים', icon: '📱', href: '/products' },
  { id: 'kids', label: 'תינוקות וילדים', icon: '🧸', href: '/products' },
  { id: 'hotels', label: 'צימרים ובתי מלון', icon: '🏨', href: '/products' },
  { id: 'pets', label: 'ציוד ומזון לבעלי חיים', icon: '🐾', href: '/products' },
  { id: 'pro', label: 'בעלי מקצוע', icon: '🔧', href: '/products' },
  { id: 'courses', label: 'קורסים Express - בקרוב...', icon: '🎓', href: '/', muted: true },
]

export default function RightSidebar() {
  return (
    <aside
      // STEP 32: two unnamed `complementary` landmarks on every (main) page;
      // a screen reader's landmark list read "complementary, complementary".
      aria-label="קטגוריות"
      className="border border-border rounded-xl overflow-hidden bg-surface"
    >
      {/* Solid yellow top block */}
      <div className="px-space-lg py-space-lg text-center bg-brand-secondary">
        <p className="font-extrabold text-foreground text-sm tracking-tight">קניון EXPRESS</p>
        <p className="text-xs text-gray-700 mt-0.5 font-medium">מסדרים לך בילוי</p>
      </div>

      {/* Category list */}
      <div>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={cat.href}
            className={`flex items-center gap-space-sm px-space-md py-space-md min-h-6 border-b border-rule last:border-0 transition-colors ${
              cat.muted
                ? 'text-gray-600 pointer-events-none'
                : 'hover:bg-surface-hover text-foreground'
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
