import Image from 'next/image'
import Link from 'next/link'

const CATEGORIES = [
  { id: 'under99', label: 'עד 99', href: '/category/under-99', image: 'https://picsum.photos/seed/cat-99/120/100' },
  {
    id: 'pets',
    label: 'ציוד ומזון לבעלי חיים',
    href: '/category/pets',
    image: 'https://picsum.photos/seed/cat-pets/120/100',
  },
  {
    id: 'hotels',
    label: 'צימרים מלונות ונופש',
    href: '/category/hotels',
    image: 'https://picsum.photos/seed/cat-hotels/120/100',
  },
  {
    id: 'courses',
    label: 'קורסים EXPRESS',
    href: '/products',
    image: 'https://picsum.photos/seed/cat-courses/120/100',
  },
  {
    id: 'kids',
    label: 'תינוקות וילדים',
    href: '/category/kids',
    image: 'https://picsum.photos/seed/cat-kids/120/100',
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
              <Image
                src={cat.image}
                alt=""
                aria-hidden="true"
                fill
                className="object-cover rounded-md group-hover:scale-105 transition-transform duration-300"
                sizes="120px"
                unoptimized
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
