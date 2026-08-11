import { accessibilityStatement } from '@/content/legal/accessibility'
import { cancellationPolicy } from '@/content/legal/cancellation'
import type { LegalDocument } from '@/content/legal/types'
import { privacyPolicy, termsAndConditions } from '@/content/legal/wp-migrated'

/**
 * The legal documents, by the path they are served at.
 *
 * THE PATHS ARE THE OLD SITE'S PATHS, ON PURPOSE
 *
 * `/privacy-policy`, `/terms-and-conditions` and `/refund_returns` are the
 * URLs kenyonexpress.co.il publishes today, and `GO-LIVE.md` lists them as
 * five old pages with no target that make `redirect_coverage` fail 98/103.
 * Serving them at the same paths is what closes that without inventing a
 * redirect: an invented target is a missing page turned into a quiet
 * redirection to the wrong content, which is why they were left unmapped.
 *
 * `/refund_returns` keeps WordPress's underscore. It is ugly and it is the
 * address printed on receipts and indexed by search engines.
 */
export const LEGAL_PAGES = {
  'privacy-policy': {
    title: privacyPolicy.title,
    updatedAt: '2026-08-07',
    description:
      'מדיניות הפרטיות של קניון אקספרס: איזה מידע נאסף, איך משתמשים בו, עוגיות וזכויותיכם במידע.',
    blocks: privacyPolicy.blocks,
  } satisfies LegalDocument,

  'terms-and-conditions': {
    title: termsAndConditions.title,
    updatedAt: '2026-08-07',
    description: 'תקנון האתר של קניון אקספרס: תנאי השימוש, הרכישה, ההחזרות והאחריות באתר.',
    blocks: termsAndConditions.blocks,
  } satisfies LegalDocument,

  refund_returns: cancellationPolicy,
  accessibility: accessibilityStatement,
} as const

export type LegalPageSlug = keyof typeof LEGAL_PAGES

export const LEGAL_PAGE_SLUGS = Object.keys(LEGAL_PAGES) as LegalPageSlug[]

export function getLegalPage(slug: LegalPageSlug): LegalDocument {
  return LEGAL_PAGES[slug]
}
