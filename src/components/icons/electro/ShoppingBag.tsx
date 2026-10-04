import type { SVGProps } from 'react'

/**
 * Electro's `ec-shopping-bag` glyph (`font-electro` U+006E "n"), as inline SVG.
 *
 * Extracted on 2026-10-05 from the theme's own `font-electro.ttf` with
 * fontTools (SVGPathPen through a y-flip), so the outline is the font's and not
 * a lookalike. The viewBox is the glyph's bbox in font units (1024/em) and the
 * default size is that bbox at the masthead's measured 22.8469px font-size.
 * Provenance and every number: refs/electro-header-icons.json.
 */
export default function ShoppingBag(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="128 -942 742 880"
      width="16.56"
      height="19.63"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M834 -722H692V-758Q692 -834 638 -888Q584 -942 506 -942Q430 -942 374 -888.5Q318 -835 318 -758V-574H390V-646H538V-722H394V-758Q394 -804 425 -835Q456 -866 506 -866Q552 -866 583 -835.5Q614 -805 614 -758V-574H686V-646H768L804 -134H210L240 -646H246V-722H174L128 -62H870Z" />
    </svg>
  )
}
