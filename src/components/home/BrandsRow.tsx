import { getHomeBrands } from '@/lib/homepage/below-fold'
import { ArrowLeft } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

/**
 * The brands row (UX11): the merchants that have something on sale, as a
 * strip of logo tiles under the hot coupons, each tile the link to that
 * merchant's storefront (`/s/[id]`), the heading's link to the directory.
 *
 * CONTENT FROM THE DATABASE, SHAPE FROM ELECTRO. Live has no brand strip at
 * all (the only "Brands" in its markup is Font Awesome 5 Brands;
 * `live-home-sections.test.ts`), and `docs/COMPONENT-QUEUE.md` row 09 refused
 * one on that ground while the queue was a parity queue. This is the UX
 * queue: the row is the merchant directory (`/merchants`, STEP 63) brought to
 * the home page, and its cell is Electro's brand cell, measured off
 * `refs/electro-home-v7_computed.json`: an 88px strip at 1440, five 234x50
 * cells in the 1170 container, a 167x50 image centred in each. Here the cell
 * is `--spacing-brand-tile-h` tall with the logo box `--spacing-brand-logo-w`
 * by `--spacing-brand-logo-h` (tokens.css).
 *
 * GREY AT REST, COLOUR UNDER THE POINTER, ONLY WHERE THERE IS A POINTER. The
 * logo is `grayscale(1)` and dimmed and the wordmark is muted ink until the
 * tile is hovered or its link focused, which lets seven different brand
 * palettes sit in one row without shouting. The rule is wrapped in
 * `@media (hover: hover)`: on a phone nothing is ever hovered, so an
 * unconditional rule would have shown every logo permanently grey, which is
 * the opposite of the point. Keyboard users get colour on `:focus-visible`.
 *
 * THE STRIP SCROLLS ON A PHONE AND IS A GRID FROM 768. Below 768 the list is
 * a single row of `--spacing-brand-tile-w` tiles with `overflow-x: auto`,
 * snap points and no painted scrollbar (the benefit bar's own recipe, which
 * is live's `features-list`); from 768 it is three columns, from 1200 five,
 * Electro's count. Each tile is one row height (`grid-auto-rows: 1fr`).
 *
 * A WORDMARK IS THE DESIGN, NOT A FALLBACK. Measured on production
 * 2026-10-14: seven active merchants, one logo. A tile without a logo sets
 * the merchant's name in the heading face at the tile's centre; it is the
 * same size, the same link, the same grey-to-ink behaviour. The alt of a
 * logo is the merchant's name, so a screen reader hears the same list
 * either way. The logo goes through next/image (the CSP's `img-src` and the
 * optimizer, as on /merchants), and only after `isAllowedImageUrl` accepted
 * its host in `pickBrandTiles`, because next/image throws on any other.
 */
export default async function BrandsRow() {
  const brands = await getHomeBrands()
  if (brands.length === 0) return null

  return (
    <section
      aria-labelledby="home-brands-title"
      dir="rtl"
      className="mx-auto w-full max-w-deals px-deals-pad pb-10 font-sans md:px-deals-pad-md xl:px-0"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="home-brands-title" className="m-0 text-section-title font-bold text-heading">
          בתי העסק שלנו
        </h2>
        <Link
          href="/merchants"
          className="flex min-h-11 items-center gap-1 whitespace-nowrap text-sm text-heading transition-opacity hover:opacity-70"
        >
          לכל בתי העסק
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
      </div>
      <ul className="brands-row__list" data-brands-list>
        {brands.map((brand) => (
          <li
            key={brand.id}
            className="brands-row__tile"
            data-brand-tile={brand.id}
            data-brand-kind={brand.logoUrl ? 'logo' : 'wordmark'}
          >
            <Link href={brand.href} className="brands-row__link" title={brand.name}>
              {brand.logoUrl ? (
                <span className="brands-row__logo" data-brand-logo>
                  <Image
                    src={brand.logoUrl}
                    alt={brand.name}
                    fill
                    sizes="167px"
                    className="brands-row__img object-contain"
                  />
                </span>
              ) : (
                <span className="brands-row__wordmark" data-brand-wordmark>
                  {brand.name}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
