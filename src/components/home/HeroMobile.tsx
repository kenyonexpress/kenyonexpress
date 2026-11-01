import { HERO_SINGLEFILE_SLIDES } from '@/lib/hero-singlefile-data'
import Image from 'next/image'
import Link from 'next/link'

/**
 * Mobile hero carousel (below md). CSS scroll-snap, no script: each slide is
 * a real catalogue photograph (C130, no grey placeholders) with its Hebrew
 * title over a dark scrim. The desktop hero is the locked HeroSection.
 */
export default function HeroMobile() {
  const slides = HERO_SINGLEFILE_SLIDES.filter((s) => s.image_url)
  return (
    <section
      aria-label="מבצעים"
      dir="rtl"
      className="flex w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
      style={{ height: 240 }}
    >
      {slides.map((s, i) => (
        <Link
          key={s.id}
          href={s.link_url ?? '/products'}
          className="relative block h-full min-w-full snap-start"
        >
          <Image
            src={s.image_url as string}
            alt=""
            fill
            sizes="100vw"
            priority={i === 0}
            style={{ objectFit: 'cover' }}
          />
          <span className="home-hero-scrim absolute inset-0 flex flex-col justify-end gap-1 p-4 text-white">
            {i === 0 ? (
              <h1 className="m-0 text-2xl font-bold">קניון EXPRESS</h1>
            ) : (
              <span className="text-2xl font-bold">
                {[s.title, s.title_secondary].filter(Boolean).join(' ')}
              </span>
            )}
            <span className="text-base">{s.tagline ?? 'מסדרים לך בילוי'}</span>
          </span>
        </Link>
      ))}
    </section>
  )
}
