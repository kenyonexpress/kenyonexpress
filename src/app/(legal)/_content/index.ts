import { accessibilityDoc } from './accessibility'
import { cookiesDoc } from './cookies'
import { privacyDoc } from './privacy'
import { returnsDoc } from './returns'
import { shippingDoc } from './shipping'
import { termsDoc } from './terms'
import type { LegalDoc, LegalSlug } from './types'

/**
 * The legal documents, in the order they are listed to a reader: what you
 * agreed to, what happens to your data and what sits in your browser, how you
 * get out of a purchase, how a parcel reaches you, and how to use the site if
 * you rely on assistive technology.
 *
 * The array is the single source for the footer link list, for the sitemap
 * and for the page registry, so a document cannot exist as a page and be
 * missing from the navigation, which is the failure mode that leaves a policy
 * unreachable. Each document carries its own public `path`; nothing here
 * derives a URL from a slug.
 */
export const LEGAL_DOCS: readonly LegalDoc[] = [
  termsDoc,
  privacyDoc,
  cookiesDoc,
  returnsDoc,
  shippingDoc,
  accessibilityDoc,
]

export type { LegalSlug }

export function getLegalDoc(slug: LegalSlug): LegalDoc {
  const doc = LEGAL_DOCS.find((candidate) => candidate.slug === slug)
  if (!doc) throw new Error(`Unknown legal document: ${slug}`)
  return doc
}
