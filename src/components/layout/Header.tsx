import MastheadNav from '@/components/layout/MastheadNav'
import SmartImage from '@/components/ui/SmartImage'
import { LOGO } from '@/lib/assets'
import { MapPin, ShoppingBag, Truck, User } from 'lucide-react'
import Link from 'next/link'

/**
 * kenyonexpress.co.il — top bar (welcome) + masthead.
 *
 * Masthead height is NOT set here. It comes from `--spacing-header-masthead`
 * in globals.css, which is 109px + a 1px border = the 110px the live masthead
 * actually is.
 *
 * This comment used to say 127px, "measured 2026-07-24", and it was wrong twice
 * over: 127 was remeasured to 110 on 2026-07-30 (globals.css:132 carries that
 * finding, including that the stale value pushed every block below the header
 * down 17px and showed up as 30-42% band differences that looked like
 * card-level defects), and the number was never in this file to begin with.
 * A stale figure in a locked file is worse than none: on 2026-08-12 it was read
 * back as the live truth and nearly reverted the fix.
 *
 * Verified against refs/ke_live_computed.json, captured by
 * scripts/snapshot-live.mjs: `.site-header` is 109.938px tall at 1440.
 *
 * Container stays 1320px (max-w-page) per the standing project override. The
 * live masthead row is 1200px, so that one IS a deliberate divergence, and
 * globals.css:120 explains why it has not been chased: --container-page is read
 * by ten other components that have not been measured.
 */
export default function SiteHeader() {
  return (
    <>
      <div dir="rtl" className="w-full border-b border-border bg-white">
        {/* 37.3px + 1px border = the 38.3px top bar measured on the live site. */}
        <div className="mx-auto flex h-header-topbar max-w-page items-center px-4 text-[0.929em] text-heading">
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
        {/* 109px + 1px border = the 110px masthead measured on the live site.
            Everything below the header inherits this offset, so the height has
            to match before any page can be compared band by band. */}
        <div className="mx-auto flex h-header-masthead max-w-page items-center justify-between px-4">
          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
            <SmartImage
              src={LOGO}
              alt="קניון EXPRESS"
              width={133}
              height={102}
              // Live renders the logo 270x71, but inside a 1170px container. The
              // project container is 1320px, so matching the live SIZE lands it
              // on different pixels and measured worse. Size stays at 40px until
              // the container question is settled.
              className="h-logo-h w-auto object-contain"
              fallbackClassName="h-logo-h w-logo-w rounded-md"
              priority
            />
          </Link>

          <MastheadNav />
        </div>
      </header>
    </>
  )
}
