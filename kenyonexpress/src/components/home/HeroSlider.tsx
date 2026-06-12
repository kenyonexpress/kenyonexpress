'use client'

import SmartImage from '@/components/ui/SmartImage'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { HERO_SLIDER_BG, HERO_SLIDER_HEIGHT } from '@/lib/hero-singlefile-data'
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
const DOT_ACTIVE = '#fed700'
const DOT_INACTIVE = 'rgba(125, 125, 125, 0.5)'
const AUTOPLAY_MS = 5000

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
        className="absolute end-0 hidden overflow-hidden lg:block"
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
  <div className="pointer-events-none absolute start-0 top-0 z-10 w-1/2 max-w-[50%] ps-[31px]">
    {slide.title && (
      <span
        style={{ color: T.headline1.color }}
        className="mt-[52px] block text-[43px] font-light leading-[43px] lg:text-[58px] lg:leading-[58px]"
      >
        {slide.title}
      </span>
    )}
    {slide.title_secondary && (
      <span
        style={{ color: T.headline2.color, letterSpacing: '-1px' }}
        className={`mt-0 block text-[38px] font-light leading-[38px] lg:text-[51px] lg:leading-[51px] ${
          slide.title_secondary_indent ? 'ps-[70px] lg:ps-[70px]' : ''
        }`}
      >
        {slide.title_secondary}
      </span>
    )}
    {slide.badge_image_url && (
      <div className="relative mt-16 h-[46px] w-[286px] max-w-full lg:mt-24">
        <SmartImage
          src={slide.badge_image_url}
          alt=""
          fill
          sizes="572px"
          quality={90}
          className="object-contain object-start"
          fallbackClassName="absolute inset-0"
        />
      </div>
    )}
  </div>
  )
}

function ProductSlideCopy({ slide }: { slide: HeroSlide }) {
  const tagline = slide.tagline ?? slide.subtitle
  const line1Class = slide.title_indent ? 'ps-[21px] lg:ps-[21px]' : ''

  return (
  <div
    className="pointer-events-none absolute start-0 top-0 z-10 w-full max-w-[50%] pb-12 ps-[31px] lg:w-1/2"
    style={{ paddingTop: SLIDE.text.paddingTop }}
  >
    {(slide.title || slide.title_secondary) && (
      <h1 className="m-0 min-h-[86px] lg:min-h-[118px]">
        {slide.title && (
          <span
            style={{ color: T.headline1.color }}
            className={`block text-[43px] font-light leading-[1.08] lg:text-[58px] ${line1Class}`}
          >
            {slide.title}
          </span>
        )}
        {slide.title_secondary && (
          <span
            style={{ color: T.headline2.color, letterSpacing: '-1px' }}
            className={`mt-0.5 block text-[38px] font-light leading-[1.08] lg:mt-1 lg:text-[51px] ${
              slide.title_secondary_indent ? 'ps-[47px] lg:ps-[47px]' : ''
            }`}
          >
            {slide.title_secondary}
          </span>
        )}
      </h1>
    )}

    {tagline && (
      <p
        style={{ color: T.tagline.color }}
        className="mt-3 text-[11px] font-bold leading-[11px] lg:mt-4 lg:text-[19px] lg:leading-[19px]"
      >
        {tagline}
      </p>
    )}

    {slide.standard_line && (
      <p
        dir="ltr"
        style={{ color: T.headline1.color }}
        className="mt-4 text-[11px] font-bold leading-[15px] lg:mt-5 lg:text-[15px]"
      >
        {slide.standard_line}
      </p>
    )}

    {slide.promo_small && (
      <p
        dir="ltr"
        style={{ color: T.priceLabel.color }}
        className="mt-2 text-[12px] leading-[13px] lg:mt-3 lg:text-[13px]"
      >
        {slide.promo_small}
      </p>
    )}

    {slide.promo_large && (
      <p
        dir="ltr"
        style={{ color: T.price.color }}
        className="mt-0 text-[35px] font-bold leading-[35px] lg:text-[50px] lg:leading-[50px]"
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
    className="pointer-events-none absolute start-0 top-0 z-10 w-full max-w-[50%] pb-12 ps-[31px] lg:w-1/2"
    style={{ paddingTop: SLIDE.text.paddingTop }}
  >
    <h1 className="m-0 min-h-[86px] lg:min-h-[118px]">
      {slide.title && (
        <span
          style={{ color: T.headline1.color }}
          className="block text-[43px] font-light leading-[1.08] lg:text-[58px]"
        >
          {slide.title}
        </span>
      )}
      {slide.title_secondary && (
        <span
          style={{ color: T.headline2.color, letterSpacing: '-1px' }}
          className={`mt-0.5 block text-[38px] font-light leading-[1.08] lg:mt-1 lg:text-[51px] ${
            slide.title_secondary_indent ? 'ps-[47px]' : ''
          }`}
        >
          {slide.title_secondary}
        </span>
      )}
    </h1>
    {slide.tagline && (
      <p
        style={{ color: T.tagline.color }}
        className="mt-4 text-[11px] font-bold leading-[11px] lg:mt-5 lg:text-[19px] lg:leading-[19px]"
      >
        {slide.tagline}
      </p>
    )}
    {slide.promo_small && (
      <p
        dir="ltr"
        style={{ color: T.headline1.color }}
        className="mt-3 ps-[11px] text-[12px] font-normal leading-[15px] lg:mt-4 lg:text-[15px]"
      >
        {slide.promo_small}
      </p>
    )}
    {slide.promo_large && (
      <p
        dir="ltr"
        style={{ color: T.price.color }}
        className="mt-0 ps-[10px] text-[35px] font-bold leading-[40px] lg:text-[45px] lg:leading-[50px]"
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
  const [active, setActive] = useState(0)
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
      style={{ backgroundColor: HERO_SLIDER_BG, height: HERO_SLIDER_HEIGHT, minHeight: HERO_SLIDER_HEIGHT }}
      className="relative w-full min-w-0 overflow-hidden border-x border-gray-200 font-sans"
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
            className={`absolute inset-0 transition-[opacity,transform] duration-700 ease-in-out ${
              isActive
                ? 'z-10 translate-x-0 opacity-100'
                : 'pointer-events-none z-0 translate-x-3 opacity-0'
            }`}
          >
            <SlideImage slide={slide} priority={isActive && i === 0} />
            <SlideCopy slide={slide} />
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
