import { HERO_BRAND_BANNERS } from '@/lib/hero-brand-banners'
import { HERO_SINGLEFILE_SLIDES } from '@/lib/hero-singlefile-data'
import Image from 'next/image'
import Link from 'next/link'

/**
 * Mobile hero carousel (below md). CSS scroll-snap, no script. Geometry is
 * Electro v7's handheld slider as refs/electro_v7_380.png paints it: a 16px
 * inset and 192px tall (C195; it was a 240px full-bleed cover photo). Each
 * slide is the old site's copy beside its wp_import product shot, the same
 * anatomy the desktop HeroSection uses.
 */
export default function HeroMobile() {
  const slides = HERO_SINGLEFILE_SLIDES.filter((s) => s.image_url)
  return (
    <section
      aria-label="מבצעים"
      dir="rtl"
      className="mx-4 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
      style={{ height: 192 }}
    >
      {slides.map((s, i) => {
        // The slide copy is the old site's own (rs-18 and the four after it);
        // the anatomy is Electro v7's handheld slide: copy at the start, the
        // product shot contained at the end, on the slider tint.
        const Head = i === 0 ? 'h1' : 'span'
        return (
          <Link
            key={s.id}
            href={s.link_url ?? '/products'}
            className="flex h-full min-w-full snap-start items-center gap-2 bg-hero-slider-bg px-4"
          >
            <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-start text-heading">
              <Head className="m-0 flex flex-col text-2xl font-light leading-tight">
                {s.title && <span>{s.title}</span>}
                {s.title_secondary && <span>{s.title_secondary}</span>}
              </Head>
              {(s.tagline ?? s.standard_line) && (
                <span className="text-xs font-bold">{s.tagline ?? s.standard_line}</span>
              )}
              {s.promo_large && (
                <span className="text-sm font-bold">
                  {s.promo_small} <span className="text-price">{s.promo_large}</span>
                </span>
              )}
            </span>
            <span className="relative block h-full w-1/2 shrink-0">
              <Image
                src={s.image_url as string}
                alt=""
                fill
                sizes="50vw"
                priority={i === 0}
                fetchPriority={i === 0 ? 'high' : 'auto'}
                style={{ objectFit: 'contain' }}
              />
            </span>
          </Link>
        )
      })}
      {/* C137: the Apple and Tesla products banners close the carousel. They sit
          off-screen along the x axis, where lazy images never start loading
          (M01-c348), so their small logo and photo load eagerly. */}
      {HERO_BRAND_BANNERS.map((b) => (
        <Link
          key={b.id}
          href={b.href}
          prefetch={false}
          data-hero-banner={b.id}
          className="relative flex h-full min-w-full snap-start items-center gap-4 bg-white px-5"
        >
          <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-start">
            <Image
              src={b.logo}
              alt=""
              width={48}
              height={48}
              loading="eager"
              className="size-12 object-contain"
            />
            <span className="text-2xl font-bold text-heading">{b.title}</span>
            <span className="text-base text-muted-foreground">{b.subtitle}</span>
            <span className="mt-1 text-sm font-bold text-link">{b.cta}</span>
          </span>
          <span className="relative block size-hero-banner-photo-mobile shrink-0">
            <Image
              src={b.photo ?? b.logo}
              alt=""
              fill
              sizes="180px"
              loading="eager"
              style={{ objectFit: 'contain' }}
            />
          </span>
        </Link>
      ))}
    </section>
  )
}
