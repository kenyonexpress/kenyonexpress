'use client'

import SmartImage from '@/components/ui/SmartImage'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

type CategoryTile = {
  slug: string
  nameHe: string
  imageUrl?: string
}

type Props = {
  compact?: boolean
  tiles: CategoryTile[]
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
        <path d="M14 22h36l-3 32H17L14 22Z" />
        <path d="M24 22v-4a8 8 0 0 1 16 0v4" />
        <path d="M28 33a4 4 0 1 1 6 3.5c-1.3.8-2 1.6-2 3" />
        <circle cx="32" cy="45" r="0.5" fill="currentColor" />
      </svg>
      <span className="absolute -bottom-2 rounded-pill border-2 border-white bg-heading px-3 py-1 text-sm font-black tracking-wider text-white">
        404
      </span>
    </div>
  )
}

export default function NotFoundContent({ compact = false, tiles }: Props) {
  const t = useTranslations('notFound')

  return (
    <div
      data-not-found
      dir="rtl"
      className="mx-auto w-full max-w-deals px-deals-pad py-12 font-sans md:px-deals-pad-md md:py-14 xl:px-0"
    >
      <section className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <BrandMark />
        <h1 className="mt-6 text-2xl font-bold text-heading md:text-3xl">{t('heading')}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted md:text-base">
          {t('description')}
        </p>

        {!compact && (
          <div data-not-found-search className="mt-6 w-full max-w-search-pill">
            {/* SiteSearch will be imported and added here */}
          </div>
        )}

        <nav
          aria-label={t('navigationLabel')}
          className="mt-6 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href="/"
            className="inline-flex min-h-touch-min items-center rounded-pill bg-brand-primary px-6 text-sm font-bold text-heading transition-colors hover:bg-brand-primary-hover"
          >
            {t('homeLink')}
          </Link>
          <Link
            href="/products"
            className="inline-flex min-h-touch-min items-center rounded-pill border border-border px-6 text-sm font-bold text-heading transition-colors hover:bg-surface-hover"
          >
            {t('productsLink')}
          </Link>
          <Link
            href="/contact"
            className="inline-flex min-h-touch-min items-center rounded-pill px-4 text-sm font-bold text-muted transition-colors hover:text-heading"
          >
            {t('contactLink')}
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
            {t('categoriesTitle')}
          </h2>
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-3 xl:grid-cols-6">
            {tiles.map((tile) => (
              <li key={tile.slug}>
                <Link
                  href={`/category/${tile.slug}`}
                  data-category-tile={tile.slug}
                  className="group flex min-h-touch-min flex-col items-center rounded-md border border-border bg-white p-3 text-center transition-shadow duration-300 hover:shadow-card-hover"
                >
                  <div className="relative aspect-square w-full max-w-28 overflow-hidden rounded-md">
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
