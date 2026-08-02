import type { Metadata } from 'next'
import ForgotPasswordForm from './ForgotPasswordForm'

export const metadata: Metadata = { title: 'שחזור סיסמה — KenyonExpress' }

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />
}
