import HeaderCart from '@/components/cart/HeaderCart'
import { Heart } from '@/components/icons'
import WishlistNavCount from '@/components/wishlist/WishlistNavCount'
import { LOGO } from '@/lib/assets'
import Link from 'next/link'
import SmartImage from '../ui/SmartImage'
import MobileDrawer from './MobileDrawer'
import TopBar from './TopBar'

/**
 * UX03: The masthead polish — measured logo sizes, icon alignment, cart badge
 * animation. Single component for both layouts: logo with responsive sizing,
 * hamburger and cart cluster shown conditionally by breakpoint.
 */

export default function SiteHeader() {
  return (
    <>
      <TopBar />

      <header dir="rtl" className="sticky top-11 z-40 w-full border-b border-border bg-white">
        <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-gutter xl:h-[6.875rem]">
          {/* Logo: handheld-centered via flex justify-between, desktop shows here too */}
          <div className="flex flex-1 items-center justify-center xl:justify-start">
            <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
              <SmartImage
                src={LOGO}
                alt="קניון EXPRESS"
                width={300}
                height={79}
                className="aspect-[19/5] h-auto w-handheld-logo-w xl:w-auto xl:h-logo-h object-contain"
                fallbackClassName="h-handheld-logo-h w-handheld-logo-w xl:h-logo-h xl:w-logo-w rounded-md"
                priority
              />
            </Link>
          </div>

          {/* Handheld: hamburger on left (first in DOM for RTL right-align) */}
          <MobileDrawer />

          {/* Icons: handheld 3-cell cluster (handheld), desktop nav (xl) */}
          <nav className="-me-touch-pad flex items-center gap-0 xl:hidden">
            <Link
              href="/wishlist"
              aria-label="המועדפים שלי"
              className="-m-0.5 p-1 text-icon transition-colors hover:text-heading-hover"
            >
              <span className="relative block">
                <Heart size={22} strokeWidth={1.8} aria-hidden="true" />
                <WishlistNavCount />
              </span>
            </Link>
            <div className="grid size-touch-min place-items-center">
              <HeaderCart />
            </div>
          </nav>
        </div>
      </header>
    </>
  )
}
