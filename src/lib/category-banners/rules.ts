/**
 * Category landing banners (STEP 62): the pure half.
 *
 * Everything here is a function of its inputs and a clock the caller passes
 * in, so a test can hand it rows and read the answer. The database half
 * (`read.ts`, `admin-read.ts`, the server actions, migration 267) owns every
 * query and write; this file owns what a phase is, which banner a category
 * page shows, and what counts as an internal link.
 */

export type BannerTheme = 'light' | 'dark'

export const BANNER_THEMES: readonly BannerTheme[] = ['light', 'dark']

export type CategoryBanner = {
  id: string
  category_id: string
  title_he: string
  subtitle_he: string | null
  image_url: string
  image_alt_he: string
  cta_label_he: string | null
  cta_href: string | null
  theme: BannerTheme
  /** Null means "from the moment it was saved". */
  starts_at: string | null
  /** Null means "until switched off". */
  ends_at: string | null
  priority: number
  is_active: boolean
}

export type BannerPhase = 'scheduled' | 'live' | 'ended' | 'off'

const time = (iso: string | null): number | null => {
  if (iso === null) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Where a banner stands at `now`. `off` wins over everything: a switched-off
 * banner is not "scheduled" however far away its window is, because the
 * admin list has to tell "will appear on its own" from "will not".
 */
export function bannerPhase(
  banner: Pick<CategoryBanner, 'starts_at' | 'ends_at' | 'is_active'>,
  now: Date,
): BannerPhase {
  if (!banner.is_active) return 'off'
  const at = now.getTime()
  const start = time(banner.starts_at)
  const end = time(banner.ends_at)
  if (start !== null && at < start) return 'scheduled'
  if (end !== null && at >= end) return 'ended'
  return 'live'
}

/**
 * The banner a category page shows out of the category's rows, or null.
 *
 * Live rows only. Highest `priority` first; between equals, the one that
 * started most recently, so a campaign banner scheduled on top of an
 * evergreen one with the same priority wins while it runs and hands back
 * when it ends. A null `starts_at` sorts as the oldest start, which is what
 * "always there" means.
 */
export function pickLiveBanner<T extends CategoryBanner>(
  banners: readonly T[],
  now: Date,
): T | null {
  let best: T | null = null
  for (const banner of banners) {
    if (bannerPhase(banner, now) !== 'live') continue
    if (best === null || compareBanners(banner, best) < 0) best = banner
  }
  return best
}

/** Negative when `a` should show before `b`. */
function compareBanners(a: CategoryBanner, b: CategoryBanner): number {
  if (a.priority !== b.priority) return b.priority - a.priority
  const aStart = time(a.starts_at) ?? Number.NEGATIVE_INFINITY
  const bStart = time(b.starts_at) ?? Number.NEGATIVE_INFINITY
  if (aStart !== bStart) return bStart - aStart
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The CTA may only point inside the site: a root-relative path that is not
 * protocol-relative (`//evil.example` is a URL, not a path). The same rule
 * migration 267 CHECKs, mirrored here so the form refuses before the round
 * trip and the storefront never renders a link the database would not hold.
 */
export function isInternalHref(href: string): boolean {
  return (
    href.length <= 500 && href.startsWith('/') && !href.startsWith('//') && !/[\s\\]/.test(href)
  )
}

/** Postgres codes for "the table or function is not there": migration 267 not applied. */
const MISSING_CODES = new Set(['42P01', 'PGRST205', '42883', 'PGRST202'])

export function isMissingBannerSchema(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false
  if (error.code && MISSING_CODES.has(error.code)) return true
  return /relation .* does not exist|could not find the (table|function)|function .* does not exist/i.test(
    error.message ?? '',
  )
}

/** The two kinds the counter function accepts. */
export const BANNER_EVENT_KINDS = ['impression', 'click'] as const
export type BannerEventKind = (typeof BANNER_EVENT_KINDS)[number]

export function isBannerEventKind(value: unknown): value is BannerEventKind {
  return value === 'impression' || value === 'click'
}

/** The route the client beacons to. One place, so the component and the route cannot drift. */
export function bannerEventPath(bannerId: string): string {
  return `/api/category-banners/${encodeURIComponent(bannerId)}/events`
}

/** Clicks over impressions, as a whole percentage, or null when nothing was shown. */
export function clickThroughPercent(impressions: number, clicks: number): number | null {
  if (impressions <= 0) return null
  return Math.round((clicks / impressions) * 100)
}
