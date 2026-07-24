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
        <div className="mx-auto flex max-w-page items-center px-4 text-[0.929em] text-heading">
          <span className="py-[0.58em]">ברוך הבא לעולם של קניון Express</span>

          <div className="ms-auto hidden items-center gap-3 py-[0.58em] md:flex">
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
        <div className="mx-auto flex h-[127px] max-w-page items-center justify-between px-4">
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

          <MastheadNav />
        </div>
      </header>
    </>
  )
}
