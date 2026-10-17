'use client'

import HeaderCart from '@/components/cart/HeaderCart'
import { Heart, Menu, Phone } from '@/components/icons'
import SiteSearch from '@/components/search/SiteSearch'
import WishlistNavCount from '@/components/wishlist/WishlistNavCount'
import { LOGO } from '@/lib/assets'
import { storeWhatsAppNumber } from '@/lib/whatsapp'
import Link from 'next/link'
import SmartImage from '../ui/SmartImage'
import MobileDrawer from './MobileDrawer'
import TopBar from './TopBar'

export default function SiteHeader() {
  const storePhone = storeWhatsAppNumber()

  return (
    <>
      {/* ROW A: TopBar */}
      <TopBar />

      {/* ROW B: MainHeader */}
      <header dir="rtl" className="sticky top-11 z-40 w-full border-b border-border bg-white">
        <div className="mx-auto flex h-[5.625rem] max-w-page items-center justify-between gap-4 px-gutter">
          {/* Mobile: hamburger + logo */}
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
          </div>

          {/* Desktop layout */}
          <div className="hidden w-full items-center gap-6 xl:flex">
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

            <div className="min-w-0 flex-1">
              <SiteSearch id="main-header-search" variant="masthead" />
            </div>

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
            </div>
          </div>

          {/* Cart - shared for mobile and desktop */}
          <div className="grid size-11 place-items-center">
            <HeaderCart />
          </div>
        </div>
      </header>

      {/* ROW C: NavBar */}
      <nav
        dir="rtl"
        className="sticky bottom-0 z-40 flex h-11 w-full items-center gap-4 bg-brand px-gutter xl:bottom-auto xl:top-[11rem]"
      >
        <button
          type="button"
          className="flex shrink-0 items-center gap-2 rounded bg-white px-4 py-2 font-medium text-brand transition-colors hover:bg-gray-100"
          aria-label="הכל במבצע"
        >
          <Menu size={18} />
          <span>הכל במבצע</span>
        </button>

        <div className="hidden flex-1 items-center justify-center gap-6 xl:flex">
          <Link href="/" className="text-sm font-medium text-heading hover:opacity-80">
            בית
          </Link>
          <Link href="/shop" className="text-sm font-medium text-heading hover:opacity-80">
            חנות
          </Link>
          <Link href="/products" className="text-sm font-medium text-heading hover:opacity-80">
            מוצרים
          </Link>
          <Link href="/deals" className="text-sm font-medium text-heading hover:opacity-80">
            דילים
          </Link>
          <Link href="/suppliers" className="text-sm font-medium text-heading hover:opacity-80">
            ספקים
          </Link>
          <Link href="/blog" className="text-sm font-medium text-heading hover:opacity-80">
            בלוג
          </Link>
          <Link href="/contact" className="text-sm font-medium text-heading hover:opacity-80">
            צור קשר
          </Link>
        </div>

        {storePhone && (
          <div className="hidden shrink-0 items-center gap-2 xl:flex">
            <Phone size={18} />
            <a
              href={`tel:${storePhone}`}
              className="text-sm font-medium text-heading transition-colors hover:text-heading-hover"
            >
              דברו איתנו
            </a>
          </div>
        )}
      </nav>
    </>
  )
}
