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
    id: 'kids',
    label: 'תינוקות וילדים',
    href: '/category/baby-kids',
    image: HERO_CATEGORY_BANNERS.kids,
  },
  {
    id: 'courses',
    label: 'קורסים EXPRESS',
    href: '/products',
    image: HERO_CATEGORY_BANNERS.courses,
  },
  {
    id: 'restaurants',
    label: 'מסעדות ובתי קפה',
    href: '/category/restaurants-cafes',
    image: HERO_CATEGORY_BANNERS.restaurants,
  },
  {
    id: 'beauty',
    label: 'יופי בריאות וטיפוח',
    href: '/category/beauty-health',
    image: HERO_CATEGORY_BANNERS.beauty,
  },
  {
    id: 'phones',
    label: 'טלפונים מחשבים ואביזרים',
    href: '/category/phones-computers',
    image: HERO_CATEGORY_BANNERS.phones,
  },
] as const

export default function CategoryStrip() {
  return (
    <section aria-label="קטגוריות מובילות" className="border-y border-gray-200 bg-white font-sans">
      <div className="max-w-page mx-auto flex flex-wrap lg:flex-nowrap">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.id}
            href={cat.href}
            className="group flex w-1/4 flex-col items-center justify-center gap-2 border-e border-gray-200 px-3 py-4 transition-colors last:border-e-0 hover:bg-gray-50 lg:w-auto lg:flex-1 lg:min-w-0"
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
