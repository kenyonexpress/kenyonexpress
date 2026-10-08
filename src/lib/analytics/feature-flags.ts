/**
 * PostHog feature flags over the public /decide endpoint, SDK-free like every
 * other PostHog call in this app (see lib/observability/posthog.ts for why).
 *
 * ONE CALL DECIDES EVERY REGISTERED EXPERIMENT. /decide answers with every
 * flag the project has, so the first page of a session asks once and the
 * answer for the four flags in `EXPERIMENTS` is cached together for the
 * session. Callers ask for one experiment (`getVariant`) or the typed
 * checkout wrapper; neither ever triggers a second request. A generic
 * `getFlag(key)` reader is deliberately absent: it invites unvalidated
 * string comparisons at call sites, and the whole point of the registry is
 * that an unknown value can only ever mean control.
 *
 * FAILURE IS CONTROL, ALWAYS. A flag decides which checkout a paying customer
 * sees, so this module must never make a page wait on PostHog being up: the
 * fetch has a hard 2s timeout, every error path resolves (never rejects) to
 * control, and a resolved decision is cached for the session so the page never
 * flips variants mid-journey. A failed decision is cached as "in no
 * experiment" (`{}`), not as control: retrying on the next page could land a
 * variant mid-journey, and stamping `control` on a visitor PostHog never
 * assigned would pad the control arm with un-randomised traffic.
 *
 * CONSENT GATES THE CALL. /decide transmits the visitor's distinct id to
 * PostHog, which is exactly the data flow the banner asks about. A visitor who
 * declined (or has not answered) gets control without any network call, which
 * also means experiments only measure consented traffic; the two halves of an
 * A/B report then come from the same population.
 */

import {
  CHECKOUT_VARIANT_FLAG,
  type CheckoutVariant,
  mirrorCheckoutVariantCookie,
  resolveCheckoutVariant,
} from '@/lib/analytics/checkout-variant'
import { CONSENT_COOKIE, isTrackingAllowed } from '@/lib/analytics/consent'
import {
  EXPERIMENTS,
  type ExperimentDefinition,
  type VariantOf,
  resolveVariant,
} from '@/lib/analytics/experiments'
import { type VariantMap, readVariantCache, writeVariantCache } from '@/lib/analytics/variant-cache'
import { currentDistinctId, isPostHogEnabled, trackEvent } from '@/lib/observability/posthog'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(
  /\/+$/,
  '',
)

/**
 * The banner's decision, read off the cookie it writes. Duplicates the three
 * lines of commerce-client's trackingAllowed on purpose: importing it from
 * there would couple the flags module to a file several tests replace with a
 * `{ trackCommerce }`-only mock, and a flag gate must not throw because a
 * TEST mocked an unrelated event function.
 */
function consentGranted(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`))
    return isTrackingAllowed(match?.[1] ? decodeURIComponent(match[1]) : null)
  } catch {
    return false
  }
}

/**
 * The in-memory copy of the decided map. sessionStorage is the copy that
 * survives a navigation; this one survives sessionStorage being blocked
 * (private mode), where a storage-only design would ask PostHog again for
 * every event the tracker gates on the decision.
 */
let memory: VariantMap | null = null

/** One in-flight request per page, so a burst of callers shares the answer. */
let pending: Promise<VariantMap> | null = null

/**
 * The decided map for this session, synchronously: `null` before the first
 * decision, `{}` once PostHog answered with no flag for this browser, and
 * flag -> variant otherwise. The tracker stamps events from this.
 */
export function decidedVariants(): VariantMap | null {
  if (memory !== null) return memory
  const stored = readVariantCache()
  if (stored !== null) memory = stored
  return stored
}

function canDecide(): boolean {
  return typeof window !== 'undefined' && isPostHogEnabled() && Boolean(KEY) && consentGranted()
}

/**
 * Folds the /decide payload to the registered flags this browser is IN: a
 * string that is one of the experiment's variants. A missing flag, a boolean
 * from an on/off flag, or a key outside the list is not an assignment, so it
 * is not cached and not stamped, and the page renders control.
 */
export function assignedVariants(featureFlags: Record<string, unknown> | undefined): VariantMap {
  const map: Record<string, string> = {}
  if (!featureFlags) return map
  for (const experiment of EXPERIMENTS) {
    const raw = featureFlags[experiment.flag]
    if (typeof raw === 'string' && experiment.variants.includes(raw)) map[experiment.flag] = raw
  }
  return map
}

async function fetchDecision(): Promise<VariantMap> {
  const response = await fetch(`${HOST}/decide/?v=3`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: KEY, distinct_id: currentDistinctId() }),
    signal: AbortSignal.timeout(2_000),
  })
  if (!response.ok) return {}
  const payload = (await response.json()) as { featureFlags?: Record<string, unknown> }
  return assignedVariants(payload.featureFlags)
}

function commit(map: VariantMap): void {
  memory = map
  writeVariantCache(map)
  const checkout = map[CHECKOUT_VARIANT_FLAG]
  if (checkout !== undefined) mirrorCheckoutVariantCookie(resolveCheckoutVariant(checkout))
  // Exposure events AFTER the cache write: if this browser reloads between
  // the two, a cached variant with no exposure event undercounts the
  // experiment, while an exposure event for an uncached variant would claim
  // the shopper saw something the next page may re-decide. One per flag the
  // browser is in; `$feature_flag_called` is the event PostHog's own
  // experiment results read.
  for (const [flag, variant] of Object.entries(map)) {
    trackEvent('$feature_flag_called', {
      $feature_flag: flag,
      $feature_flag_response: variant,
    })
  }
}

/**
 * Every registered flag's decision for this browser, resolving in at most
 * ~2s and never rejecting. First call per session asks PostHog; later calls
 * answer from the session cache with no network. Without consent, a key, or
 * a window, resolves to the empty map immediately and caches nothing, so a
 * visitor who consents later is asked then.
 */
export function getExperimentVariants(): Promise<VariantMap> {
  const cached = decidedVariants()
  if (cached !== null) return Promise.resolve(cached)
  if (!canDecide()) return Promise.resolve({})
  if (pending) return pending

  pending = fetchDecision()
    .catch((): VariantMap => ({}))
    .then((map) => {
      commit(map)
      return map
    })
    .finally(() => {
      pending = null
    })
  return pending
}

/**
 * What an event emitter should wait on before stamping: `null` when there is
 * nothing to wait for (already decided, or no decision possible), otherwise
 * the pending decision. The tracker defers an event's enqueue on this so the
 * first page_view of a session carries the variant the page is about to
 * render, instead of firing a stampless row 2s before the decision lands.
 */
export function whenVariantsDecided(): Promise<unknown> | null {
  if (decidedVariants() !== null || !canDecide()) return null
  return getExperimentVariants()
}

/** The variant this browser should render for one experiment; control when not in it. */
export function getVariant<E extends ExperimentDefinition>(experiment: E): Promise<VariantOf<E>> {
  return getExperimentVariants().then((map) => resolveVariant(experiment, map[experiment.flag]))
}

/** The typed checkout wrapper, kept for its callers in the checkout form. */
export function getCheckoutVariant(): Promise<CheckoutVariant> {
  return getExperimentVariants().then((map) => resolveCheckoutVariant(map[CHECKOUT_VARIANT_FLAG]))
}
