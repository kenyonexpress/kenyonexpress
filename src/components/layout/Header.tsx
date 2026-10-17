import HeaderCart from '@/components/cart/HeaderCart'
import { Heart } from '@/components/icons'
import SiteSearch from '@/components/search/SiteSearch'
import WishlistNavCount from '@/components/wishlist/WishlistNavCount'
import { LOGO } from '@/lib/assets'
import Link from 'next/link'
import SmartImage from '../ui/SmartImage'
import MobileDrawer from './MobileDrawer'
import TopBar from './TopBar'

/**
 * UX03: The masthead polish — measured logo sizes, icon alignment, cart badge
 * animation, and search pill focus state (all CSS, see tokens.css and globals.css).
 *
 * MEASURED FROM LIVE: logo 100x26 handheld, 300x79 masthead. Icon cluster:
 * three 44px cells at handheld, 38px gap between at lg. Badge: 20px dark / 21px
 * yellow with pop animation. Hover: `a:hover{color:#29323a}` (heading-hover),
 * not opacity fade. Focus: pill border lightens to #ffeb80, ring lifts on top.
 */

export default function SiteHeader() {
  return (
    <>
      <TopBar />

      <header dir="rtl" className="sticky top-11 z-40 w-full border-b border-border bg-white">
        <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-gutter xl:h-[6.875rem]">
          {/* Handheld: logo on the right, hamburger on left, cart pulled back right */}
          <div className="flex w-full items-center justify-between xl:hidden h-[5.625rem]">
            <MobileDrawer />
            <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
              <SmartImage
                src={LOGO}
                alt="קניון EXPRESS"
                width={300}
                height={79}
                className="aspect-[19/5] h-auto w-handheld-logo-w object-contain"
                fallbackClassName="h-handheld-logo-h w-handheld-logo-w rounded-md"
                priority
              />
            </Link>
          </div>

          {/* Desktop: logo, search, icons */}
          <div className="hidden w-full items-center gap-6 xl:flex">
            <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
              <SmartImage
                src={LOGO}
                alt="קניון EXPRESS"
                width={300}
                height={79}
                className="aspect-[19/5] h-auto w-auto xl:h-logo-h xl:w-logo-w object-contain"
                fallbackClassName="h-logo-h w-logo-w rounded-md"
                priority
              />
            </Link>

            <div className="min-w-0 flex-1">
              <SiteSearch id="main-header-search" variant="masthead" />
            </div>

            <nav className="flex shrink-0 items-center gap-4 lg:gap-nav-gap">
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
              <HeaderCart />
            </nav>
          </div>

          {/* Handheld: cart in three-cell cluster pulled back */}
          <div className="-me-touch-pad flex items-center gap-0 xl:hidden">
            <div className="grid size-touch-min place-items-center">
              <HeaderCart />
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
