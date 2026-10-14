import SiteSearch from '@/components/search/SiteSearch'
import SmartImage from '@/components/ui/SmartImage'
import { getHomeCategoryTiles } from '@/lib/homepage/below-fold'
import type { Metadata } from 'next'
import Link from 'next/link'

/**
 * THE 404 BODY, shared by every `not-found.tsx` in the app (UX25, 15.10.2026).
 *
 * MEASURED BEFORE (logs/ux25/before.json, the build of HEAD 99ceaf9e9 at
 * 380 / 768 / 1440): an unmatched URL rendered the root `not-found.tsx` with
 * NO storefront chrome at all (no header, no footer, no skip link, no
 * search), a bare 404 in the middle of a white page; a dead product slug
 * rendered the same file INSIDE the store layout, with the file's own
 * `<main>` nested in the shell's `<main id="main-content">` (two main
 * landmarks). Neither offered a search field or a single category, only three
 * text links. docs/ARCHITECTURE-SEO.md §6.4 had asked for "links to the
 * leading categories and search" from the start.
 *
 * WHY ONE BODY AND SEVERAL FILES. Next inherits the nearest `not-found.tsx`
 * down the tree and renders it inside the layouts of the route that threw:
 * the root file is what a dead product shows, under the store shell. So the
 * root file wraps this body in `StoreShell` (an unmatched URL has no layout
 * but the root one), and every route group that carries its own chrome gets a
 * `not-found.tsx` of its own that renders the bare body, so the shell is
 * never painted twice. This component is therefore NOT a `<main>`: every
 * layout it lands in already has one.
 *
 * WHAT IT OFFERS, in order: the brand mark and the 404, the heading, one
 * sentence, the site search field (the same `SiteSearch` the masthead and the
 * results page mount, with its own fixed id so a page that shows both the
 * masthead pill and this one has no duplicate id), the three ways on (home
 * first, as the goal asked, then the catalogue and contact), and six of the
 * home page's category tiles: the same cached read (`getHomeCategoryTiles`,
 * menu order, top level, photographed first), so the 404 costs no query of
 * its own and is prerendered into `/_not-found` under `cacheComponents`. A
 * failed read renders no tiles and the page still stands; the reader never
 * throws.
 *
 * `compact` drops the search and the tiles: the admin, supplier and auth
 * layouts are not the storefront, and a shopper's search box inside the admin
 * sidebar would be the wrong offer.
 */

export const NOT_FOUND_CATEGORY_COUNT = 6

export const NOT_FOUND_HEADING = 'הדף שחיפשתם לא נמצא'

export const notFoundMetadata: Metadata = {
  title: 'הדף לא נמצא',
  robots: { index: false, follow: true },
}

type Props = {
  /** Admin, supplier, auth: no storefront search and no category tiles. */
  compact?: boolean
}

function BrandMark() {
  return (
    <div
      data-not-found-mark
      aria-hidden="true"
      className="relative flex size-28 items-center justify-center rounded-full bg-brand-primary text-heading md:size-32"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        width="64"
        height="64"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-14 md:size-16"
      >
        {/* A shopping bag, handles up, the same mark as the cart badge family. */}
        <path d="M14 22h36l-3 32H17L14 22Z" />
        <path d="M24 22v-4a8 8 0 0 1 16 0v4" />
        {/* A question mark on the bag: the thing you wanted is not in it. */}
        <path d="M28 33a4 4 0 1 1 6 3.5c-1.3.8-2 1.6-2 3" />
        <circle cx="32" cy="45" r="0.5" fill="currentColor" />
      </svg>
      <span className="absolute -bottom-2 rounded-pill border-2 border-white bg-heading px-3 py-0.5 text-sm font-black tracking-wider text-white">
        404
      </span>
    </div>
  )
}

export default async function NotFoundBody({ compact = false }: Props = {}) {
  const tiles = compact ? [] : (await getHomeCategoryTiles()).slice(0, NOT_FOUND_CATEGORY_COUNT)

  return (
    <div
      data-not-found
      dir="rtl"
      className="mx-auto w-full max-w-deals px-deals-pad py-10 font-sans md:px-deals-pad-md md:py-14 xl:px-0"
    >
      <section className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <BrandMark />
        <h1 className="mt-6 text-2xl font-bold text-heading md:text-3xl">{NOT_FOUND_HEADING}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted md:text-base">
          ייתכן שהקישור ישן, שהמוצר כבר לא במלאי, או שנפלה שגיאת הקלדה בכתובת. אפשר לחפש את מה
          שרציתם, או להמשיך מאחת הקטגוריות.
        </p>

        {!compact && (
          <div data-not-found-search className="mt-6 w-full max-w-search-pill">
            <SiteSearch id="not-found-search" variant="page" />
          </div>
        )}

        <nav
          aria-label="דרכים להמשיך"
          className="mt-6 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href="/"
            className="inline-flex min-h-touch-min items-center rounded-pill bg-brand-primary px-6 text-sm font-bold text-heading transition-colors hover:bg-brand-primary-hover"
          >
            לדף הבית
          </Link>
          <Link
            href="/products"
            className="inline-flex min-h-touch-min items-center rounded-pill border border-border px-6 text-sm font-bold text-heading transition-colors hover:bg-surface-hover"
          >
            לכל המוצרים
          </Link>
          <Link
            href="/contact"
            className="inline-flex min-h-touch-min items-center rounded-pill px-4 text-sm font-bold text-muted transition-colors hover:text-heading"
          >
            צרו קשר
          </Link>
        </nav>
      </section>

      {tiles.length > 0 && (
        <section
          data-not-found-categories
          aria-labelledby="not-found-categories-title"
          className="mt-12 md:mt-16"
        >
          <h2
            id="not-found-categories-title"
            className="mb-4 text-center text-section-title font-bold text-heading"
          >
            קטגוריות פופולריות
          </h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 xl:grid-cols-6">
            {tiles.map((tile) => (
              <li key={tile.slug}>
                <Link
                  href={`/category/${tile.slug}`}
                  data-category-tile={tile.slug}
                  className="group flex min-h-touch-min flex-col items-center rounded-elevated border border-border bg-white p-3 text-center transition-shadow duration-300 hover:shadow-card-hover"
                >
                  <div className="relative aspect-square w-full max-w-28 overflow-hidden rounded-elevated">
                    <SmartImage
                      src={tile.imageUrl ?? ''}
                      alt=""
                      fill
                      sizes="(max-width: 767px) 45vw, (max-width: 1279px) 30vw, 112px"
                      className="object-contain transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
                      fallbackClassName="absolute inset-0"
                    />
                  </div>
                  <span className="mt-2 block text-sm font-semibold text-heading">
                    {tile.nameHe}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
