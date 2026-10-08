/**
 * The experiment registry: every A/B test the storefront can run, as data.
 *
 * Four entries: the checkout layout (the original), and since STEP 66 the
 * homepage hero, the product CTA copy and the checkout button colour. The
 * registry exists so the admin experiments page, the flag resolver, the
 * event-to-variant assignment and the stats table never hard-code a flag
 * key, a variant list or a goal event: each of those is a string that can
 * drift silently from its emitter, and the test beside this file locks every
 * entry to the constants the emitters actually use.
 *
 * EVERY FLAG HERE IS A MULTIVARIATE PostHog FLAG whose variant keys are
 * exactly the `variants` list, with `control` as the first key. A flag that
 * is missing from PostHog, off, or answering a key outside its list renders
 * control and stamps nothing, so a mis-typed flag can only ever mean "not in
 * the experiment", never a broken page (feature-flags.ts).
 *
 * Pure and dependency-free beyond the two constant modules it imports from,
 * so the admin page, the server loader and the client can all import it
 * without dragging fetch or a Supabase client into the bundle.
 */

import {
  CHECKOUT_VARIANTS,
  CHECKOUT_VARIANT_FLAG,
  CHECKOUT_VARIANT_PROPERTY,
} from '@/lib/analytics/checkout-variant'
import type { ClientEventName, ServerEventName } from '@/lib/analytics/events'
import { featureProperty } from '@/lib/analytics/variant-cache'

/**
 * Narrows the exposure rows of an experiment to those carrying one JSON
 * property: `props->><prop> = <value>`. The homepage experiment's exposure
 * is a `page_view`, and pulling every page_view of the month to find the
 * home page's would be most of the table.
 */
export type ExposureFilter = { prop: string; value: string }

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
   * moment the flag was fetched, which is why the checkout entry names
   * checkout_step and not `$feature_flag_called`.
   */
  exposureEvents: readonly ClientEventName[]
  /** Optional narrowing of the exposure rows, see ExposureFilter. */
  exposureFilter?: ExposureFilter
  /** The server-side money moment a conversion is counted on. */
  goalEvent: ServerEventName
  /** What the variant changes, for the admin page. */
  hypothesisHe: string
  /** Hebrew label per variant, for the admin page. */
  variantLabelsHe: Readonly<Record<string, string>>
}

/** The literal variant union of one registry entry, for typed consumers. */
export type VariantOf<E extends ExperimentDefinition> = E['variants'][number]

export const CHECKOUT_EXPERIMENT = {
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
} as const satisfies ExperimentDefinition

/**
 * The homepage. Control is the measured page (the comparison gate renders
 * control: it carries no consent cookie, so no flag is ever fetched for it).
 * `static_hero` never auto-advances the slider, even after the visitor has
 * engaged; `no_benefit_bar` hides the five-item trust bar between the hero
 * and the deals grid. Both are attribute-driven: a visitor in control gets
 * markup byte-identical to before the experiment existed.
 */
export const HOME_HERO_FLAG = 'home_hero'
export const HOME_HERO_VARIANTS = ['control', 'static_hero', 'no_benefit_bar'] as const
export type HomeHeroVariant = (typeof HOME_HERO_VARIANTS)[number]

export const HOME_HERO_EXPERIMENT = {
  key: HOME_HERO_FLAG,
  flag: HOME_HERO_FLAG,
  property: featureProperty(HOME_HERO_FLAG),
  variants: HOME_HERO_VARIANTS,
  control: 'control',
  exposureEvents: ['page_view'],
  // The route template the provider stamps on every page_view; '/' is the
  // home page and nothing else (AnalyticsProvider.routeTemplate).
  exposureFilter: { prop: 'route', value: '/' },
  goalEvent: 'purchase',
  hypothesisHe:
    'עמוד בית שקט יותר (קרוסלה שאינה מתחלפת לבד, או בלי פס היתרונות שמעל הגריד) משאיר את הדיל הראשון בפוקוס ומעלה את שיעור הרכישה מביקור בעמוד הבית.',
  variantLabelsHe: {
    control: 'בקרה (כפי שנמדד מול האתר החי)',
    static_hero: 'קרוסלה סטטית',
    no_benefit_bar: 'בלי פס היתרונות',
  },
} as const satisfies ExperimentDefinition

