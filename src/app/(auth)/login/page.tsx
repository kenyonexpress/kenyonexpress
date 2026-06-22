import type { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = { title: 'כניסה — KenyonExpress' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; magic?: string }>
}) {
  const { next, error, magic } = await searchParams
  return <LoginForm next={next} callbackError={error} magic={magic} />
}
