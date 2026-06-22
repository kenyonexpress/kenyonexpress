import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { SIDE_BANNERS } from '@/lib/assets'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import SmartImage from '@/components/ui/SmartImage'

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

const PROMO_BANNERS: PromoBanner[] = [
  {
    id: 'das-1',
    href: '/category/hot-deals',
    image: SIDE_BANNERS[0],
    lines: [[{ text: 'SHOP THE ' }, { text: 'HOTTEST', bold: true }, { text: ' PRODUCTS' }]],
  },
  {
    id: 'das-2',
    href: '/category/phones-computers',
    image: SIDE_BANNERS[1],
    lines: [
      [{ text: 'CATCH BIG ' }, { text: 'DEALS', bold: true }, { text: ' ON' }],
      [{ text: 'THE CONSOLES' }],
    ],
  },
  {
    id: 'das-3',
    href: '/category/phones-computers',
    image: SIDE_BANNERS[2],
    lines: [
      [{ text: 'LAPTOPS NOTEBOOKS' }],
      [{ text: 'AND MORE', bold: true }],
    ],
  },
]

function BannerText({ lines }: { lines: BannerLine[] }) {
  return (
    <div dir="ltr" className="da-text text-end font-normal uppercase text-heading">
      {lines.map((line, lineIdx) => (
        <span
          key={lineIdx}
          className={lineIdx > 0 ? 'block' : undefined}
          style={{ fontSize: 11, lineHeight: '13px' }}
        >
          {line.map((part, i) =>
            part.bold ? (
              <strong key={i} className="font-bold" style={{ fontSize: 13 }}>
                {part.text}
              </strong>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </span>
      ))}
    </div>
  )
}

function ShopNowButton() {
  return (
    <span
      dir="ltr"
      className="da-action mt-2 inline-flex items-center gap-2 self-end text-[11px] font-bold leading-none text-heading"
    >
      <span
        aria-hidden="true"
        style={{
          width: SB.shopButtonSize,
          height: SB.shopButtonSize,
        }}
        className="flex shrink-0 items-center justify-center rounded-full bg-brand-secondary text-brand-dark"
      >
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      </span>
      Shop now
    </span>
  )
}

export default function HeroPromoBanners() {
  return (
    <div
      dir="rtl"
      style={{ width: BANNER_WIDTH, minWidth: BANNER_WIDTH, maxWidth: BANNER_WIDTH, flex: `0 0 ${BANNER_WIDTH}px` }}
      className="slider-das-block hidden h-full shrink-0 flex-col bg-white font-sans lg:flex"
    >
      {PROMO_BANNERS.map((banner, idx) => (
        <Link
          key={banner.id}
          href={banner.href}
          className={`group relative flex min-h-0 flex-1 items-stretch overflow-hidden px-3 py-4 transition-colors hover:bg-brand-accent/40 ${
            idx < PROMO_BANNERS.length - 1 ? 'border-b border-gray-200' : ''
          }`}
        >
          <div className="relative z-10 flex min-w-0 flex-1 flex-col items-end justify-center">
            <BannerText lines={banner.lines} />
            <ShopNowButton />
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-[-20px] end-[-10px] z-0 w-[80px] rotate-[16deg]"
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
