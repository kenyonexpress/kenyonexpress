import LandingBlocks from '@/components/landing/LandingBlocks'
import LandingTracker from '@/components/landing/LandingTracker'
import { getSessionWithRole } from '@/lib/admin/rbac'
import { isPanelRole } from '@/lib/admin/roles'
import { readUtmFromQuery } from '@/lib/analytics/attribution'
import { type LandingPage, variantBlocks } from '@/lib/landing/blocks'
import { landingCampaignParams } from '@/lib/landing/campaign-links'
import { readLandingPageForPreview, readLiveLandingPage } from '@/lib/landing/read'
import { isLandingSlug, landingPath } from '@/lib/landing/slug'
import {
  LANDING_BUCKET_COOKIE,
  LANDING_BUCKET_HEADER,
  LANDING_PREVIEW_PARAM,
  LANDING_VARIANT_PARAM,
  chooseVariant,
  parseBucket,
} from '@/lib/landing/variant'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import type { Metadata } from 'next'
import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'

type Query = Record<string, string | string[] | undefined>
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Query> }

/**
 * `/lp/<slug>`: a campaign landing page from the CMS (STEP 55).
 *
 * TWO HALVES. The document (title, description, every variant's blocks) is
 * a cached, tagged read and goes into the static shell: the title paints at
 * once and the whole page costs the database nothing per visit. The
 * DECISION (which variant this visitor sees) reads the bucket cookie and
 * the query string, so it lives inside the Suspense boundary, which is
 * where `cacheComponents` requires request data to be read.
 *
 * `?v=<key>` pins a variant; `?preview=1` shows a draft or an out-of-window
 * page to a signed-in panel user and to nobody else (the live read is what
 * everyone else gets, and it only knows published rows inside their
 * window). The exposure event reports the variant actually rendered, in
 * both cases.
 *
 * NOINDEX BY DEFAULT. A campaign page is `indexable` only when an editor
 * says so; the catalogue pages are the ones that should rank for the copy
 * they share.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  if (!isLandingSlug(slug)) return { title: 'הדף לא נמצא', robots: { index: false, follow: true } }
  const page = await readLiveLandingPage(slug)
  if (!page) return { title: 'הדף לא נמצא', robots: { index: false, follow: true } }
  const base = publicPageMetadata({
    title: page.titleHe,
    description: page.descriptionHe ?? page.titleHe,
    path: landingPath(slug),
  })
  return page.indexable ? base : { ...base, robots: { index: false, follow: true } }
}

export default async function LandingRoute({ params, searchParams }: Props) {
  return (
    <div className="mx-auto w-full max-w-page px-4 py-10">
      <Suspense fallback={<LandingSkeleton />}>
        <LandingBody params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

function LandingSkeleton() {
  return (
    <div aria-busy="true" aria-label="טוען את הדף" className="space-y-6">
      <div className="h-48 animate-pulse rounded-2xl bg-heading/5" />
      <div className="h-6 w-2/3 animate-pulse rounded bg-heading/5" />
      <div className="h-6 w-1/2 animate-pulse rounded bg-heading/5" />
    </div>
  )
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

async function LandingBody({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  if (!isLandingSlug(slug)) notFound()

  const preview = first(query[LANDING_PREVIEW_PARAM]) === '1'
  let page: LandingPage | null = null
  if (preview) {
    const session = await getSessionWithRole()
    if (session && isPanelRole(session.role)) page = await readLandingPageForPreview(slug)
  }
  if (!page) page = await readLiveLandingPage(slug)
  if (!page) notFound()

  // The cookie on every later visit; the proxy's request header on the visit
  // that minted it (the response cookie is not readable here yet).
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const bucket =
    parseBucket(cookieStore.get(LANDING_BUCKET_COOKIE)?.value) ??
    parseBucket(headerStore.get(LANDING_BUCKET_HEADER))
  const variant = chooseVariant(page.variants, bucket, first(query[LANDING_VARIANT_PARAM]))

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    const single = first(value)
    if (single !== undefined) search.set(key, single)
  }
  const campaign = landingCampaignParams(page, variant, readUtmFromQuery(search.toString()))
  const blocks = variantBlocks(page, variant)

  return (
    <>
      <LandingTracker slug={page.slug} variant={variant} />
      {preview && page.source === 'database' && (
        <output className="mb-6 block rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          תצוגה מקדימה: {statusLabel(page.status)}, גרסה <bdi>{variant}</bdi>. מה שרואים כאן לא
          בהכרח מוצג לגולשים.
        </output>
      )}
      <LandingBlocks blocks={blocks} campaign={campaign} />
    </>
  )
}

function statusLabel(status: LandingPage['status']): string {
  if (status === 'published') return 'מפורסם'
  if (status === 'archived') return 'בארכיון'
  return 'טיוטה'
}
