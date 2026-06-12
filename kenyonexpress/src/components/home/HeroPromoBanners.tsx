import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { KE_LIVE_SIDE_BANNERS } from '@/lib/ke-live-hero-data'
import SmartImage from '@/components/ui/SmartImage'

const SB = ELECTRO_HERO.sideBanners
const BT = ELECTRO_HERO.typography.bannerText

function renderBannerText(textHtml: string) {
  return textHtml.split('\n').map((line, lineIdx) => (
    <span key={lineIdx} className={lineIdx > 0 ? 'block' : undefined}>
      {line.split(/(\*\*[^*]+\*\*)/).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={i} className="font-bold">
              {part.slice(2, -2)}
            </strong>
          )
        }
        return part
      })}
    </span>
  ))
}

function ShopNowButton() {
  return (
    <span
      dir="ltr"
      style={{ fontSize: BT.size, color: BT.color }}
      className="da-action inline-flex items-center gap-1.5 font-bold leading-none"
    >
      Shop now
      <span
        aria-hidden="true"
        style={{
          width: SB.shopButtonSize,
          height: SB.shopButtonSize,
          backgroundColor: SB.shopButtonColor,
        }}
        className="flex shrink-0 items-center justify-center rounded-full text-brand-dark"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </span>
    </span>
  )
}

export default function HeroPromoBanners() {
  return (
    <div
      dir="rtl"
      style={{ width: SB.width, paddingTop: SB.offsetTop }}
      className="slider-das-block hidden shrink-0 flex-col bg-white font-sans lg:flex"
    >
      {KE_LIVE_SIDE_BANNERS.map((banner, idx) => (
        <Link
          key={banner.id}
          href={banner.href}
          className={`group flex flex-1 items-stretch border-gray-200 px-3 py-3 transition-colors hover:bg-brand-accent/40 ${
            idx < KE_LIVE_SIDE_BANNERS.length - 1 ? 'border-b' : ''
          }`}
        >
          <div className="relative me-3 h-[70px] w-[70px] shrink-0 self-center lg:h-[140px] lg:w-[140px]">
            <SmartImage
              src={banner.image}
              alt=""
              fill
              sizes="280px"
              quality={90}
              className="object-contain transition-transform duration-300 group-hover:scale-105"
              fallbackClassName="absolute inset-0 rounded-md"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-1">
            <div
              style={{ fontSize: BT.size, lineHeight: `${BT.lineHeight}px`, color: BT.color }}
              className="da-text font-normal"
            >
              {renderBannerText(banner.textHtml)}
            </div>
            <ShopNowButton />
          </div>
        </Link>
      ))}
    </div>
  )
}
