import SmartImage from '@/components/ui/SmartImage'
import { HERO_CATEGORY_BANNERS } from '@/lib/assets'
import Link from 'next/link'

const CATEGORIES = [
  {
    id: 'under99',
    label: 'עד 99',
    href: '/category/under-99',
    image: HERO_CATEGORY_BANNERS.under99,
  },
  {
    id: 'pets',
    label: 'ציוד ומזון לבעלי חיים',
    href: '/category/pets',
    image: HERO_CATEGORY_BANNERS.pets,
  },
  {
    id: 'hotels',
    label: 'צימרים מלונות ונופש',
    href: '/category/vacation',
    image: HERO_CATEGORY_BANNERS.hotels,
  },
  {
    id: 'courses',
    label: 'קורסים EXPRESS',
    href: '/products',
    image: HERO_CATEGORY_BANNERS.courses,
  },
  {
    id: 'kids',
    label: 'תינוקות וילדים',
    href: '/category/baby-kids',
    image: HERO_CATEGORY_BANNERS.kids,
  },
] as const

export default function CategoryStrip() {
  return (
    <section aria-label="קטגוריות מובילות" className="bg-white border-y border-gray-200 font-sans">
      <div className="max-w-page mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {CATEGORIES.map((cat, idx) => (
          <Link
            key={cat.id}
            href={cat.href}
            className={`group flex flex-col items-center justify-center gap-2 px-3 py-4 transition-colors hover:bg-gray-50 ${
              idx < CATEGORIES.length - 1 ? 'border-e border-gray-200' : ''
            }`}
          >
            <div className="relative h-[72px] w-full max-w-[120px]">
              <SmartImage
                src={cat.image}
                alt=""
                fill
                sizes="120px"
                className="rounded-md object-cover transition-transform duration-300 group-hover:scale-105"
                fallbackClassName="absolute inset-0 rounded-md"
                iconSize={28}
              />
            </div>
            <span className="text-center text-xs font-bold leading-snug text-heading">
              {cat.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
