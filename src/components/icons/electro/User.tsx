import type { SVGProps } from 'react'

/**
 * Electro's `ec-user` glyph (`font-electro` U+0072 "r"), as inline SVG.
 *
 * Extracted on 2026-10-05 from the theme's own `font-electro.ttf` with
 * fontTools (SVGPathPen through a y-flip), so the outline is the font's and not
 * a lookalike. The viewBox is the glyph's bbox in font units (1024/em) and the
 * default size is that bbox at the masthead's measured 22.8469px font-size.
 * Provenance and every number: refs/electro-header-icons.json.
 */
export default function User(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="158 -922 718 784"
      width="16.02"
      height="17.49"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M876 -148Q876 -145 876 -145Q876 -145 876 -148Q857 -145 840.5 -144.5Q824 -144 804 -144Q804 -208 781 -255.5Q758 -303 728 -338Q697 -372 648.5 -396.5Q600 -421 538 -424Q472 -428 419.5 -408.5Q367 -389 332 -354Q290 -315 262.5 -265Q235 -215 230 -138Q211 -138 194.5 -138Q178 -138 158 -138Q158 -138 158 -138.5Q158 -139 158 -144Q162 -207 179 -257Q197 -308 226 -347Q255 -386 294 -416Q332 -445 378 -466Q344 -487 317 -522Q290 -557 276.5 -599Q263 -641 264 -687Q265 -734 286 -778Q313 -836 372.5 -879Q432 -922 518 -922Q602 -922 658.5 -879.5Q715 -837 742 -778Q757 -744 764 -705Q771 -666 762 -624Q752 -575 723 -534Q694 -493 656 -466Q702 -445 740 -416Q777 -387 805.5 -348Q834 -309 852 -259Q870 -210 876 -148ZM338 -706Q326 -642 351.5 -596.5Q377 -551 404 -528Q446 -497 501.5 -496Q557 -495 604 -522Q646 -544 672.5 -589Q699 -634 692 -696Q688 -727 674 -753.5Q660 -780 640 -798Q613 -825 576.5 -841Q540 -857 486 -850Q429 -843 387.5 -804Q346 -765 338 -706Z" />
    </svg>
  )
}
