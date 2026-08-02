'use client'

import SmartImage from '@/components/ui/SmartImage'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { HERO_SLIDER_BG } from '@/lib/hero-singlefile-data'
import { useCallback, useEffect, useState } from 'react'

export type HeroSlideImageLayout = {
  offsetTop: number
  widthPercent: number
  minHeight?: number
}

export type HeroSlide = {
  id: string
  variant: 'welcome' | 'product' | 'app'
  title: string | null
  title_secondary?: string | null
  /** rs-layer xo:78 — second headline indented */
  title_secondary_indent?: boolean
  /** rs-layer xo:52 — first headline indented (תצוגה slide) */
  title_indent?: boolean
  tagline?: string | null
  standard_line?: string | null
  promo_small?: string | null
  promo_large?: string | null
  price_label?: string | null
  price?: string | null
  /** @deprecated use tagline */
  subtitle?: string | null
  image_url: string | null
  badge_image_url?: string | null
  link_url: string | null
  imageLayout?: HeroSlideImageLayout
}

const T = ELECTRO_HERO.typography
const SLIDE = ELECTRO_HERO.slider
const DOT_ACTIVE = 'var(--color-brand-primary)'
const DOT_INACTIVE = 'rgba(125, 125, 125, 0.5)'
const AUTOPLAY_MS = 5000

/**
 * The rs-layer type ramp, measured off the live Revolution Slider at both
 * breakpoints. Every number below appeared inline three or four times across
 * the three slide variants; naming each ramp once means a remeasure edits one
 * line instead of hunting for repeats.
 *
 * These stay component-local rather than becoming @theme tokens because each
 * value is used only by this slider. A token in globals.css claims a value is
 * part of the site's scale; these are one component's measurements.
 */
const RS = {
  /** headline 1: rs-layer .tp-caption headline */
  h1: 'text-[43px] font-light lg:text-[58px]',
  h1Leading: 'leading-[43px] lg:leading-[58px]',
  /** headline 2: the lighter second line, always 5px shy of h1 */
  h2: 'text-[38px] font-light lg:text-[51px]',
  h2Leading: 'leading-[38px] lg:leading-[51px]',
  /** tagline strip under the headlines */
  tagline: 'text-[11px] font-bold leading-[11px] lg:text-[19px] lg:leading-[19px]',
  /** "standard" caption line (product slide only) */
  standard: 'text-[11px] font-bold leading-[15px] lg:text-[15px]',
  /** small promo line above the big price */
  promoSmall: 'text-[12px] leading-[13px] lg:text-[13px]',
  promoSmallWelcome: 'text-[12px] font-normal leading-[15px] lg:text-[15px]',
  /** the big promo price */
  promoLarge: 'text-[35px] font-bold leading-[35px] lg:text-[50px] lg:leading-[50px]',
  promoLargeWelcome: 'text-[35px] font-bold leading-[40px] lg:text-[45px] lg:leading-[50px]',
  /** copy column: 31px gutter from the slide edge */
  copyColumn: 'pointer-events-none absolute end-0 top-0 z-10 max-w-[50%] pe-[31px] text-end',
  /** headline box reserves its live height so shorter titles do not reflow */
  headBox: 'm-0 min-h-[86px] lg:min-h-[118px]',
  /** headline 2 rides -1px tighter than headline 1 on every variant */
  h2Tracking: '-1px',
  /** app slide: headline starts 52px down, badge is a fixed 46x286 box */
  appHeadOffset: 'mt-[52px]',
  badgeBox: 'h-[46px] w-[286px]',
  /** 2x the badge width, so the 2x raster is the one that gets fetched */
  badgeSizes: '572px',
  /** welcome slide insets its two promo lines by different amounts */
  promoSmallInset: 'ps-[11px]',
  promoLargeInset: 'ps-[10px]',
  /** rs-layer xo offsets: three distinct measured indents */
  indentSm: 'pe-[21px]',
  indentMd: 'pe-[47px]',
  indentLg: 'pe-[70px]',
} as const

const HERO_IMAGE_SIZES = `(max-width: 1024px) 100vw, ${SLIDE.width * 2}px`

