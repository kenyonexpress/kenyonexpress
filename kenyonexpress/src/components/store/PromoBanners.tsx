import Image from 'next/image'
import Link from 'next/link'

const BANNERS = [
  {
    id: 'hot',
    title: 'SHOP THE HOTTEST PRODUCTS',
    image: 'https://picsum.photos/seed/promo-hot/200/140',
    href: '/products',
  },
  {
    id: 'consoles',
    title: 'CATCH BIG DEALS ON THE CONSOLES',
    image: 'https://picsum.photos/seed/promo-console/200/140',
    href: '/products',
  },
  {
    id: 'laptops',
    title: 'LAPTOPS NOTEBOOKS AND MORE',
    image: 'https://picsum.photos/seed/promo-laptop/200/140',
    href: '/category/electronics',
  },
] as const

export default function PromoBanners() {
  return (
    <div className="flex flex-col h-full min-h-[440px] bg-white border-s border-gray-200">
      {BANNERS.map((banner, idx) => (
        <Link
          key={banner.id}
          href={banner.href}
          className={`group flex flex-1 flex-col overflow-hidden hover:bg-brand-accent/40 transition-colors ${
            idx < BANNERS.length - 1 ? 'border-b border-gray-200' : ''
          }`}
        >
          <p className="px-3 pt-3 text-[11px] font-black text-gray-500 uppercase leading-tight text-center line-clamp-2">
            {banner.title}
          </p>
          <div className="relative flex-1 min-h-[80px] mx-2 my-1">
            <Image
              src={banner.image}
              alt=""
              aria-hidden="true"
              fill
              className="object-contain object-center p-2 group-hover:scale-105 transition-transform duration-300"
              sizes="260px"
              unoptimized
            />
          </div>
          <div className="flex justify-center pb-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-secondary px-4 py-1.5 text-xs font-bold text-brand-dark">
              Shop now
              <span aria-hidden="true" className="rtl:rotate-180">
                →
              </span>
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
