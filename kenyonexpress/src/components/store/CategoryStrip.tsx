import Link from 'next/link'
import SmartImage from '@/components/ui/SmartImage'
import { CATEGORIES as CATEGORY_IMAGES } from '@/lib/assets'

const CATEGORIES = [
  {
    id: 'under99',
    label: 'עד 99',
    href: '/category/under-99',
    image: CATEGORY_IMAGES.under99,
  },
  {
    id: 'pets',
    label: 'ציוד ומזון לבעלי חיים',
    href: '/category/pets',
    image: CATEGORY_IMAGES.pets,
  },
  {
    id: 'hotels',
    label: 'צימרים מלונות ונופש',
    href: '/category/hotels',
    image: CATEGORY_IMAGES.hotels,
  },
  {
    id: 'courses',
    label: 'קורסים EXPRESS',
    href: '/products',
    image: CATEGORY_IMAGES.courses,
  },
  {
    id: 'kids',
    label: 'תינוקות וילדים',
    href: '/category/kids',
    image: CATEGORY_IMAGES.kids,
  },
] as const

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
            <div className="relative w-full h-[72px] max-w-[120px]">
              <SmartImage
                src={cat.image}
                alt=""
                fill
                sizes="120px"
                className="object-cover rounded-md group-hover:scale-105 transition-transform duration-300"
                fallbackClassName="absolute inset-0 rounded-md"
                iconSize={28}
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