function HeroSlideImage({ src, priority }: { src: string; priority: boolean }) {
  const isGif = src.endsWith('.gif')

  return (
    <SmartImage
      src={src}
      alt=""
      fill
      priority={priority}
      quality={95}
      sizes={HERO_IMAGE_SIZES}
      unoptimized={isGif}
      className="min-h-full min-w-full object-contain object-center"
      fallbackClassName="absolute inset-0"
      iconSize={48}
    />
  )
}

function SlideImage({
  slide,
  priority,
}: {
  slide: HeroSlide
  priority: boolean
}) {
  if (!slide.image_url) return null

  const layout = slide.imageLayout ?? {
    offsetTop: ELECTRO_HERO.slider.image.offsetTop,
    widthPercent: ELECTRO_HERO.slider.image.widthPercent,
    minHeight: ELECTRO_HERO.slider.image.height,
  }

  return (
    <>
      <div
        className="absolute start-0 hidden overflow-hidden lg:block"
        style={{
          top: layout.offsetTop,
          width: `${layout.widthPercent}%`,
          height: SLIDE.height - Math.max(0, layout.offsetTop),
        }}
      >
        <div className="relative h-full w-full" style={{ minHeight: layout.minHeight }}>
          <HeroSlideImage src={slide.image_url} priority={priority} />
        </div>
      </div>
      <div className="absolute end-0 bottom-0 h-[42%] w-full overflow-hidden lg:hidden">
        <HeroSlideImage src={slide.image_url} priority={priority} />
      </div>
    </>
  )
}

function AppSlideCopy({ slide }: { slide: HeroSlide }) {
  return (
    <div className={`${RS.copyColumn} w-1/2`}>
      {slide.title && (
        <span
          style={{ color: T.headline1.color }}
          className={`${RS.appHeadOffset} block ${RS.h1} ${RS.h1Leading}`}
        >
          {slide.title}
        </span>
      )}
      {slide.title_secondary && (
        <span
          style={{ color: T.headline2.color, letterSpacing: RS.h2Tracking }}
          className={`mt-0 block ${RS.h2} ${RS.h2Leading} ${
            slide.title_secondary_indent ? RS.indentLg : ''
          }`}
        >
          {slide.title_secondary}
        </span>
      )}
      {slide.badge_image_url && (
        <div className={`relative ms-auto mt-16 max-w-full lg:mt-24 ${RS.badgeBox}`}>
          <SmartImage
            src={slide.badge_image_url}
            alt=""
            fill
            sizes={RS.badgeSizes}
            quality={90}
            className="object-contain object-left"
            fallbackClassName="absolute inset-0"
          />
        </div>
      )}
    </div>
  )
}

function ProductSlideCopy({ slide }: { slide: HeroSlide }) {
  const tagline = slide.tagline ?? slide.subtitle
  const line1Class = slide.title_indent ? RS.indentSm : ''

  return (
    <div
      className={`${RS.copyColumn} w-full pb-12 lg:w-1/2`}
      style={{ paddingTop: SLIDE.text.paddingTop }}
    >
      {(slide.title || slide.title_secondary) && (
        <h1 className={RS.headBox}>
          {slide.title && (
            <span
              style={{ color: T.headline1.color }}
              className={`block ${RS.h1} leading-[1.08] ${line1Class}`}
            >
              {slide.title}
            </span>
          )}
          {slide.title_secondary && (
            <span
              style={{ color: T.headline2.color, letterSpacing: RS.h2Tracking }}
              className={`mt-0.5 block ${RS.h2} leading-[1.08] lg:mt-1 ${
                slide.title_secondary_indent ? RS.indentMd : ''
              }`}
            >
              {slide.title_secondary}
            </span>
          )}
        </h1>
      )}

      {tagline && (
        <p style={{ color: T.tagline.color }} className={`mt-3 lg:mt-4 ${RS.tagline}`}>
          {tagline}
        </p>
      )}

      {slide.standard_line && (
        <p
          dir="ltr"
          style={{ color: T.headline1.color }}
          className={`mt-4 text-start lg:mt-5 ${RS.standard}`}
        >
          {slide.standard_line}
        </p>
      )}

      {slide.promo_small && (
        <p
          dir="ltr"
          style={{ color: T.priceLabel.color }}
          className={`mt-2 text-start lg:mt-3 ${RS.promoSmall}`}
        >
          {slide.promo_small}
        </p>
      )}

      {slide.promo_large && (
        <p
          dir="ltr"
          style={{ color: T.price.color }}
          className={`mt-0 text-start ${RS.promoLarge}`}
        >
          {slide.promo_large}
        </p>
      )}
    </div>
  )
}

