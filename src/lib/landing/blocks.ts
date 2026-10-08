/**
 * The shape of a campaign landing page, as data.
 *
 * A page is a title plus an ordered list of typed blocks; an A/B variant is a
 * key, a traffic weight and optionally its own block list. The renderer
 * (`components/landing/LandingBlocks.tsx`) is a switch over `kind`, which is
 * why the set is closed: an editor composes a page from these and only these,
 * and a new composition is a code change, the same rule the home page CMS
 * states for geometry.
 *
 * Types only. The validation lives in `schema.ts` (zod, server side) so this
 * file can be imported by client components without the schema's weight.
 */

export type LandingCta = {
  label: string
  /** Site-relative (`/...`). The schema refuses anything else: no open redirect wearing a campaign hat. */
  href: string
}

export type LandingBlock =
  | {
      kind: 'hero'
      headline: string
      subheadline?: string
      imageUrl?: string
      imageAlt?: string
      cta?: LandingCta
    }
  | { kind: 'text'; title?: string; paragraphs: string[] }
  | { kind: 'benefits'; title?: string; items: { title: string; text?: string }[] }
  /** Product cards by catalogue slug; an empty list means the newest active products. */
  | { kind: 'products'; title?: string; slugs: string[]; limit?: number }
  | { kind: 'faq'; title?: string; items: { question: string; answer: string }[] }
  /** "המבצע מסתיים בעוד HH:MM:SS", ticking to `endsAt` on the visitor's device. */
  | { kind: 'countdown'; label: string; endsAt: string }
  | { kind: 'cta'; label: string; href: string; note?: string }

export type LandingBlockKind = LandingBlock['kind']

export const LANDING_BLOCK_KINDS: readonly LandingBlockKind[] = [
  'hero',
  'text',
  'benefits',
  'products',
  'faq',
  'countdown',
  'cta',
]

export type LandingVariant = {
  /** Stable key, also the value reported on the exposure event. */
  key: string
  /** Share of bucketed traffic, 0..100. Weights are normalised; they need not sum to 100. */
  weight: number
  /** This variant's body. Absent = the page's base `blocks`. */
  blocks?: LandingBlock[]
}

export type LandingPageStatus = 'draft' | 'published' | 'archived'

export const LANDING_PAGE_STATUSES: readonly LandingPageStatus[] = [
  'draft',
  'published',
  'archived',
]

export type LandingPage = {
  id: string
  slug: string
  titleHe: string
  descriptionHe: string | null
  hypothesisHe: string | null
  status: LandingPageStatus
  startsAt: string | null
  endsAt: string | null
  indexable: boolean
  /** `utm_campaign` for the page's own links; null = the slug. */
  campaign: string | null
  blocks: LandingBlock[]
  variants: LandingVariant[]
  updatedAt: string | null
  /** Which source rendered. Surfaced to the admin, never to a visitor. */
  source: 'database' | 'authored'
}

/** The body a given variant renders: its own blocks when it has them, else the page's. */
export function variantBlocks(page: Pick<LandingPage, 'blocks' | 'variants'>, variantKey: string) {
  const variant = page.variants.find((candidate) => candidate.key === variantKey)
  return variant?.blocks ?? page.blocks
}
