import type { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'כניסה — KenyonExpress' }

export default function LoginPage() {
  return <LoginForm />
}
