import type { LandingVariant } from '@/lib/landing/blocks'

/**
 * Which variant of a landing page a visitor sees, and how that is reported.
 *
 * THE DECISION IS FIRST-PARTY AND SERVER-SIDE, unlike the checkout variant,
 * which asks PostHog from the browser. A landing page is the first paint of
 * a paid click; a variant that resolves 2 seconds after the page is up (the
 * flag fetch's timeout) is a layout shift on the one page whose first
 * impression is being measured. So the proxy hands every landing visitor a
 * random BUCKET, a number in [0, 10000), in an httpOnly cookie, and the page
 * maps that bucket to a variant through the page's own weights. The bucket
 * is stable, the weights live in the CMS row, and changing a weight moves
 * visitors between arms without anyone's bucket changing: the same property
 * a percentage rollout has.
 *
 * CONSENT GATES THE COOKIE. The proxy only sets the bucket when the banner's
 * analytics category is granted and no Do-Not-Track signal is present. A
 * visitor without one has no bucket and sees the FIRST variant (control),
 * which is the same rule feature-flags.ts states for the checkout: the
 * experiment measures consented traffic only, so both halves of the report
 * come from the same population.
 *
 * `?v=<key>` overrides the bucket. It is how an editor previews arm B and
 * how a QA link pins one; it carries no authority (a landing variant changes
 * copy, never a price) and the exposure event reports the variant actually
 * RENDERED, so a pinned view is counted under the arm it showed.
 *
 * Pure. The proxy (edge), the page (server) and the tracker (browser) all
 * import it.
 */

export const LANDING_BUCKET_COOKIE = 'ke_lpb'
/** 0.01% granularity: a weight of 1 is still 100 distinct buckets. */
export const LANDING_BUCKET_SPACE = 10_000
export const LANDING_BUCKET_MAX_AGE_SECONDS = 60 * 60 * 24 * 90
/**
 * How a bucket minted on THIS request reaches the page rendering it. The
 * cookie is on the response, which the page cannot read; the proxy forwards
 * the value as a request header instead (and strips any such header a
 * client sent, so the value is always the proxy's). On the next request the
 * cookie is there and the header is not.
 */
export const LANDING_BUCKET_HEADER = 'x-ke-landing-bucket'

export const LANDING_VARIANT_PARAM = 'v'
export const LANDING_PREVIEW_PARAM = 'preview'

/** What a page with no variants, or a visitor with no bucket, is reported as. */
export const CONTROL_VARIANT = 'control'

/** An integer in [0, LANDING_BUCKET_SPACE), or null for anything else. */
export function parseBucket(raw: string | null | undefined): number | null {
  if (typeof raw !== 'string' || !/^\d{1,5}$/.test(raw)) return null
  const bucket = Number(raw)
  return Number.isInteger(bucket) && bucket >= 0 && bucket < LANDING_BUCKET_SPACE ? bucket : null
}

/** Uniform over the bucket space. `random` is injectable for tests only. */
export function randomBucket(random: () => number = Math.random): number {
  const bucket = Math.floor(random() * LANDING_BUCKET_SPACE)
  return Math.min(Math.max(bucket, 0), LANDING_BUCKET_SPACE - 1)
}

/** The arm's key for the report: the first variant is control when any exist. */
export function controlVariantKey(variants: readonly LandingVariant[]): string {
  return variants[0]?.key ?? CONTROL_VARIANT
}

export function variantKeys(variants: readonly LandingVariant[]): string[] {
  return variants.length > 0 ? variants.map((variant) => variant.key) : [CONTROL_VARIANT]
}

/**
 * The variant for a bucket.
 *
 * Weights are normalised over their sum, so `[50, 50]`, `[1, 1]` and
 * `[30, 30]` all split evenly, and `[100, 0]` sends everyone to the first.
 * The walk is cumulative over the array in order, so the arm boundaries
 * stay put when a later arm's weight changes: visitors move only between
 * the arms whose weights moved.
 *
 * A null bucket (no consent, cookie blocked, first request before the proxy
 * ran) is control. An override that names a real key wins over the bucket.
 */
export function chooseVariant(
  variants: readonly LandingVariant[],
  bucket: number | null,
  override?: string | null,
): string {
  if (variants.length === 0) return CONTROL_VARIANT
  if (override && variants.some((variant) => variant.key === override)) return override
  const control = controlVariantKey(variants)
  if (bucket === null) return control

  const total = variants.reduce((sum, variant) => sum + Math.max(0, variant.weight), 0)
  if (total <= 0) return control

  const point = (bucket / LANDING_BUCKET_SPACE) * total
  let cumulative = 0
  for (const variant of variants) {
    cumulative += Math.max(0, variant.weight)
    if (point < cumulative) return variant.key
  }
  return variants[variants.length - 1]?.key ?? control
}

/**
 * The event property carrying the variant: `$feature/lp_<slug>`, the same
 * `$feature/<flag>` shape the checkout experiment uses, so PostHog's
 * experiment analysis reads a landing test natively and the first-party
 * report (`experiment-events.ts`) needs no second code path.
 */
export function landingProperty(slug: string): string {
  return `$feature/lp_${slug.replace(/-/g, '_')}`
}
