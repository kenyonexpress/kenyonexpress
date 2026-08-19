import type { Metadata } from 'next'
import LegalArticle from '../../_components/LegalArticle'
import LegalContactBlock from '../../_components/LegalContactBlock'
import { getLegalDoc } from '../../_content'

const doc = getLegalDoc('accessibility')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: '/legal/accessibility' },
}

export default function AccessibilityPage() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock
        heading="פנייה בנושא נגישות"
        intro="נתקלתם בבעיית נגישות באתר, או שאתם זקוקים לסיוע בביצוע פעולה? פנו אלינו:"
      />
    </LegalArticle>
  )
}
