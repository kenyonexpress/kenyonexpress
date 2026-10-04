import { t } from '@/lib/i18n/messages'
import { withdrawConsent } from '@/server/actions/consent'

/**
 * The one control that takes a consent decision back.
 *
 * The privacy document promised the decision "can be changed at any time
 * through the banner", and the banner is hidden by CSS the moment a decision
 * exists, so there was nowhere to change it. This form clears `ke_consent`;
 * the pre-paint snippet then finds no decision on the next response and the
 * banner comes back, with nothing loaded until the visitor answers again.
 *
 * A Server Component with a form action, like the banner itself: no client
 * bundle for one button. It renders for every visitor, decided or not, because
 * the server cannot know without reading cookies, and reading cookies would
 * turn a static legal page into a request-time render. Clearing a cookie that
 * is not there is harmless, and the copy says what happens either way.
 */
export default function ConsentWithdrawForm() {
  return (
    <section
      aria-labelledby="consent-withdraw"
      className="legal-consent-withdraw"
      data-consent-withdraw=""
    >
      <h2 id="consent-withdraw" className="legal-consent-withdraw__title">
        {t('legal.withdraw.title')}
      </h2>
      <p className="legal-consent-withdraw__copy">{t('legal.withdraw.copy')}</p>
      <form action={withdrawConsent}>
        <button type="submit" className="legal-consent-withdraw__button">
          {t('legal.withdraw.button')}
        </button>
      </form>
    </section>
  )
}
