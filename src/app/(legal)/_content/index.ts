import { privacyDoc } from './privacy'
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
export const LEGAL_DOCS: readonly LegalDoc[] = [termsDoc, privacyDoc]

export type LegalSlug = LegalDoc['slug']

export function getLegalDoc(slug: LegalSlug): LegalDoc {
  const doc = LEGAL_DOCS.find((candidate) => candidate.slug === slug)
  if (!doc) throw new Error(`Unknown legal document: ${slug}`)
  return doc
}
