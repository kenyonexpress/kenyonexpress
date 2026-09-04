import SmartImage from '@/components/ui/SmartImage'
import { SIDE_BANNERS } from '@/lib/assets'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

const SB = ELECTRO_HERO.sideBanners
const BANNER_WIDTH = 200
const BANNER_IMAGE_HEIGHT = 80

type BannerLine = { text: string; bold?: boolean }[]

type PromoBanner = {
  id: string
  href: string
  image: string
  lines: BannerLine[]
}

/**
 * HEBREW, AND ABOUT THIS CATALOGUE.
 *
 * These three blocks arrived from the Electro template and were still selling
 * its demo catalogue in its language: "SHOP THE HOTTEST PRODUCTS", "CATCH BIG
 * DEALS ON THE CONSOLES", "LAPTOPS NOTEBOOKS AND MORE". Two of the three named
 * a product line this store does not carry -- KenyonExpress sells vouchers for
 * restaurants, spas, hotels, courses and tradespeople -- and all three were in
 * a language none of its customers shop in.
 *
 * The live site carries the same English (it runs the same theme), so there was
 * no Hebrew counterpart in `refs/` to copy: this is written copy, not measured
 * copy, and each line now matches the category it actually links to.
 *
 * The `bold` part of each line is the emphasis the template's design puts at
 * 13px against the 11px around it, kept because it is a layout fact and not a
 * language one.
 */
const PROMO_BANNERS: PromoBanner[] = [
  {
    id: 'das-1',
    href: '/category/hot-deals',
    image: SIDE_BANNERS[0],
    lines: [[{ text: 'הדילים ' }, { text: 'החמים', bold: true }, { text: ' של השבוע' }]],
  },
  {
    id: 'das-2',
    href: '/category/vacation',
    image: SIDE_BANNERS[1],
    lines: [[{ text: 'מבצעים ' }, { text: 'גדולים', bold: true }], [{ text: 'על צימרים ומלונות' }]],
  },
  {
    id: 'das-3',
    href: '/category/restaurants-cafes',
    image: SIDE_BANNERS[2],
    lines: [[{ text: 'מסעדות, בתי קפה' }, { text: ' ועוד', bold: true }]],
  },
]

function BannerText({ lines }: { lines: BannerLine[] }) {
  return (
    // dir and `uppercase` both went with the English. An RTL block inherits the
    // document direction, and Hebrew has no letter case for `uppercase` to act
    // on -- it was a no-op on the glyphs and a wrong signal to anything reading
    // the markup.
    <div className="da-text text-end font-normal text-heading">
      {lines.map((line, lineIdx) => (
        <span
          key={line.map((p) => p.text).join('|')}
          className={lineIdx > 0 ? 'block' : undefined}
          style={{ fontSize: 11, lineHeight: '13px' }}
        >
          {line.map((part) =>
            part.bold ? (
              <strong key={`${part.text}-b`} className="font-bold" style={{ fontSize: 13 }}>
                {part.text}
              </strong>
            ) : (
              <span key={`${part.text}-n`}>{part.text}</span>
            ),
          )}
        </span>
      ))}
    </div>
  )
}

/**
 * The banner's call to action.
 *
 * `Shop now` in Hebrew, and the chevron mirrored with it: a forward arrow
 * points in the direction reading advances, which is leftward here. ChevronRight
 * beside Hebrew points back at the text it came from.
 */
function ShopNowButton() {
  return (
    <span className="da-action mt-2 inline-flex items-center gap-2 self-end text-micro font-bold leading-none text-heading">
      <span
        aria-hidden="true"
        style={{
          width: SB.shopButtonSize,
          height: SB.shopButtonSize,
        }}
        className="flex shrink-0 items-center justify-center rounded-full bg-brand-secondary text-brand-dark"
      >
        <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      לרכישה
    </span>
  )
}

export default function HeroPromoBanners() {
  return (
    <div
      dir="rtl"
      style={{
        width: BANNER_WIDTH,
        minWidth: BANNER_WIDTH,
        maxWidth: BANNER_WIDTH,
        flex: `0 0 ${BANNER_WIDTH}px`,
      }}
      className="slider-das-block hidden h-full shrink-0 flex-col bg-white font-sans lg:flex"
    >
      {PROMO_BANNERS.map((banner, idx) => (
        <Link
          key={banner.id}
          href={banner.href}
          className={`group relative flex min-h-0 flex-1 items-stretch overflow-hidden px-3 py-4 transition-colors hover:bg-brand-accent/40 ${
            idx < PROMO_BANNERS.length - 1 ? 'border-b border-border-alt' : ''
          }`}
        >
          <div className="relative z-10 flex min-w-0 flex-1 flex-col items-end justify-center">
            <BannerText lines={banner.lines} />
            <ShopNowButton />
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-5 -end-2.5 z-0 w-20 rotate-[16deg]"
            style={{ height: BANNER_IMAGE_HEIGHT }}
          >
            <SmartImage
              src={banner.image}
              alt=""
              fill
              sizes="80px"
              quality={90}
              className="object-contain transition-transform duration-300 group-hover:scale-105"
              fallbackClassName="absolute inset-0"
            />
          </div>
        </Link>
      ))}
    </div>
  )
}
