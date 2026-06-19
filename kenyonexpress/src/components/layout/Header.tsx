import Link from 'next/link'
import SmartImage from '@/components/ui/SmartImage'
import { LOGO } from '@/lib/assets'
import { ShoppingBag } from 'lucide-react'

/** refs/ke_live_singlefile.html — .header-v8 .masthead */
const HEADER = {
  borderBottom: '1px solid #ddd',
  height: '70px',
  cartLabel: { fontSize: 14, fontWeight: 600, color: '#000' },
} as const

export default function SiteHeader() {
  return (
    <header
      dir="rtl"
      className="sticky top-0 z-40 w-full bg-white"
      style={{ borderBottom: HEADER.borderBottom }}
    >
      <div
        className="mx-auto flex max-w-page items-center justify-between gap-5 px-4"
        style={{ height: HEADER.height }}
      >
        <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
          <SmartImage
            src={LOGO}
            alt="קניון EXPRESS"
            width={133}
            height={102}
            className="h-auto w-[133px] object-contain"
            fallbackClassName="h-12 w-16 rounded-md"
            priority
          />
        </Link>

        <div className="flex shrink-0 items-center gap-0.5">
          <span style={HEADER.cartLabel}>₪0</span>
          <button
            type="button"
            className="relative rounded-full p-2.5 text-gray-700 transition-colors hover:bg-gray-100"
            aria-label="עגלת קניות, 0 פריטים"
          >
            <ShoppingBag size={22} strokeWidth={1.8} aria-hidden="true" />
            <span
              className="absolute top-1 end-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-secondary text-[10px] font-bold text-brand-dark"
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
