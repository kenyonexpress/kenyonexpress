import SmartImage from '@/components/ui/SmartImage'
import { LOGO } from '@/lib/assets'
import { Heart, ShoppingCart, User } from 'lucide-react'
import Link from 'next/link'

/**
 * kenyonexpress.co.il — top bar (welcome) + masthead.
 * Values from refs/ke_live_home.html (Electro header-v8 / handheld-header-v2):
 * icons #515151 @22px, gap 20px, badge bg #333e48.
 */
const ICON = { size: 22, color: '#515151', strokeWidth: 1.8 } as const

export default function SiteHeader() {
  return (
    <>
      {/* Top bar — refs/ke_live_singlefile.html .top-bar: white, border-bottom #ddd,
          font-size .929em, item padding .58em 0 */}
      <div dir="rtl" className="w-full border-b border-[#ddd] bg-white">
        <div className="mx-auto flex max-w-page items-center px-4 text-[0.929em] text-[#333e48]">
          <span className="py-[0.58em]">ברוך הבא לעולם של קניון Express</span>
        </div>
      </div>

      {/* Masthead — 54px, logo (right) + 3 icons (left) */}
      <header dir="rtl" className="sticky top-0 z-40 w-full border-b border-[#ddd] bg-white">
        <div className="mx-auto flex h-[54px] max-w-page items-center justify-between px-4">
          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
            <SmartImage
              src={LOGO}
              alt="קניון EXPRESS"
              width={133}
              height={102}
              className="h-[40px] w-auto object-contain"
              fallbackClassName="h-[40px] w-[52px] rounded-md"
              priority
            />
          </Link>

          {/* RTL: first child renders rightmost, so DOM order favorites → user → cart
              produces left-to-right: cart (₪0), user, favorites */}
          <nav className="flex shrink-0 items-center gap-5" aria-label="פעולות חשבון ועגלה">
            <Link
              href="/wishlist"
              aria-label="מועדפים"
              className="transition-opacity hover:opacity-70"
              style={{ color: ICON.color }}
            >
              <Heart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
            </Link>

            <Link
              href="/login"
              aria-label="החשבון שלי"
              className="transition-opacity hover:opacity-70"
              style={{ color: ICON.color }}
            >
              <User size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
            </Link>

            <Link
              href="/cart"
              aria-label="עגלת קניות, ₪0"
              className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
              style={{ color: ICON.color }}
            >
              <ShoppingCart size={ICON.size} strokeWidth={ICON.strokeWidth} aria-hidden="true" />
              <span className="text-sm font-semibold text-black">₪0</span>
            </Link>
          </nav>
        </div>
      </header>
    </>
  )
}
