import type { Metadata } from 'next'
import LegalArticle from '../../_components/LegalArticle'
import LegalContactBlock from '../../_components/LegalContactBlock'
import { getLegalDoc } from '../../_content'

const doc = getLegalDoc('privacy')

export const metadata: Metadata = {
  title: doc.title,
  description: doc.description,
  alternates: { canonical: '/legal/privacy' },
}

export default function PrivacyPage() {
  return (
    <LegalArticle doc={doc}>
      <LegalContactBlock
        heading="פנייה בענייני פרטיות"
        intro="לבקשת עיון במידע, לתיקונו, למחיקת חשבון, להסרה מדיוור או לכל שאלה בנושא פרטיות:"
      />
    </LegalArticle>
  )
}
