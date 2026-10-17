import HeaderCart from '@/components/cart/HeaderCart'
import { Heart } from '@/components/icons'
import SiteSearch from '@/components/search/SiteSearch'
import WishlistNavCount from '@/components/wishlist/WishlistNavCount'
import { LOGO } from '@/lib/assets'
import Link from 'next/link'
import SmartImage from '../ui/SmartImage'
import MobileDrawer from './MobileDrawer'

export default function MainHeader() {
  return (
    <header dir="rtl" className="sticky top-11 z-40 w-full border-b border-border bg-white">
      <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-gutter xl:h-[6.875rem]">
        {/* Mobile hamburger + logo + cart */}
        <div className="flex w-full items-center justify-between gap-2 xl:hidden h-[5.625rem]">
          <MobileDrawer />
          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="tap-area shrink-0">
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

        {/* Desktop layout */}
        <div className="hidden w-full items-center gap-6 xl:flex">
          {/* Logo on the right */}
          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="tap-area shrink-0">
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

          {/* Center search */}
          <div className="min-w-0 flex-1">
            <SiteSearch id="main-header-search" variant="masthead" />
          </div>

          {/* Left side icons */}
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
          </nav>
        </div>

        {/* Cart - shared for mobile and desktop */}
        <div className="-me-touch-pad flex items-center gap-0 xl:hidden">
          <div className="grid size-touch-min place-items-center">
            <HeaderCart />
          </div>
        </div>
      </div>
    </header>
  )
}
