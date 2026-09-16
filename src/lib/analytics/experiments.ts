/**
 * The experiment registry: every A/B test the storefront can run, as data.
 *
 * One entry today, the checkout variant. The registry exists so the admin
 * experiments page, the event-to-variant assignment and the stats table never
 * hard-code a flag key, a variant list or a goal event: each of those is a
 * string that can drift silently from its emitter, and the test beside this
 * file locks every entry to the constants the emitters actually use.
 *
 * Pure and dependency-free beyond the two constant modules it re-exports
 * from, so the admin page, the server loader and the client can all import
 * it without dragging fetch or a Supabase client into the bundle.
 */

import {
  CHECKOUT_VARIANTS,
  CHECKOUT_VARIANT_FLAG,
  CHECKOUT_VARIANT_PROPERTY,
} from '@/lib/analytics/checkout-variant'
import type { ClientEventName, ServerEventName } from '@/lib/analytics/events'

export type ExperimentDefinition = {
  /** Stable key, also the PostHog flag key. */
  key: string
  /** The PostHog feature flag whose payload decides the variant. */
  flag: string
  /**
   * The event property carrying the variant on first-party rows:
   * `$feature/<flag>`, which PostHog's experiment analysis also reads natively.
   */
  property: string
  variants: readonly string[]
  control: string
  /**
   * Client events that count as "this identity saw the variant" when they
   * carry `property`. Exposure is the moment the variant was RENDERED, not the
   * moment the flag was fetched, which is why this is checkout_step and not
   * `$feature_flag_called`.
   */
  exposureEvents: readonly ClientEventName[]
  /** The server-side money moment a conversion is counted on. */
  goalEvent: ServerEventName
  /** What the variant changes, for the admin page. */
  hypothesisHe: string
  /** Hebrew label per variant, for the admin page. */
  variantLabelsHe: Readonly<Record<string, string>>
}

export const EXPERIMENTS: readonly ExperimentDefinition[] = [
  {
    key: CHECKOUT_VARIANT_FLAG,
    flag: CHECKOUT_VARIANT_FLAG,
    property: CHECKOUT_VARIANT_PROPERTY,
    variants: CHECKOUT_VARIANTS,
    control: 'control',
    exposureEvents: ['checkout_step'],
    goalEvent: 'purchase',
    hypothesisHe:
      'סיכום הזמנה מקוצר בראש עמוד התשלום, במקום הסיכום המלא בתחתית, מעלה את שיעור ההמרה מתחילת תשלום לרכישה.',
    variantLabelsHe: {
      control: 'בקרה (סיכום מלא)',
      express_summary: 'סיכום מקוצר',
    },
  },
] as const

export function experimentByKey(key: string): ExperimentDefinition | null {
  return EXPERIMENTS.find((experiment) => experiment.key === key) ?? null
}

/**
 * Generic variant resolver: anything outside the registered list is control.
 * checkout-variant.ts has its own typed version for the one flag it owns;
 * this one serves code that iterates the registry.
 */
export function resolveVariant(experiment: ExperimentDefinition, raw: unknown): string {
  return typeof raw === 'string' && experiment.variants.includes(raw) ? raw : experiment.control
}
