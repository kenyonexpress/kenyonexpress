import type { Metadata } from 'next'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata: Metadata = { title: 'איפוס סיסמה — KenyonExpress' }

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
