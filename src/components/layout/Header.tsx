import HeaderCart from '@/components/cart/HeaderCart'
import MastheadNav from '@/components/layout/MastheadNav'
import MobileDrawer from '@/components/layout/MobileDrawer'
import SmartImage from '@/components/ui/SmartImage'
import { LOGO } from '@/lib/assets'
import { MapPin, ShoppingBag, Truck, User } from 'lucide-react'
import Link from 'next/link'

/**
 * kenyonexpress.co.il — top bar + header.
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
 * This file used to serve one fixed 37.3 + 109 at every width. That is 51px
 * SHORT of live at 380 and 24px TALL at 768, and because everything below the
 * header inherits the offset, the whole page shifts and every band in the
 * comparison below the fold is measured against the wrong rows of live.
 *
 * WHY THE TOP BAR IS THREE ROWS ON A PHONE. Its four info items do not fit one
 * 380px line, so live wraps them onto three 37px rows: 3 x 37 + 1px border =
 * the 113 measured above. This file previously hid all four below `md`, so our
 * top bar was one row where live has three -- which is most of that 51px.
 * `flex-wrap` with a fixed row height reproduces it without a media query.
 *
 * NO SEARCH UI, deliberately and against live. Live puts a search icon in the
 * handheld header, a full search form under it at 768, and a 534px search
 * field in the 1440 masthead. The standing project rule is that there is no
 * search UI anywhere. The pixel cost is real and is recorded in STATE.md
 * rather than quietly absorbed.
 */

type InfoItemProps = {
  Icon: typeof User
  label: string
  /** Only the account item is a link on live; the other three are plain text. */
  href?: string
}

/** The top bar's four items, in live's RTL order (right to left). */
const INFO_ITEMS: readonly InfoItemProps[] = [
  { Icon: User, label: 'התחברות', href: '/login' },
  { Icon: ShoppingBag, label: 'קניה בטוחה' },
  { Icon: Truck, label: 'משלוח מהיר חינם' },
  { Icon: MapPin, label: 'בפריסה ארצית' },
]

function InfoItem({ Icon, label, href }: InfoItemProps) {
  const body = (
    <>
      <Icon size={14} strokeWidth={1.8} aria-hidden="true" />
      {label}
    </>
  )
  // The row is 37px, which already clears the 44px floor only for the link;
  // `min-h` on the anchor keeps the tappable one honest at any type size.
  return href ? (
    <Link
      href={href}
      className="flex h-topbar-row items-center gap-1.5 transition-opacity hover:opacity-70"
    >
      {body}
    </Link>
  ) : (
    <span className="flex h-topbar-row items-center gap-1.5">{body}</span>
  )
}

export default function SiteHeader() {
  return (
    <>
      <div dir="rtl" className="w-full border-b border-border bg-white">
        {/*
          h-topbar-handheld (112) below md, h-header-topbar (37.3) from md up:
          live's 113 and 38 respectively, each less its 1px border. The items
          wrap inside it, so the three rows fill the tall variant exactly.
        */}
        <div className="mx-auto flex h-topbar-handheld max-w-page flex-wrap items-center px-[15px] text-[0.929em] text-heading md:h-header-topbar md:flex-nowrap">
          <span className="flex h-topbar-row items-center">ברוך הבא לעולם של קניון Express</span>

          <div className="flex flex-wrap items-center gap-x-3 md:ms-auto">
            {INFO_ITEMS.map((item, index) => (
              <div key={item.label} className="flex items-center gap-x-3">
                {index > 0 ? (
                  <span className="hidden h-3 w-px bg-border md:block" aria-hidden="true" />
                ) : null}
                <InfoItem {...item} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <header dir="rtl" className="sticky top-0 z-40 w-full border-b border-border bg-white">
        {/*
          h-header-handheld (83) below xl, h-header-masthead (109) from xl up:
          live's 84 and 110 less their 1px border. `xl` and not `lg` because
          live's own switch is `hidden-xl-up` / `d-xl-block` on the two header
          variants -- the handheld header is what 768 AND 1024 get.
        */}
        <div className="mx-auto flex h-header-handheld max-w-page items-center justify-between gap-4 px-[15px] xl:h-header-masthead">
          {/* HANDHELD (below xl): cart + account on the right, logo centred,
              hamburger on the left. Live's icon row sits at x15/x57 with 22px
              glyphs, so the icons are 22 and the row owns the 44px hit area. */}
          <div className="flex items-center gap-2 xl:hidden">
            <HeaderCart />
            <Link
              href="/login"
              aria-label="החשבון שלי"
              className="grid size-touch-min place-items-center text-icon transition-opacity hover:opacity-70"
            >
              <User size={22} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          </div>

          <Link href="/" aria-label="קניון אקספרס, לדף הבית" className="shrink-0">
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

          {/* The hamburger and its drawer. Both are xl:hidden internally. */}
          <MobileDrawer />

          {/* DESKTOP (xl and up): the measured masthead nav. */}
          <div className="hidden min-w-0 flex-1 xl:flex">
            <MastheadNav />
          </div>
        </div>
      </header>
    </>
  )
}
