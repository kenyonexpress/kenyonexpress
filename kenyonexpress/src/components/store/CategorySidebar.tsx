import Link from 'next/link'

type CategoryItem = {
  id: string
  label: string
  href: string
  bold?: boolean
  muted?: boolean
}

const CATEGORIES: CategoryItem[] = [
  { id: 'hot', label: 'דילים חמים 🔥', href: '/products', bold: true },
  { id: 'under99', label: 'עד 99₪', href: '/category/under-99', bold: true },
  { id: 'new', label: 'החדשים', href: '/category/new', bold: true },
  { id: 'restaurants', label: 'מסעדות ובתי קפה', href: '/category/restaurants' },
  { id: 'beauty', label: 'יופי בריאות וטיפוח', href: '/category/beauty' },
  { id: 'tech', label: 'טלפונים מחשבים ואביזורים', href: '/category/electronics' },
  { id: 'kids', label: 'תינוקות וילדים', href: '/category/kids' },
  { id: 'hotels', label: 'צימרים ובתי מלון', href: '/category/hotels' },
  { id: 'pets', label: 'ציוד ומזון לבעלי חיים', href: '/category/pets' },
  { id: 'pro', label: 'בעלי מקצוע', href: '/category/pro' },
  {
    id: 'courses',
    label: 'קורסים Express – בקרוב . . .',
    href: '/',
    muted: true,
  },
]

export default function CategorySidebar() {
  return (
    <aside className="flex flex-col h-full bg-white border-e border-gray-200 overflow-hidden">
      <div className="h-14 shrink-0 bg-brand-secondary" aria-hidden="true" />

      <nav aria-label="מחלקות" className="flex-1 overflow-y-auto">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            href={cat.href}
            className={`block px-4 py-2.5 text-sm border-b border-gray-100 transition-colors ${
              cat.muted
                ? 'text-gray-400 pointer-events-none italic'
                : 'text-gray-700 hover:bg-brand-accent hover:text-brand-dark'
            } ${cat.bold ? 'font-bold' : 'font-medium'}`}
          >
            {cat.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
