'use client'

import { SegmentErrorBoundary } from '@/components/errors/SegmentErrorBoundary'
import { t } from '@/lib/i18n/messages'

/**
 * Sign-in, sign-up, password reset and the MFA screens.
 * The storefront home page is the wrong escape here: somebody who was trying to
 * log in wants the login form back, and a customer mid password-reset would
 * otherwise lose the flow with no way back into it.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SegmentErrorBoundary
      error={error}
      reset={reset}
      boundary="auth"
      title={t('errorBoundary.authTitle')}
      body={t('errorBoundary.authBody')}
      homeHref="/login"
      homeLabel={t('errorBoundary.login')}
    />
  )
}
