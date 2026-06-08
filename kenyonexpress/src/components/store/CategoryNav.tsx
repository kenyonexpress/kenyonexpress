import Link from 'next/link'

// Top horizontal departments menu (matches the live electro "תפריט קטגוריות עליון").
// Canonical slugs per KE_LIVE_SPEC.md.
const CATEGORIES = [
  { label: 'דילים חמים 🔥', slug: 'hot-deals', strong: true },
  { label: 'עד ₪99', slug: 'under-99' },
  { label: 'החדשים', slug: 'new' },
  { label: 'מסעדות ובתי קפה', slug: 'restaurants-cafes' },
  { label: 'יופי בריאות וטיפוח', slug: 'beauty-health' },
  { label: 'טלפונים מחשבים ואביזרים', slug: 'phones-computers' },
  { label: 'תינוקות וילדים', slug: 'baby-kids' },
  { label: 'צימרים ובתי מלון', slug: 'vacation' },
  { label: 'ציוד ומזון לבעלי חיים', slug: 'pets' },
  { label: 'בעלי מקצוע', slug: 'professionals' },
  { label: 'קורסים Express – בקרוב . . .', slug: 'courses', muted: true },
] as const

export default function CategoryNav() {
  return (
    <nav dir="rtl" aria-label="מחלקות" className="w-full bg-white border-b border-gray-200">
      <ul className="max-w-page mx-auto px-4 flex items-center gap-1 overflow-x-auto whitespace-nowrap">
        {CATEGORIES.map((cat) =>
          'muted' in cat && cat.muted ? (
            <li key={cat.slug}>
              <span className="block px-3 py-3 text-sm font-medium text-gray-400 italic">
                {cat.label}
              </span>
            </li>
          ) : (
            <li key={cat.slug}>
              <Link
                href={`/category/${cat.slug}`}
                className={`block px-3 py-3 text-sm border-b-2 border-transparent transition-colors hover:border-brand-primary hover:text-brand-dark ${
                  'strong' in cat && cat.strong
                    ? 'font-bold text-brand-dark'
                    : 'font-medium text-gray-700'
                }`}
              >
                {cat.label}
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}
