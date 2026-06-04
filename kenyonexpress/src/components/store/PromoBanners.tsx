import Link from 'next/link'
import { ArrowLeft, Flame, Gamepad2, Laptop, type LucideIcon } from 'lucide-react'

const BANNERS: ReadonlyArray<{
  id: string
  title: string
  icon: LucideIcon
  href: string
}> = [
  {
    id: 'hot',
    title: 'SHOP THE HOTTEST PRODUCTS',
    icon: Flame,
    href: '/products',
  },
  {
    id: 'consoles',
    title: 'CATCH BIG DEALS ON THE CONSOLES',
    icon: Gamepad2,
    href: '/products',
  },
  {
    id: 'laptops',
    title: 'LAPTOPS NOTEBOOKS AND MORE',
    icon: Laptop,
    href: '/category/electronics',
  },
]

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
          <div className="flex flex-1 min-h-[80px] mx-2 my-1 items-center justify-center rounded-md bg-gray-100">
            <banner.icon
              aria-hidden="true"
              className="h-10 w-10 text-gray-400 group-hover:scale-110 transition-transform duration-300"
            />
          </div>
          <div className="flex justify-center pb-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-secondary px-4 py-1.5 text-xs font-bold text-brand-dark">
              Shop now
              <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}
