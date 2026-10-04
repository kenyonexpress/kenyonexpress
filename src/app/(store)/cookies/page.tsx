import { t } from '@/lib/i18n/messages'
import type { Metadata } from 'next'
import LegalArticle from '../../(legal)/_components/LegalArticle'
import LegalContactBlock from '../../(legal)/_components/LegalContactBlock'
import { getLegalDoc } from '../../(legal)/_content'
import ConsentWithdrawForm from './ConsentWithdrawForm'

/**
 * The cookie policy, at the path the launch checklist names.
 *
 * Until W02 (05.10.2026) `/cookies` was a `next.config.ts` redirect onto the
 * cookies section of the privacy document. That section stays, as a summary
 * that points here, but a consent banner that names three measurement tools
 * needs a document that lists each one, what it stores, for how long, and how
 * to take the consent back. That last part is the reason this is a page and
 * not an anchor: `ConsentWithdrawForm` is the one control on the site that
 * clears the decision, and it has to live somewhere a visitor can find from
 * the footer.
 */
const doc = getLegalDoc('cookies')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: '/cookies' },
}

export default function Page() {
  return (
    <LegalArticle doc={doc}>
      <ConsentWithdrawForm />
      <LegalContactBlock intro={t('legal.cookiesPage.contactIntro')} />
    </LegalArticle>
  )
}
