import Link from 'next/link'
import SmartImage from '@/components/ui/SmartImage'
import { LOGO } from '@/lib/assets'
import { Heart, ShoppingBag, User } from 'lucide-react'

export default function SiteHeader() {
  return (
    <header dir="rtl" className="w-full bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-page mx-auto px-4 h-(--header-height) flex items-center justify-between gap-5">
        {/* Logo (right in RTL) */}
        <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
          <SmartImage
            src={LOGO}
            alt="קניון EXPRESS"
            width={133}
            height={102}
            className="h-12 w-auto object-contain"
            fallbackClassName="h-12 w-16 rounded-md"
            priority
          />
        </Link>

        {/* Icons (left in RTL) */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            className="p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="מועדפים"
          >
            <Heart size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>

          <Link
            href="/login"
            className="p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="החשבון שלי"
          >
            <User size={22} strokeWidth={1.8} aria-hidden="true" />
          </Link>

          <button
            type="button"
            className="relative p-2.5 hover:bg-gray-100 rounded-full transition-colors text-gray-700"
            aria-label="עגלת קניות, 0 פריטים"
          >
            <ShoppingBag size={22} strokeWidth={1.8} aria-hidden="true" />
            <span
              className="absolute top-1 end-1 w-4 h-4 rounded-full bg-brand-secondary text-brand-dark text-[10px] font-bold flex items-center justify-center"
              aria-hidden="true"
            >
              0
            </span>
          </button>
        </div>
      </div>
    </header>
  )
}
