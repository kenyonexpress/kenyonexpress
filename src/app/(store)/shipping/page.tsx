import { publicPageMetadata } from '@/lib/seo/page-metadata'
import type { Metadata } from 'next'
import LegalArticle from '../../(legal)/_components/LegalArticle'
import LegalContactBlock from '../../(legal)/_components/LegalContactBlock'
import { getLegalDoc } from '../../(legal)/_content'

/**
 * The shipping and delivery policy, at the short path the goal names.
 *
 * Unlike the four older documents this one has no WordPress ancestor, so
 * there is no legacy URL to keep and `/shipping` IS the canonical path. The
 * text, the tables and the dates all come from `(legal)/_content/shipping.ts`,
 * which reads the method and carrier registries, so this file is only the
 * route and the head.
 */
const doc = getLegalDoc('shipping')

export const metadata: Metadata = publicPageMetadata({
  title: doc.title,
  description: doc.description,
  path: doc.path,
})

export default function Page() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock intro="לבירור על משלוח שהתעכב, לשינוי כתובת לפני המשלוח או לדיווח על מוצר שהגיע פגום, אנחנו זמינים בערוצים הבאים:" />
    </LegalArticle>
  )
}
