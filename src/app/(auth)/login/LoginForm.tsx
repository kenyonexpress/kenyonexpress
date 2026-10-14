'use client'

import LoginPanel, { type LoginPanelProps } from '@/components/auth/LoginPanel'

/**
 * The /login page's card: a heading over the shared login body. Every way in
 * (Google, passkey, the email / SMS tabs, the magic link) lives in
 * `LoginPanel`, which the storefront's login dialog renders too (UX23), so the
 * page and the dialog cannot drift.
 */
export default function LoginForm(props: Omit<LoginPanelProps, 'variant'>) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-xl font-semibold mb-6">כניסה לחשבון</h2>
      <LoginPanel {...props} variant="page" />
    </div>
  )
}
