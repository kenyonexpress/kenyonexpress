import type { Metadata } from 'next'
import SignupForm from './SignupForm'

export const metadata: Metadata = { title: 'הרשמה — KenyonExpress' }

export default function SignupPage() {
  return <SignupForm />
}
