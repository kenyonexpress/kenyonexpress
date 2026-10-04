import { CANONICAL_PATH, LEGAL_DOCS } from '@/app/(legal)/_content'
import type { LegalSlug } from '@/app/(legal)/_content'
import { t } from '@/lib/i18n/messages'

/**
 * The sentence next to the checkout's terms tickbox, with every legal document
 * linked from it.
 *
 * ARCHITECTURE-LEGAL-PAGES gate LP5 asks that the tickbox link the current
 * terms. Until W02 (05.10.2026) it read "קראתי ואני מסכים לאתר תנאי שימוש" with
 * no link at all: a consent to a document the shopper could not open from the
 * place they were asked to consent to it. The five documents are now named and
 * linked, in the order `LEGAL_DOCS` lists them, so a sixth document would
 * appear here by existing and the sentence cannot drift from the footer.
 *
 * TARGET _blank, ON PURPOSE. The shopper is mid-checkout, on the last step,
 * with a filled form behind them. A same-tab navigation to the terms throws
 * that away; a new tab keeps the purchase where it is. `rel="noopener noreferrer"` closes
 * the window.opener hole that `_blank` opens.
 *
 * Plain <a>, not <Link>: these are full documents, not app views to prefetch
 * on hover from inside a payment form.
 */
const LABEL_KEY: Record<LegalSlug, Parameters<typeof t>[0]> = {
  terms: 'checkout.consent.terms',
  privacy: 'checkout.consent.privacy',
  returns: 'checkout.consent.returns',
  cookies: 'checkout.consent.cookies',
  accessibility: 'checkout.consent.accessibility',
}

function LegalLink({ slug }: { slug: LegalSlug }) {
  return (
    <a
      href={CANONICAL_PATH[slug]}
      target="_blank"
      rel="noopener noreferrer"
      className="checkout-terms__link"
      title={t('checkout.consent.opensNewTab')}
    >
      {t(LABEL_KEY[slug])}
    </a>
  )
}

export default function CheckoutConsentText() {
  const slugs = LEGAL_DOCS.map((doc) => doc.slug)
  return (
    <span className="checkout-terms__text" data-checkout-consent="">
      {t('checkout.consent.lead')}{' '}
      {slugs.map((slug, index) => {
        const last = index === slugs.length - 1
        const penultimate = index === slugs.length - 2
        return (
          <span key={slug}>
            <LegalLink slug={slug} />
            {/* "a, b, c, d ve-e": the last label carries its own ו, so the
                separator before it is a space, not a comma. */}
            {last ? '' : penultimate ? ' ' : ', '}
          </span>
        )
      })}
    </span>
  )
}

/** The privacy sentence above the tickbox, with the policy linked. */
export function CheckoutPrivacyNote() {
  return (
    <p className="checkout-privacy">
      {t('checkout.consent.privacyNoteLead')}{' '}
      <a
        href={CANONICAL_PATH.privacy}
        target="_blank"
        rel="noopener noreferrer"
        className="checkout-terms__link"
        title={t('checkout.consent.opensNewTab')}
      >
        {t('checkout.consent.privacyNoteLink')}
      </a>
      .
    </p>
  )
}
