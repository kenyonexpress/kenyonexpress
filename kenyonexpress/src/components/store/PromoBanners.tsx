import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import SmartImage from '@/components/ui/SmartImage'
import { PROMO } from '@/lib/assets'

const BANNERS = [
  {
    id: 'hot',
    title: 'SHOP THE HOTTEST PRODUCTS',
    image: PROMO[0],
    href: '/products',
  },
  {
    id: 'consoles',
    title: 'CATCH BIG DEALS ON THE CONSOLES',
    image: PROMO[1],
    href: '/products',
  },
  {
    id: 'laptops',
    title: 'LAPTOPS NOTEBOOKS AND MORE',
    image: PROMO[2],
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
          className={`group flex flex-1 flex-col gap-2 p-3 hover:bg-brand-accent/40 transition-colors ${
            idx < BANNERS.length - 1 ? 'border-b border-gray-200' : ''
          }`}
        >
          <p className="text-[11px] font-black text-gray-500 uppercase leading-tight text-start line-clamp-2">
            {banner.title}
          </p>
          <div className="relative flex-1 min-h-[64px]">
            <SmartImage
              src={banner.image}
              alt=""
              fill
              sizes="260px"
              className="object-contain p-1 group-hover:scale-105 transition-transform duration-300"
              fallbackClassName="absolute inset-0 rounded-md"
            />
          </div>
          <span className="inline-flex items-center gap-2 text-xs font-bold text-gray-700">
            Shop now
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-secondary text-brand-dark"
            >
              <ChevronLeft className="h-4 w-4" />
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}
