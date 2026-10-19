import { accessibilityDoc } from './accessibility'
import { cookiesDoc } from './cookies'
import { privacyDoc } from './privacy'
import { returnsDoc } from './returns'
import { termsDoc } from './terms'
import type { LegalDoc } from './types'

/**
 * The legal documents of this route group, in the order they are listed to a
 * reader: what you agreed to, what happens to your data, what is stored in
 * your browser, how you get out of a purchase, and how to use the site if you
 * rely on assistive technology.
 *
 * Cookies sits directly after privacy because it is the detail behind that
 * document's `cookies` section, and a reader who follows the question that far
 * should not have to go back to the footer to continue it.
 *
 * The array is the single source for the footer link list and for the route
 * registry, so a document cannot exist as a page and be missing from the
 * navigation, which is the failure mode that leaves a policy unreachable.
 */
export const LEGAL_DOCS: readonly LegalDoc[] = [
  termsDoc,
  privacyDoc,
  cookiesDoc,
  returnsDoc,
  accessibilityDoc,
]

export type LegalSlug = LegalDoc['slug']

export function getLegalDoc(slug: LegalSlug): LegalDoc {
  const doc = LEGAL_DOCS.find((candidate) => candidate.slug === slug)
  if (!doc) throw new Error(`Unknown legal document: ${slug}`)
  return doc
}
