import HeaderCart from '@/components/cart/HeaderCart'
import { EcFavorites } from '@/components/icons/electro-icons'
import MastheadNav from '@/components/layout/MastheadNav'
import MobileDrawer from '@/components/layout/MobileDrawer'
import TopBar from '@/components/layout/TopBar'
import SmartImage from '@/components/ui/SmartImage'
import { LOGO } from '@/lib/assets'
import Link from 'next/link'

/**
 * kenyonexpress.co.il — the shell: `<TopBar>` (component 01) then the masthead.
 *
 * THE TOP BAR IS ITS OWN FILE. Everything about it -- live's four info items,
 * the `|` separators, the home-only greeting and the three-row wrap at 380 --
 * moved to `TopBar.tsx` when the component queue reached 01, with the measured
 * table it is built from. This file keeps the masthead and mounts it.
 *
 * THE SHELL IS RESPONSIVE ON LIVE AND WAS NOT HERE. Measured off
 * refs/ke_live_computed.json at all three compare widths, 2026-09-03:
 *
 *   width   top bar   header   header contents
 *   ------  --------  -------  --------------------------------------------
 *   380     113       84       cart, account, logo 100x26, hamburger
 *   768      38       84       the same, wider
 *   1440     38      110       logo 300x79 + nav; no hamburger
 *
 * ...AND THAT TABLE IS THE HOME PAGE ONLY, WHICH IS WHAT D21 FOUND. The stored
 * `refs/ke_live_computed.json` was captured on the homepage, and the 113 was
 * read as a property of the width. It is not. Measured against the live site
 * directly on 2026-09-03, at 380:
 *
 *   page         top bar   header
 *   -----------  --------  ------
 *   /                 113      50
 *   /products/         76      83
 *   /cart              76      83
 *
 * The 37px difference is one top-bar row, the greeting, and TopBar.tsx explains
 * how it is gated without making the route dynamic.
 *
 * This file used to serve one fixed 37.3 + 109 at every width. That is 51px
 * SHORT of live at 380 and 24px TALL at 768, and because everything below the
 * header inherits the offset, the whole page shifts and every band in the
 * comparison below the fold is measured against the wrong rows of live.
 *
 * NO SEARCH UI, deliberately and against live. Live puts a search icon in the
 * handheld header, a full search form under it at 768, and a 534px search
 * field in the 1440 masthead. The standing project rule is that there is no
 * search UI anywhere. The pixel cost is real and is recorded in STATE.md
 * rather than quietly absorbed.
 */

export default function SiteHeader() {
  return (
    <>
      {/* The info strip renders at EVERY width. Live shows it on a 380 phone
          as three stacked rows (plus the home greeting, 113px in all), and
          rc5 F03's `hidden md:block` wrapper with a brand-yellow 56px masthead
          made y0-200 the worst header band of the 2026-10-20 run (58.6%).
          Electro's phone masthead is not what the gate measures against. */}
      <TopBar />

      <header dir="rtl" className="sticky top-0 z-40 w-full border-b border-border bg-white">
        {/*
          h-header-phone (48) below xl and h-header-masthead (109) from xl up:
          live's 49 and 110 less their 1px border. `xl` and not `lg` for the
          masthead because live's own switch is `hidden-xl-up` / `d-xl-block`
          on the two header variants -- the handheld header is what 768 AND
          1024 get. There is NO 83px step at md: that token came from a 2026-09
          reading of 84 at 768 that included a search row this project does not
          render. Probed in the live archive on 2026-10-20, header#masthead is
          y38 h49 at 768 and y113 h49 at 380 (the handheld-header-wrap is 48
          at both), and the hero opens at y88. With the 83 here our hero opened
          at y122, and the whole 768 page sat 35px low.
        */}
        <div className="mx-auto flex h-header-phone max-w-page items-center justify-between gap-4 px-gutter xl:h-header-masthead">
          {/* HANDHELD (below xl), in live's order: hamburger on the right,
              logo centred, the two-icon cluster on the left. */}
          {/* THE HAMBURGER IS ON THE INLINE-START, WHICH IN RTL IS THE RIGHT,
              and it is first in the DOM for exactly that reason. Measured on
              live at 380: hamburger x=319, cart x=15. This header had them the
              other way round -- hamburger left, cart and account right -- a
              straight mirror of live's handheld row, on every page. The
              container is `justify-between`, so DOM order IS side order here.
              Both halves of MobileDrawer are xl:hidden internally. */}
          <MobileDrawer />

          {/* THE PHONE LOGO IS NOT CENTRED. Live at 380 puts it at x205-305,
              26px off the hamburger, because its icon cluster on the other
              side is 220px wide and overflows the viewport. Ours is 100px, so
              justify-between centred the logo at x168 and the two 100x26 logos
              overlapped on nothing. me-auto below md hands the free space to
              the inline-end and the logo lands at x206 with the existing 16px
              gap. From md up live's logo IS centred (x578 at 768). */}
          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0 max-md:me-auto">
            <SmartImage
              src={LOGO}
              alt="קניון EXPRESS"
              width={300}
              height={79}
              // Two measured sizes, not one scaled guess: 100x26 in the
              // handheld header (x205 y141 at 380, x578 y66 at 768) and
              // 300x79 in the 1440 masthead (x1005 y53).
              className="h-handheld-logo-h w-auto object-contain xl:h-logo-h"
              fallbackClassName="h-handheld-logo-h w-handheld-logo-w rounded-md xl:h-logo-h xl:w-logo-w"
              priority
            />
          </Link>

          {/* Live's icon row sits at x15/x57 with 22px glyphs, so the icons are
              22 and the row owns the 44px hit area. Last in the DOM puts it on
              the inline-end, which in RTL is the left, where live has it.

              TWO ICONS, HEART THEN CART, THE SAME PAIR THE MASTHEAD SHOWS.
              This cluster used to be cart + a <User> link to /login, which
              broke the rule twice over: no wishlist affordance below xl, an
              account icon in a cluster that may not carry one, and a second
              account entry point competing with TopBar's התחברות.

              The DOM order also fixes a mirror. In an RTL flex row the FIRST
              child renders RIGHTMOST, so cart-first put the cart on the right
              while live measures it at x=15, hard against the left edge. Heart
              first, cart second puts the cart back on the left and gives the
              heart live's x=57 slot. */}
          <div className="flex items-center gap-2 xl:hidden">
            <Link
              href="/account/wishlist"
              aria-label="המועדפים שלי"
              className="grid size-touch-min place-items-center text-icon transition-opacity hover:opacity-70"
            >
              <EcFavorites size={22} aria-hidden="true" />
            </Link>
            <HeaderCart />
          </div>

          {/* DESKTOP (xl and up): the measured masthead nav. */}
          <div className="hidden min-w-0 flex-1 xl:flex">
            <MastheadNav />
          </div>
        </div>
      </header>
    </>
  )
}
