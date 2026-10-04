import type { SVGProps } from 'react'

/**
 * Electro's `ec-favorites` glyph (`font-electro` U+0067 "g"), as inline SVG.
 *
 * Extracted on 2026-10-05 from the theme's own `font-electro.ttf` with
 * fontTools (SVGPathPen through a y-flip), so the outline is the font's and not
 * a lookalike. The viewBox is the glyph's bbox in font units (1024/em) and the
 * default size is that bbox at the masthead's measured 22.8469px font-size.
 * Provenance and every number: refs/electro-header-icons.json.
 */
export default function Favorites(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="68 -906.39 895.52 808.39"
      width="19.98"
      height="18.04"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M512 -794Q542 -828 585.5 -860.5Q629 -893 686 -902Q738 -909 782 -898Q825 -887 859.5 -863Q894 -839 917 -804Q941 -770 952 -732Q964 -690 963.5 -638Q963 -586 948 -542Q926 -485 891 -439Q855 -393 812 -352.5Q769 -312 723 -275Q677 -238 634 -200Q624 -188 609.5 -174Q595 -160 578 -148Q568 -138 552 -118Q536 -98 518 -98Q502 -98 490 -110.5Q478 -123 466 -138Q428 -180 383 -217Q339 -254 294 -291Q249 -328 208 -368Q166 -408 134 -456Q117 -481 101 -514Q86 -548 77 -586.5Q68 -625 68 -666Q68 -707 82 -748Q104 -812 158 -857.5Q212 -903 296 -906Q377 -910 425 -873Q473 -836 512 -794ZM788 -450Q819 -481 848.5 -523.5Q878 -566 886 -620Q893 -684 869.5 -732.5Q846 -781 804 -804Q789 -811 764 -817.5Q739 -824 712 -824Q678 -821 648 -802Q618 -783 600 -768Q591 -761 580.5 -750Q570 -739 558 -728Q546 -716 539 -704Q532 -692 512 -692Q497 -692 485.5 -704Q474 -716 466 -728Q454 -738 443.5 -749Q433 -760 424 -768Q402 -787 374 -805.5Q346 -824 308 -824Q235 -821 191 -775Q147 -729 144 -660Q140 -611 155.5 -571.5Q171 -532 194 -502Q225 -458 266 -419Q307 -381 350.5 -344.5Q394 -308 437 -271Q479 -235 512 -194Q543 -228 577 -260Q611 -291 646.5 -322Q682 -353 718 -384Q753 -415 788 -450Z" />
    </svg>
  )
}