/**
 * The product page's buy row. Control is the live site's wording ("הוסף
 * לסל", "קנה עכשיו"); `invite` addresses the shopper in the plural and names
 * the thing they get rather than the act of paying. Copy only: the buttons,
 * their order, their handlers and the price are the same in both arms.
 */
export const CTA_COPY_FLAG = 'cta_copy'
export const CTA_COPY_VARIANTS = ['control', 'invite'] as const
export type CtaCopyVariant = (typeof CTA_COPY_VARIANTS)[number]

export const CTA_COPY_EXPERIMENT = {
  key: CTA_COPY_FLAG,
  flag: CTA_COPY_FLAG,
  property: featureProperty(CTA_COPY_FLAG),
  variants: CTA_COPY_VARIANTS,
  control: 'control',
  exposureEvents: ['view_product'],
  goalEvent: 'purchase',
  hypothesisHe:
    'נוסח הזמנה בלשון רבים שמציין מה מקבלים ("הוסיפו לסל", "קבלו את הקופון") במקום פקודה בלשון יחיד ("הוסף לסל", "קנה עכשיו") מעלה את שיעור הרכישה מצפייה במוצר.',
  variantLabelsHe: {
    control: 'בקרה (הנוסח החי)',
    invite: 'נוסח הזמנה',
  },
} as const satisfies ExperimentDefinition

/**
 * The pay button at the foot of the checkout. Control is the live site's
 * yellow (`#fed700`, measured); `green` paints it in the brand's success
 * green with white text. Colour only: size, radius, label and position are
 * the same in both arms, so the comparison gate's checkout band is unmoved.
 */
export const CHECKOUT_BUTTON_COLOR_FLAG = 'checkout_button_color'
export const CHECKOUT_BUTTON_COLOR_VARIANTS = ['control', 'green'] as const
export type CheckoutButtonColorVariant = (typeof CHECKOUT_BUTTON_COLOR_VARIANTS)[number]

export const CHECKOUT_BUTTON_COLOR_EXPERIMENT = {
  key: CHECKOUT_BUTTON_COLOR_FLAG,
  flag: CHECKOUT_BUTTON_COLOR_FLAG,
  property: featureProperty(CHECKOUT_BUTTON_COLOR_FLAG),
  variants: CHECKOUT_BUTTON_COLOR_VARIANTS,
  control: 'control',
  exposureEvents: ['checkout_step'],
  goalEvent: 'purchase',
  hypothesisHe:
    'כפתור תשלום ירוק, שנבדל מצהוב המותג שמסביבו, מעלה את שיעור ההמרה מתחילת תשלום לרכישה.',
  variantLabelsHe: {
    control: 'בקרה (צהוב)',
    green: 'ירוק',
  },
} as const satisfies ExperimentDefinition

export const EXPERIMENTS: readonly ExperimentDefinition[] = [
  CHECKOUT_EXPERIMENT,
  HOME_HERO_EXPERIMENT,
  CTA_COPY_EXPERIMENT,
  CHECKOUT_BUTTON_COLOR_EXPERIMENT,
]

export function experimentByKey(key: string): ExperimentDefinition | null {
  return EXPERIMENTS.find((experiment) => experiment.key === key) ?? null
}

/**
 * Generic variant resolver: anything outside the registered list is control.
 * checkout-variant.ts has its own typed version for the one flag it owns;
 * this one serves code that iterates the registry.
 */
export function resolveVariant<E extends ExperimentDefinition>(
  experiment: E,
  raw: unknown,
): VariantOf<E> {
  return (
    typeof raw === 'string' && experiment.variants.includes(raw) ? raw : experiment.control
  ) as VariantOf<E>
}