function WelcomeSlideCopy({ slide }: { slide: HeroSlide }) {
  return (
    <div
      className={`${RS.copyColumn} w-full pb-12 lg:w-1/2`}
      style={{ paddingTop: SLIDE.text.paddingTop }}
    >
      <h1 className={RS.headBox}>
        {slide.title && (
          <span style={{ color: T.headline1.color }} className={`block ${RS.h1} leading-[1.08]`}>
            {slide.title}
          </span>
        )}
        {slide.title_secondary && (
          <span
            style={{ color: T.headline2.color, letterSpacing: RS.h2Tracking }}
            className={`mt-0.5 block ${RS.h2} leading-[1.08] lg:mt-1 ${
              slide.title_secondary_indent ? RS.indentMd : ''
            }`}
          >
            {slide.title_secondary}
          </span>
        )}
      </h1>
      {slide.tagline && (
        <p style={{ color: T.tagline.color }} className={`mt-4 lg:mt-5 ${RS.tagline}`}>
          {slide.tagline}
        </p>
      )}
      {slide.promo_small && (
        <p
          dir="ltr"
          style={{ color: T.headline1.color }}
          className={`mt-3 text-start lg:mt-4 ${RS.promoSmallInset} ${RS.promoSmallWelcome}`}
        >
          {slide.promo_small}
        </p>
      )}
      {slide.promo_large && (
        <p
          dir="ltr"
          style={{ color: T.price.color }}
          className={`mt-0 text-start ${RS.promoLargeInset} ${RS.promoLargeWelcome}`}
        >
          {slide.promo_large}
        </p>
      )}
    </div>
  )
}

function SlideCopy({ slide }: { slide: HeroSlide }) {
  if (slide.variant === 'app') return <AppSlideCopy slide={slide} />
  if (slide.variant === 'welcome') return <WelcomeSlideCopy slide={slide} />
  return <ProductSlideCopy slide={slide} />
}

export default function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const [active, setActive] = useState(() => {
    const appIndex = slides.findIndex((s) => s.id === 'rs-19')
    return appIndex >= 0 ? appIndex : 0
  })
  const [paused, setPaused] = useState(false)

  const goTo = useCallback(
    (index: number) => {
      if (slides.length === 0) return
      setActive(((index % slides.length) + slides.length) % slides.length)
    },
    [slides.length],
  )

  useEffect(() => {
    if (slides.length <= 1 || paused) return
    const t = setInterval(() => goTo(active + 1), AUTOPLAY_MS)
    return () => clearInterval(t)
  }, [active, goTo, paused, slides.length])

  if (slides.length === 0) return null

  return (
    <div
      dir="rtl"
      style={{ backgroundColor: HERO_SLIDER_BG }}
      className="relative h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden border-x border-gray-200 font-sans"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((slide, i) => {
        const isActive = i === active

        return (
          <div
            key={slide.id}
            aria-hidden={!isActive}
            className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
              isActive ? 'z-10 opacity-100' : 'pointer-events-none z-0 opacity-0'
            }`}
          >
            <SlideImage slide={slide} priority={isActive && i === 0} />
            <div className="[&_*]:!animate-none [&_*]:!transition-none">
              <SlideCopy slide={slide} />
            </div>
          </div>
        )
      })}

      {slides.length > 1 && (
        <div
          aria-label="ניווט שקופיות"
          className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2"
        >
          {slides.map((s, i) => {
            const isCurrent = i === active
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`שקופית ${i + 1}`}
                aria-current={isCurrent ? 'true' : undefined}
                style={{
                  width: isCurrent ? 30 : 8,
                  height: 8,
                  backgroundColor: isCurrent ? DOT_ACTIVE : DOT_INACTIVE,
                  borderRadius: isCurrent ? 3 : 9999,
                }}
                className="shrink-0 border-0 p-0 transition-all duration-200 hover:opacity-80"
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
