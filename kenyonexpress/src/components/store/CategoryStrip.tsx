import Link from 'next/link'
import { Baby, GraduationCap, Hotel, PawPrint, Tag, type LucideIcon } from 'lucide-react'

const CATEGORIES: ReadonlyArray<{
  id: string
  label: string
  href: string
  icon: LucideIcon
}> = [
  { id: 'under99', label: 'עד 99', href: '/category/under-99', icon: Tag },
  {
    id: 'pets',
    label: 'ציוד ומזון לבעלי חיים',
    href: '/category/pets',
    icon: PawPrint,
  },
  {
    id: 'hotels',
    label: 'צימרים מלונות ונופש',
    href: '/category/hotels',
    icon: Hotel,
  },
  {
    id: 'courses',
    label: 'קורסים EXPRESS',
    href: '/products',
    icon: GraduationCap,
  },
  {
    id: 'kids',
    label: 'תינוקות וילדים',
    href: '/category/kids',
    icon: Baby,
  },
]

export default function CategoryStrip() {
  return (
    <section
      aria-label="קטגוריות מובילות"
      className="bg-white border-y border-gray-200"
    >
      <div className="max-w-screen-xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
        {CATEGORIES.map((cat, idx) => (
          <Link
            key={cat.id}
            href={cat.href}
            className={`group flex flex-col items-center justify-center gap-2 px-3 py-4 hover:bg-gray-50 transition-colors ${
              idx < CATEGORIES.length - 1 ? 'border-e border-gray-200' : ''
            }`}
          >
            <div className="flex w-full h-[72px] max-w-[120px] items-center justify-center rounded-md bg-gray-100">
              <cat.icon
                aria-hidden="true"
                className="h-7 w-7 text-gray-400 group-hover:scale-110 transition-transform duration-300"
              />
            </div>
            <span className="text-xs font-bold text-gray-800 text-center leading-snug">
              {cat.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
