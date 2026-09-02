import MastheadNav from '@/components/layout/MastheadNav'
import SmartImage from '@/components/ui/SmartImage'
import { LOGO } from '@/lib/assets'
import { MapPin, ShoppingBag, Truck, User } from 'lucide-react'
import Link from 'next/link'

/**
 * kenyonexpress.co.il — top bar (welcome) + masthead.
 * Masthead height matched to the live site (measured 2026-07-24): live masthead is
 * 127px (28px top/bottom padding around the logo row), so content starts at 165.4.
 * The earlier 54px was a project override against the collapsed single-file snapshot;
 * Ofir approved raising it to live parity to close the 70px content offset. Container
 * stays 1320px (max-w-page) per the standing project override.
 */
export default function SiteHeader() {
  return (
    <>
      <div dir="rtl" className="w-full border-b border-border bg-white">
        {/* 37.3px + 1px border = the 38.3px top bar measured on the live site. */}
        <div className="mx-auto flex h-header-topbar max-w-page items-center px-[15px] text-[0.929em] text-heading">
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
        {/* 126px + 1px border = the 127px masthead measured on the live site.
            Everything below the header inherits this offset, so the height has
            to match before any page can be compared band by band. */}
        <div className="mx-auto flex h-header-masthead max-w-page items-center justify-between px-[15px]">
          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
            <SmartImage
              src={LOGO}
              alt="קניון EXPRESS"
              width={300}
              height={79}
              // 300x79 at 1440 (lg+), measured off refs/ke_live_computed.json;
              // below lg the 1:1 measurement has no referent and 300px does
              // not fit a 320 viewport, so the logo drops to 40px tall
              // (img.img-header-logo, x1005 y53). The old 40px box was a
              // deliberate mismatch justified by the 1320 container; the
              // container is now live's 1200, so the justification is gone.
              className="h-10 w-auto object-contain lg:h-logo-h"
              fallbackClassName="h-10 w-logo-w rounded-md lg:h-logo-h"
              priority
            />
          </Link>

          <MastheadNav />
        </div>
      </header>
    </>
  )
}
