import type { Metadata } from 'next'
import MfaChallengeForm from './MfaChallengeForm'

export const metadata: Metadata = { title: 'אימות דו-שלבי — קניון EXPRESS' }

export default function MfaPage() {
  return <MfaChallengeForm />
}
