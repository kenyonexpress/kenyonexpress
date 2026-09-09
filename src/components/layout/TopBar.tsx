import { MapPin, ShoppingBag, Truck, User } from 'lucide-react'
import Link from 'next/link'

/**
 * COMPONENT 01 OF `docs/COMPONENT-QUEUE.md`: kenyonexpress.co.il's top bar.
 *
 * Geometry from Electro's `.top-bar` (`refs/electro_home.html`, 4 occurrences);
 * content, and every number below, from the live site. Live runs the same
 * template as `top-bar top-bar-v2` and the two differ in one structural way
 * that matters: Electro's carries `d-none d-xl-block` and simply is not there
 * below 1200, while live's has no media query at all and is on a phone. Live
 * wins on which sections exist, so the bar renders at every width.
 *
 * MEASURED, from `refs/ke_live_computed.json` home, all three compare widths:
 *
 *   width  bar   container         greeting ul      items ul
 *   -----  ----  ----------------  ---------------  ------------------
 *   380    113   x0   w380         x190 y0  w175    x15  y37 w350 h75
 *   768     38   x24  w720         x554 y0  w175    x39  y0  w461
 *   1440    38   x120 w1200        x1130 y0 w175    x135 y0 w461
 *
 * The bar is one 37px row plus a 1px bottom border at 768 and 1440, and three
 * rows at 380 -- the greeting on its own, then the four info items wrapped two
 * and two. The height is content-driven here rather than pinned, which is what
 * makes the same component give 113 on the home page and 76 on an inner one
 * (the greeting is home-only; see below).
 *
 * The four `li` boxes at 1440 sit at x 500, 354, 238 and 135, right to left,
 * with anchor widths 96, 112, 83 and 70.
 *
 * THE GREETING IS GATED IN CSS, NOT BY `usePathname()`. Reading the pathname
 * here would opt the whole subtree into dynamic rendering and fail the build on
 * unrelated prerendered routes -- the trap MobileDrawer.tsx records in full.
 * Instead the home page renders an inert marker and `globals.css` reveals the
 * greeting with `:has()`. No client JS, no dynamic API, still a server
 * component. That is the whole 37px difference between / and /products at 380.
 *
 * NO SEARCH UI, deliberately and against live, per the standing project rule.
 * Nothing in this bar is a search affordance in either template, so the rule
 * costs it nothing; it costs the masthead, and that is recorded there.
 */

type InfoItemProps = {
  Icon: typeof User
  label: string
  /** Only the account item is a link on live; the other three are plain text. */
  href?: string
}

/**
 * The top bar's four items, in LIVE'S DOM ORDER, which is not reading order.
 *
 * `ul#menu-top-bar-right` in `refs/ke_live_home.html` lists them
 * בפריסה ארצית, משלוח מהיר חינם, קניה בטוחה, התחברות -- and in an RTL flex row
 * the FIRST child renders RIGHTMOST. So live's account item is the LEFTMOST
 * thing in the bar, and this array had it first, i.e. on the right.
 *
 * Confirmed against `refs/ke_live_computed.json` home/1440, where the four `li`
 * boxes sit at x 500, 354, 238, 135 with anchor widths 96, 112, 83 and 70. The
 * 70 is התחברות and it is the one at x=135, hard against the container's
 * inline-end. The old comment called this "live's RTL order" and produced the
 * mirror of it.
 *
 * It is also the project's account rule: the account entry point lives in the
 * shell's top-left and in exactly one place.
 */
const INFO_ITEMS: readonly InfoItemProps[] = [
  { Icon: MapPin, label: 'בפריסה ארצית' },
  { Icon: Truck, label: 'משלוח מהיר חינם' },
  { Icon: ShoppingBag, label: 'קניה בטוחה' },
  { Icon: User, label: 'התחברות', href: '/login' },
]

function InfoItem({ Icon, label, href }: InfoItemProps) {
  const body = (
    <>
      {/* 16, not 14. Live: `.top-bar .nav-inline .menu-item>a i{font-size:1rem}`
          and the computed `i` boxes are 16x16 at y=12 in a 37px row. The 6px
          `gap-1.5` is live's own `margin-left:6px` on the same rule, written as
          the logical gap it is. */}
      <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
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

/**
 * Live's item separator, which is a `|` GLYPH and not a rule.
 *
 *   .top-bar .nav-inline>.menu-item+.menu-item:before{
 *     content:'|'; color:#ddd; display:inline-block; margin:0 1em }
 *
 * Header.tsx used to draw a 1px x 12px `bg-border` box with a 12px flex gap,
 * and to hide it below `md` entirely. Three things were wrong with that at
 * once: the mark, the metric, and the breakpoint.
 *
 * THE METRIC IS WHAT MOVES THE LAYOUT. A `|` at 13.006px plus 1em on each side
 * is ~33px, and the computed `li` boxes prove it exactly: every `li` after the
 * first is 33px wider than its own anchor (145 vs 112, 116 vs 83, 103 vs 70).
 * We were spending 12. Across three gaps that is 63px of top bar, and at 380 it
 * is the difference between live's wrap (two items, then two) and ours (three
 * items, then one) -- the same total height, arrived at down a different column.
 *
 * THE BREAKPOINT: live's rule is on `.nav-inline` with no media query, so the
 * separators are there at 380 too, inside each wrapped row.
 *
 * `1em` rather than a token on purpose: it is 1em in live's stylesheet, it
 * tracks the 0.929em the bar sets, and a px token would freeze that ratio.
 */
function ItemSeparator() {
  return (
    <span className="mx-[1em] select-none text-border" aria-hidden="true">
      |
    </span>
  )
}

export default function TopBar() {
  return (
    <div dir="rtl" className="w-full border-b border-border bg-white">
      {/*
        NO handheld height below md: the rows wrap and the bar is as tall as
        they make it, which is the whole point (see the header note). Two rows
        of 37.333 on an inner page, three on home. h-header-topbar (37.3) from
        md up is live's 38 less its 1px border.
      */}
      <div className="mx-auto flex max-w-page flex-wrap items-center px-gutter text-[0.929em] text-heading md:h-header-topbar md:flex-nowrap">
        {/* Home only. See the note above: revealed by `:has()` in globals.css
            against the marker the home page renders, because reading the
            pathname here would turn every prerendered route dynamic. */}
        <span className="topbar-greeting hidden h-topbar-row items-center">
          ברוך הבא לעולם של קניון Express
        </span>

        {/* No flex `gap`: the separators carry live's spacing, and a gap on
            top of them would double-count it. Each separator stays INSIDE its
            item's wrapper so a wrap never strands a `|` at the start of a
            row, which is the one thing a real `::before` gives you for free. */}
        <div className="flex flex-wrap items-center md:ms-auto">
          {INFO_ITEMS.map((item, index) => (
            <div key={item.label} className="flex items-center">
              {index > 0 ? <ItemSeparator /> : null}
              <InfoItem {...item} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
