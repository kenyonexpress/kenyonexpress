import { HERO_BRAND_BANNERS } from '@/lib/hero-brand-banners'
import Image from 'next/image'
import Link from 'next/link'

/**
 * The strip under the hero slider (md and up): the Apple and Tesla products
 * banners, side by side, in the 170px slot the locked HeroSection reserves.
 *
 * This slot used to hold the standalone city cards row, removed by decision
 * 15.10.2026 (nationwide only, no city row). HeroSection.tsx is a locked file
 * and still mounts `CitiesRow`, so that module now re-exports this component.
 */
export default function HeroBrandBanners() {
  return (
    <section aria-label="מותגים מובילים" className="bg-white font-sans">
      <ul className="m-0 grid h-hero-strip list-none grid-cols-2 p-0">
        {HERO_BRAND_BANNERS.map((b) => (
          <li key={b.id} className="h-full border-e border-border-alt first:border-s">
            <Link
              href={b.href}
              prefetch={false}
              data-hero-banner={b.id}
              className="group flex h-full items-center gap-3 px-4 transition-shadow hover:shadow-[0_0_18px_-2px_rgba(0,0,0,0.2)]"
            >
              <span className="flex min-w-0 flex-1 flex-col items-start gap-1 text-start">
                <Image
                  src={b.logo}
                  alt={b.id === 'apple' ? 'Apple' : 'Tesla'}
                  width={44}
                  height={44}
                  loading="lazy"
                  className="size-11 object-contain"
                />
                <span className="text-base font-bold leading-tight text-heading">{b.title}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{b.subtitle}</span>
                <span className="mt-1 text-sm font-bold text-link group-hover:underline">
                  {b.cta}
                </span>
              </span>
              {b.photo ? (
                <span className="relative block size-hero-banner-photo shrink-0">
                  <Image
                    src={b.photo}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="130px"
                    className="object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </span>
              ) : (
                <span className="relative block size-hero-banner-photo shrink-0">
                  <Image
                    src={b.logo}
                    alt=""
                    fill
                    loading="lazy"
                    sizes="130px"
                    className="object-contain transition-transform duration-300 group-hover:scale-105"
                  />
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
