import type { Metadata } from 'next'
import MfaChallengeForm from './MfaChallengeForm'

export const metadata: Metadata = { title: 'אימות דו-שלבי — KenyonExpress' }

export default function MfaPage() {
  return <MfaChallengeForm />
}
