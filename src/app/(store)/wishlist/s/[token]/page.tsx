import { t } from '@/lib/i18n/messages'
import { shekelsFromIlsRounded } from '@/lib/money-format'
import { verifyWishlistShareToken } from '@/lib/wishlist/share'
import { loadSharedWishlistProducts } from '@/lib/wishlist/shared-products'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: t('wishlistPublic.title'),
  robots: { index: false, follow: false },
  // Self-canonical of the prefix, not the token. The URL is a credential: a
  // crawler that indexed one of these would publish somebody's saved products.
  // Pairing noindex with the root canonical of `/` would aim the noindex at
  // the home page (same trap as /gift).
  alternates: { canonical: '/wishlist/s' },
}

type Props = { params: Promise<{ token: string }> }

function firstImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null
  const first = images.find((src): src is string => typeof src === 'string')
  return first ?? null
}

export default function SharedWishlistPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-12">
      <Suspense fallback={<p className="text-sm text-muted">{t('wishlistPublic.loading')}</p>}>
        <SharedWishlistBody {...props} />
      </Suspense>
    </main>
  )
}

async function SharedWishlistBody({ params }: Props) {
  const { token } = await params
  const verdict = verifyWishlistShareToken(token)
  if (!verdict.ok) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-2xl font-bold text-heading">{t('wishlistPublic.invalidTitle')}</h1>
        <p className="mt-3 text-muted">
          {verdict.reason === 'expired' ? t('wishlistPublic.expired') : t('wishlistPublic.broken')}
        </p>
        <p className="mt-6">
          <Link href="/products" className="font-semibold text-price underline">
            {t('wishlistPublic.continueShopping')}
          </Link>
        </p>
      </div>
    )
  }

  const products = await loadSharedWishlistProducts(verdict.productIds)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold text-heading">{t('wishlistPublic.title')}</h1>
      <p className="mt-2 text-sm text-muted">{t('wishlistPublic.snapshotNote')}</p>
      {products.length === 0 ? (
        <p className="mt-6 text-muted">{t('wishlistPublic.empty')}</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {products.map((product) => {
            const image = firstImage(product.images)
            const name = product.name_he ?? t('wishlistPublic.fallbackName')
            const href = product.slug ? `/product/${product.slug}` : null
            const price = product.price_ils
            const body = (
              <span className="flex items-center gap-3">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ) : (
                  <span aria-hidden="true" className="h-16 w-16 rounded-lg bg-surface-hover" />
                )}
                <span>
                  <span className="block font-semibold">{name}</span>
                  {price != null ? (
                    <span className="block text-sm text-price">{shekelsFromIlsRounded(price)}</span>
                  ) : null}
                </span>
              </span>
            )
            return (
              <li key={product.id} className="rounded-lg border border-border-alt p-3">
                {href ? <Link href={href}>{body}</Link> : body}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
