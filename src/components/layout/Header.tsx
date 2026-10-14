import HeaderCart from '@/components/cart/HeaderCart'
import MastheadNav from '@/components/layout/MastheadNav'
import MobileDrawer from '@/components/layout/MobileDrawer'
import TopBar from '@/components/layout/TopBar'
import HandheldSearch from '@/components/search/HandheldSearch'
import SmartImage from '@/components/ui/SmartImage'
import WishlistNavCount from '@/components/wishlist/WishlistNavCount'
import { LOGO } from '@/lib/assets'
import { Heart } from 'lucide-react'
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
 * SEARCH UI, since STEP 08 (30.09). Live puts a search icon in the handheld
 * header, a full search form under it at 768, and a 534px search field in the
 * 1440 masthead. From 04.09 the project rule was no search UI anywhere; STEP 08
 * reversed it. The masthead pill is in MastheadNav; below xl the icon cluster
 * carries `<HandheldSearch/>`, an icon that opens the same combobox in a row
 * under the header (overlaid, so the closed state measures as before). Live's
 * always-open form at 768 is not reproduced: one control, one behaviour, at
 * every handheld width. The delta is recorded in STATE.md.
 */

export default function SiteHeader() {
  return (
    <>
      <TopBar />

      <header
        dir="rtl"
        className="safe-pt sticky top-0 z-40 w-full border-b border-border bg-white"
      >
        {/*
          h-header-handheld (49) below xl, h-header-masthead (109) from xl up:
          live's 50 and 110 less their 1px border. `xl` and not `lg` because
          live's own switch is `hidden-xl-up` / `d-xl-block` on the two header
          variants -- the handheld header is what 768 AND 1024 get.
        */}
        {/* gap-2 below 360: hamburger 44 + logo 100 + the three-cell cluster 132
            is 276, plus two 16px gaps and the 30px gutter pair is 338, which
            does not fit 320 (the cluster's 11px pull leaves 7px of sideways
            scroll on every page; e2e/rtl-mobile.spec.ts, 15.10.2026, XF04).
            Two 8px gaps make it 311. From 360 (--breakpoint-narrow) the row
            is live's 16px. */}
        <div className="mx-auto flex h-header-handheld max-w-page items-center justify-between gap-2 px-gutter narrow:gap-4 xl:h-header-masthead">
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

          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="tap-area shrink-0">
            <SmartImage
              src={LOGO}
              alt="קניון EXPRESS"
              width={300}
              height={79}
              // Two measured sizes, not one scaled guess: 100x26 in the
              // handheld header (x205 y141 at 380, x578 y66 at 768) and
              // 300x79 in the 1440 masthead (x1005 y53).
              // `aspect-[19/5]` is logo.webp's own 380x100. With the width
              // left `auto`, Chrome sizes the box from the width/height
              // attributes (300/79) until the bytes arrive and then from the
              // file, and Lighthouse attributed the homepage's one layout
              // shift to that re-measure ("media element lacking an explicit
              // size"). A CSS aspect ratio wins over the intrinsic one, so
              // the box is final before the first byte.
              // WIDTH-BOUND BELOW xl, HEIGHT-BOUND FROM IT (UX03). Live's
              // handheld rule is `.header-logo img{max-width:100px}` and the
              // masthead's is `max-width:300px` with the row's height; a
              // height-bound 26px drew 98.8px wide (19/5 x 26), measured in
              // logs/ux03/before.json, where live paints the full 100.
              className="aspect-[19/5] h-auto w-handheld-logo-w object-contain xl:h-logo-h xl:w-auto"
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
          {/* THREE 44px CELLS, NO GAP, PULLED 11px PAST THE GUTTER (UX03).
              Live's row is three 22px glyphs with 20px between them, the
              first one at x15: cart 15, user 57, search 99. A 44px cell
              around each 22px glyph overhangs it by 11 on each side, so
              `-me-touch-pad` puts the cart glyph on the gutter and the cells
              touch at a 44px pitch (cart 15, heart 59, search 103; live's is
              42). Before this the cart carried its price below xl too, and
              the glyph measured x45 with the heart at x86. */}
          <div className="-me-touch-pad flex items-center gap-0 xl:hidden">
            {/* Live's handheld header has a search icon; this one opens the
                combobox in a row under the header (HandheldSearch.tsx). First
                in the cluster, so RTL paints it rightmost of the three and the
                heart-then-cart order the icon gate pins is unchanged. */}
            <HandheldSearch />
            <Link
              href="/wishlist"
              aria-label="המועדפים שלי"
              className="grid size-touch-min place-items-center text-icon transition-colors hover:text-heading-hover"
            >
              <span className="relative">
                <Heart size={22} strokeWidth={1.8} aria-hidden="true" />
                <WishlistNavCount />
              </span>
            </Link>
            {/* The cart's own box is the 30px tap-area it has in the masthead;
                the cell gives it the same 44px pitch as its two neighbours. */}
            <div className="grid size-touch-min place-items-center">
              <HeaderCart />
            </div>
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
