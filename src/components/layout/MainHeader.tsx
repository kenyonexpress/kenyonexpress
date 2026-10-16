import HeaderCart from '@/components/cart/HeaderCart'
import SiteSearch from '@/components/search/SiteSearch'
import WishlistNavCount from '@/components/wishlist/WishlistNavCount'
import { LOGO } from '@/lib/assets'
import { Heart, User } from 'lucide-react'
import Link from 'next/link'
import SmartImage from '../ui/SmartImage'
import MobileDrawer from './MobileDrawer'

export default function MainHeader() {
  return (
    <header dir="rtl" className="sticky top-11 z-40 w-full border-b border-border bg-white">
      <div className="mx-auto flex h-[5.625rem] max-w-page items-center justify-between gap-4 px-gutter">
        {/* Mobile hamburger + logo + cart */}
        <div className="flex w-full items-center justify-between gap-2 xl:hidden">
          <MobileDrawer />
          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="tap-area shrink-0">
            <SmartImage
              src={LOGO}
              alt="קניון EXPRESS"
              width={300}
              height={79}
              className="aspect-[19/5] h-auto w-[6.25rem] object-contain"
              fallbackClassName="h-6 w-[6.25rem] rounded-md"
              priority
            />
          </Link>
          <div className="grid size-11 place-items-center">
            <HeaderCart />
          </div>
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
              className="aspect-[19/5] h-auto w-[10rem] object-contain"
              fallbackClassName="h-[4.9375rem] w-[10rem] rounded-md"
              priority
            />
          </Link>

          {/* Center search */}
          <div className="min-w-0 flex-1">
            <SiteSearch id="main-header-search" variant="masthead" />
          </div>

          {/* Left side icons */}
          <div className="flex shrink-0 items-center gap-4">
            <Link
              href="/wishlist"
              aria-label="המועדפים שלי"
              className="grid size-11 place-items-center text-icon transition-colors hover:text-heading-hover"
            >
              <span className="relative">
                <Heart size={22} strokeWidth={1.8} aria-hidden="true" />
                <WishlistNavCount />
              </span>
            </Link>
            <Link
              href="/account"
              aria-label="החשבון שלי"
              className="grid size-11 place-items-center text-icon transition-colors hover:text-heading-hover"
            >
              <User size={22} strokeWidth={1.8} aria-hidden="true" />
            </Link>
            <div className="grid size-11 place-items-center">
              <HeaderCart />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
