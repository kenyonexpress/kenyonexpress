import MastheadNav from '@/components/layout/MastheadNav'
import SmartImage from '@/components/ui/SmartImage'
import { LOGO } from '@/lib/assets'
import { MapPin, ShoppingBag, Truck, User } from 'lucide-react'
import Link from 'next/link'

/**
 * kenyonexpress.co.il — top bar (welcome) + masthead.
 * Masthead height matched to live (measured 2026-07-28): #masthead is 109.94px
 * so content starts at ~148.3, same as live. Container stays 1320px (max-w-page)
 * per the standing project override. Ofir previously approved live-parity edits
 * on this locked header for the category 1:1 pass.
 */
export default function SiteHeader() {
  return (
    <>
      <div dir="rtl" className="w-full border-b border-border bg-white">
        {/* 37.3px + 1px border = the 38.3px top bar measured on the live site. */}
        <div className="mx-auto flex h-[37.3px] max-w-page items-center px-4 text-[0.929em] text-heading">
          <span>ברוך הבא לעולם של קניון Express</span>

          <div className="ms-auto hidden items-center gap-3 md:flex">
            <span className="flex items-center gap-1.5">
              <MapPin size={14} strokeWidth={1.8} aria-hidden="true" />
              בפריסה ארצית
            </span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span className="flex items-center gap-1.5">
              <Truck size={14} strokeWidth={1.8} aria-hidden="true" />
              משלוח מהיר חינם
            </span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <span className="flex items-center gap-1.5">
              <ShoppingBag size={14} strokeWidth={1.8} aria-hidden="true" />
              קניה בטוחה
            </span>
            <span className="h-3 w-px bg-border" aria-hidden="true" />
            <Link
              href="/login"
              className="flex items-center gap-1.5 transition-opacity hover:opacity-70"
            >
              <User size={14} strokeWidth={1.8} aria-hidden="true" />
              התחברות
            </Link>
          </div>
        </div>
      </div>

      <header dir="rtl" className="sticky top-0 z-40 w-full border-b border-border bg-white">
        {/* Live masthead measures 109.94px (2026-07-28 probe). Earlier 126px
            overstated live and pushed every home band ~17px down. */}
        <div className="mx-auto flex h-[109.94px] max-w-page items-center justify-between px-4">
          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
            <SmartImage
              src={LOGO}
              alt="קניון EXPRESS"
              width={270}
              height={71}
              // Live logo ~270x71 inside the 1200px container.
              className="h-[71px] w-auto object-contain"
              fallbackClassName="h-[71px] w-[120px] rounded-md"
              priority
            />
          </Link>

          <MastheadNav />
        </div>
      </header>
    </>
  )
}
