import GiftClaimForm from '@/components/gifts/GiftClaimForm'
import { createClient } from '@/lib/supabase/server'
import { loadGiftPreview } from '@/server/actions/gifts'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

/**
 * The claim page for a gifted coupon.
 *
 * `noindex`, and not as a formality: the URL IS the credential. A crawler that
 * reaches one of these holds a working claim link, and a claim link in an index
 * is a coupon anybody can take.
 */
export const metadata: Metadata = {
  title: 'קיבלת מתנה',
  robots: { index: false, follow: false },
}

type Props = { params: Promise<{ token: string }> }

/**
 * The shell prerenders; everything that reads the gift is inside `<Suspense>`.
 *
 * Required rather than stylistic: this app runs with `cacheComponents` ([21]),
 * where uncached data outside a Suspense boundary FAILS THE BUILD rather than
 * quietly making the route dynamic. The token lookup and the session read are
 * both per-request by definition.
 */
export default function GiftClaimPage(props: Props) {
  return (
    <main className="mx-auto w-full max-w-page px-4 py-12">
      <div className="mx-auto max-w-xl rounded-2xl border border-heading/15 bg-white p-6 text-center shadow-sm">
        <Suspense fallback={<p className="text-sm text-heading/70">רגע, טוענים את המתנה…</p>}>
          <GiftContent {...props} />
        </Suspense>
      </div>
    </main>
  )
}

async function GiftContent({ params }: Props) {
  // `await params` is itself uncached data, so it belongs inside the boundary
  // and not in the shell - same shape as /coupon/[id].
  const { token } = await params
  const gift = await loadGiftPreview(token)
  if (!gift) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const expires = gift.expiresAt
    ? new Date(gift.expiresAt).toLocaleDateString('he-IL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  return (
    <>
      <p className="text-sm font-medium text-heading/70">
        {gift.recipientName ? `${gift.recipientName}, קיבלת מתנה` : 'קיבלת מתנה'}
      </p>
      <h1 className="mt-2 text-2xl font-bold text-heading">{gift.productName ?? 'קופון'}</h1>
      {gift.supplierName && <p className="mt-1 text-sm text-heading/70">{gift.supplierName}</p>}

      {gift.message && (
        <blockquote className="mt-5 rounded-xl border border-heading/10 bg-heading/5 px-4 py-3 text-base leading-relaxed text-heading/90">
          {gift.message}
        </blockquote>
      )}

      {expires && <p className="mt-4 text-sm text-heading/70">הקופון בתוקף עד {expires}</p>}

      <div className="mt-6">
        {!gift.usable ? (
          <p className="text-sm text-heading/80">
            לא ניתן לקבל את הקופון הזה. אם לדעתכם מדובר בטעות,{' '}
            <Link href="/contact" className="underline underline-offset-2">
              פנו אלינו
            </Link>
            .
          </p>
        ) : gift.claimed ? (
          <p className="text-sm text-heading/80">
            המתנה כבר נאספה. אם אתם אספתם אותה, היא נמצאת{' '}
            <Link href="/account/coupons" className="underline underline-offset-2">
              בקופונים שלי
            </Link>
            .
          </p>
        ) : user ? (
          <GiftClaimForm token={token} />
        ) : (
          <>
            <p className="text-sm text-heading/80">
              כדי לקבל את הקופון לחשבון שלכם צריך להתחבר או להירשם. הקופון יישמר בחשבון שאיתו
              תתחברו.
            </p>
            <Link
              href={`/login?next=${encodeURIComponent(`/gift/${token}`)}`}
              className="mt-4 inline-block rounded-lg bg-brand px-6 py-3 font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover"
            >
              התחברות וקבלת הקופון
            </Link>
          </>
        )}
      </div>
    </>
  )
}
