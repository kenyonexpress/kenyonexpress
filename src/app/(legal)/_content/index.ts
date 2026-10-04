import { accessibilityDoc } from './accessibility'
import { cookiesDoc } from './cookies'
import { privacyDoc } from './privacy'
import { returnsDoc } from './returns'
import { termsDoc } from './terms'
import type { LegalDoc } from './types'

/**
 * The legal documents of this route group, in the order they are listed to a
 * reader: what you agreed to, what happens to your data, how you get out of a
 * purchase, and how to use the site if you rely on assistive technology.
 *
 * The array is the single source for the footer link list and for the route
 * registry, so a document cannot exist as a page and be missing from the
 * navigation, which is the failure mode that leaves a policy unreachable.
 */
export const LEGAL_DOCS: readonly LegalDoc[] = [
  termsDoc,
  privacyDoc,
  returnsDoc,
  cookiesDoc,
  accessibilityDoc,
]

export type LegalSlug = LegalDoc['slug']

/**
 * The one public URL of each document.
 *
 * Four of them are the WordPress paths the old site already had indexed and
 * the footer always linked; `/legal/<slug>` only redirects here, so every link
 * in the app points at the canonical path and skips the hop. The cookie policy
 * is the one document born after the migration, so it gets the short path the
 * launch checklist names. `legal-routes.test.ts` holds `next.config.ts` to
 * these (aliases onto them, never a second page).
 *
 * Read by the footer link list, the sitemap and the checkout consent sentence,
 * so a document cannot be reachable from one and missing from another.
 */
export const CANONICAL_PATH: Record<LegalSlug, string> = {
  terms: '/terms-and-conditions',
  privacy: '/privacy-policy',
  returns: '/refund_returns',
  cookies: '/cookies',
  accessibility: '/accessibility',
}

export function legalPath(slug: LegalSlug): string {
  return CANONICAL_PATH[slug]
}

export function getLegalDoc(slug: LegalSlug): LegalDoc {
  const doc = LEGAL_DOCS.find((candidate) => candidate.slug === slug)
  if (!doc) throw new Error(`Unknown legal document: ${slug}`)
  return doc
}
