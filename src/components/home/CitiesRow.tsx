import SmartImage from '@/components/ui/SmartImage'
import { CITIES } from '@/data/cities'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import Link from 'next/link'
import type { CSSProperties } from 'react'

const C = ELECTRO_HERO.categoryStrip

// Same chrome as the Electro categories strip it replaces: cell width, border,
// padding, image slot, label type and hover shadow all come from
// ELECTRO_HERO.categoryStrip. Content is ours: the city name and a flat city
// illustration (public/images/placeholder/city-<slug>.svg, Electro palette).
// Twenty cells scroll horizontally five at a time, so the row's box is unchanged.
export default function CitiesRow() {
  const stripVars = {
    height: C.height,
    '--cat-hover-shadow': C.hoverShadow,
  } as CSSProperties

  return (
    <section aria-label="ערים" className="bg-white font-sans">
      <div className="w-full">
        <ul
          className="m-0 flex w-full list-none flex-nowrap overflow-x-auto p-0 [scrollbar-width:none]"
          style={stripVars}
        >
          {CITIES.map((city) => (
            <li
              key={city.slug}
              // 20% from md, not lg: live's li.category is 146px at 768
              // (x622 w146, five across the 729 column) exactly as at 1440.
              // Two 384px cells here were measured against that on
              // 2026-10-20 as part of the 41.82% home/768 run.
              className="flex w-1/2 flex-[0_0_50%] border-e first:border-s md:w-[20%] md:flex-[0_0_20%]"
              style={{ borderColor: C.borderColor }}
            >
              <Link
                href={`/c/${city.slug}`}
                className="group mx-auto flex h-full flex-col items-center justify-start text-center transition-shadow hover:shadow-[var(--cat-hover-shadow)] max-lg:min-h-11 max-lg:justify-center"
                style={{ paddingInline: C.itemPaddingInline, paddingTop: C.itemPaddingTop }}
              >
                <div
                  className="relative"
                  style={{
                    width: C.image.size,
                    height: C.image.size,
                    marginBottom: C.image.marginBottom,
                  }}
                >
                  <SmartImage
                    src={`/images/placeholder/city-${city.slug}.svg`}
                    alt=""
                    fill
                    unoptimized
                    loading="lazy"
                    sizes={`${C.image.size}px`}
                    className="object-contain transition-transform duration-300 group-hover:scale-105"
                    fallbackClassName="absolute inset-0"
                    iconSize={C.image.fallbackIconSize}
                  />
                </div>
                <h2
                  className="m-0 whitespace-nowrap leading-snug"
                  style={{
                    fontSize: C.label.size,
                    fontWeight: C.label.weight,
                    color: C.label.color,
                  }}
                >
                  {city.name}
                </h2>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
