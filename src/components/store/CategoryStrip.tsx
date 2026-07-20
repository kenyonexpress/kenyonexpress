import SmartImage from '@/components/ui/SmartImage'
import { HERO_CATEGORY_BANNERS } from '@/lib/assets'
import Link from 'next/link'

/** refs/ke_live_singlefile.html — .product-categories-list .categories (5 items @ xl) */
const CATEGORIES = [
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
    id: 'hotels',
    label: 'צימרים מלונות ונופש',
    href: '/category/vacation',
    image: HERO_CATEGORY_BANNERS.hotels,
  },
  {
    id: 'pets',
    label: 'ציוד ומזון לבעלי חיים',
    href: '/category/pets',
    image: HERO_CATEGORY_BANNERS.pets,
  },
  {
    id: 'under99',
    label: 'עד 99',
    href: '/category/under-99',
    /* singlefile renders this tile as text-only (no icon) */
    image: null,
  },
] as const

export default function CategoryStrip() {
  return (
    <section aria-label="קטגוריות מובילות" className="bg-white font-sans">
      <div className="mx-auto max-w-page">
        {/* singlefile: strip sits at x577-1305 (728px) in the compare reference, not page-centered */}
        <ul
          className="m-0 flex list-none flex-wrap p-0 lg:ms-auto lg:me-[517px] lg:max-w-[728px] lg:flex-nowrap"
          style={{ height: '170px' }}
        >
          {CATEGORIES.map((cat) => (
            <li
              key={cat.id}
              className="flex w-1/2 border-e border-[#e7e7e7] first:border-s lg:w-[20%] lg:flex-[0_0_20%]"
            >
              <Link
                href={cat.href}
                className={`group mx-auto flex h-full flex-col items-center px-3 text-center transition-shadow hover:shadow-[0_0_18px_-2px_rgba(0,0,0,0.2)] ${
                  cat.image ? 'justify-start pt-[16px]' : 'justify-center'
                }`}
              >
                {cat.image ? (
                  <div className="relative mb-[10px] h-[100px] w-[100px]">
                    <SmartImage
                      src={cat.image}
                      alt=""
                      fill
                      sizes="100px"
                      className="object-contain transition-transform duration-300 group-hover:scale-105"
                      fallbackClassName="absolute inset-0"
                      iconSize={28}
                    />
                  </div>
                ) : null}
                <h4
                  className="m-0 whitespace-nowrap leading-snug text-[#333e48]"
                  style={{ fontSize: '14px', fontWeight: 600 }}
                >
                  {cat.label}
                </h4>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
