import {
  type MerchantDirectoryEntry,
  couponCountLabel,
  loadMerchantDirectoryCached,
} from '@/lib/merchant-directory'
import { buildBreadcrumbJsonLd, buildItemListJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import { MapPin, Store, Tag } from 'lucide-react'
import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = publicPageMetadata({
  title: 'בתי העסק',
  description:
    'כל בתי העסק שמוכרים קופונים בקניון אקספרס: לוגו, תחום, עיר ומספר הקופונים הפעילים של כל אחד. כל כרטיס מוביל לחנות של בית העסק.',
  path: '/merchants',
})

/**
 * The merchant directory (STEP 63): one card per active supplier.
 *
 * The data and every "why not" (no ratings, no commission, no contact
 * columns, how the count and the category are derived) live in
 * `lib/merchant-directory.ts`. This file is the frame and the cards.
 *
 * NO RATING ANYWHERE ON THE CARD. Not a star, not a number, not a sort by
 * it. `merchants/page.test.ts` greps this file for the words and fails on
 * any of them, so the rule cannot drift back in through a "small" edit.
 *
 * THE FRAME IS THE ONE `/faq` MEASURED (content-pages.test.ts): a directory
 * with its own page rhythm is what the comparison gate exists to catch.
 */

const PATH = '/merchants'

export default async function MerchantsPage() {
  const merchants = await loadMerchantDirectoryCached()

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  const breadcrumbLd = buildBreadcrumbJsonLd(
    [
      { name: 'בית', path: '/' },
      { name: 'בתי העסק', path: PATH },
    ],
    siteUrl,
  )
  // Name and URL per merchant, nothing more: the storefront page is where the
  // facts about a merchant live, and the list is a table of contents.
  const listLd = buildItemListJsonLd({
    name: 'בתי העסק בקניון אקספרס',
    path: PATH,
    entries: merchants.map((m) => ({ name: m.name, path: `/s/${m.id}` })),
    siteUrl,
  })

  return (
    <div className="mx-auto w-full max-w-page px-4 py-10">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point, and jsonLdScript escapes every angle bracket.
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(listLd ? [breadcrumbLd, listLd] : breadcrumbLd),
        }}
      />

      <nav aria-label="נתיב ניווט" className="mb-6 text-sm text-heading/80">
        <Link href="/" className="hover:text-heading">
          בית
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-heading">בתי העסק</span>
      </nav>

      <header className="mb-8 max-w-3xl">
        <h1 className="text-3xl font-bold text-heading">בתי העסק</h1>
        <p className="mt-4 text-base leading-relaxed text-heading/80">
          אלה בתי העסק שמוכרים קופונים בקניון אקספרס. בכל כרטיס: התחום, העיר ומספר הקופונים הפעילים
          כרגע, והכרטיס עצמו מוביל לחנות של בית העסק עם כל הדילים שלו.
        </p>
      </header>

      {merchants.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="merchant-directory">
          {merchants.map((merchant, index) => (
            <li key={merchant.id}>
              <MerchantCard merchant={merchant} eager={index < 6} />
            </li>
          ))}
        </ul>
      ) : (
        // A real answer, not a failed query: `orFail` throws on a read error,
        // so an empty list here means the catalogue has no active supplier.
        <p className="max-w-3xl text-base text-heading/80">
          עדיין אין בתי עסק פעילים להצגה. אם יש לכם עסק, נשמח שתצטרפו.
        </p>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/products"
          className="inline-flex min-h-touch-min items-center rounded-md bg-brand px-5 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          לכל הדילים
        </Link>
        <Link
          href="/suppliers"
          className="inline-flex min-h-touch-min items-center rounded-md border border-border px-5 py-2 text-sm text-heading transition-colors hover:bg-surface-hover"
        >
          הצטרפו כספקים
        </Link>
      </div>
    </div>
  )
}

function MerchantCard({ merchant, eager }: { merchant: MerchantDirectoryEntry; eager: boolean }) {
  const href = `/s/${merchant.id}`
  return (
    <article className="flex h-full gap-4 rounded-xl border border-heading/10 bg-white p-4 transition-shadow hover:shadow-md">
      <Link
        href={href}
        aria-hidden="true"
        tabIndex={-1}
        className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-heading/10 bg-surface-hover"
      >
        {merchant.logoUrl ? (
          /**
           * Through the optimizer, not a raw <img>: `img-src` in the CSP allows
           * self, Supabase and a few named hosts, so a raw tag at any other
           * allowed upload host renders a broken image (CouponCard has the
           * same note). `fill` is safe because the parent is `relative h-20`.
           */
          <Image
            src={merchant.logoUrl}
            alt=""
            fill
            sizes="80px"
            loading={eager ? 'eager' : 'lazy'}
            className="object-contain p-1"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-heading/40">
            <Store size={32} aria-hidden="true" />
          </span>
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold text-heading">
          <Link href={href} className="hover:underline">
            {merchant.name}
          </Link>
        </h2>

        {merchant.categories.length > 0 ? (
          <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="תחומים">
            {merchant.categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${encodeURIComponent(category.slug)}`}
                  className="inline-flex items-center rounded-full border border-heading/10 px-2 py-0.5 text-xs text-heading/80 hover:bg-surface-hover"
                >
                  {category.name_he}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {merchant.city ? (
          <p className="mt-2 flex items-center gap-1 text-sm text-heading/70">
            <MapPin size={14} aria-hidden="true" />
            <span>{merchant.city}</span>
          </p>
        ) : null}

        <p className="mt-1 flex items-center gap-1 text-sm text-heading/70">
          <Tag size={14} aria-hidden="true" />
          <span>{couponCountLabel(merchant.couponCount)}</span>
        </p>
      </div>
    </article>
  )
}
