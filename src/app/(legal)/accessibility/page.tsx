import { alternatesFor } from '@/lib/seo/alternates'
import type { Metadata } from 'next'
import LegalArticle from '../_components/LegalArticle'
import LegalContactBlock from '../_components/LegalContactBlock'
import { getLegalDoc } from '../_content'

/**
 * הצהרת נגישות, at `/accessibility`. Same URL as before; the page moved from
 * the store group into the legal group so the four binding documents share
 * one chrome, one renderer and one route group (F42). Written to the Equal
 * Rights for Persons with Disabilities (Service Accessibility Adjustments)
 * Regulations and IS 5568 level AA.
 */
const doc = getLegalDoc('accessibility')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: alternatesFor('/accessibility'),
}

export default function Page() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock intro="נתקלתם במחסום נגישות באתר? נשמח לשמוע ולתקן. אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
