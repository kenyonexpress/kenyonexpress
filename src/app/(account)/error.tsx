'use client'

import ErrorBody, { type ErrorBoundaryProps } from '@/components/error/ErrorBody'

/**
 * The 500 for this route group (UX26): the shared body, rendered INSIDE the
 * group's layout, so the error page keeps the chrome the shopper was looking
 * at. Bare, because the layout already supplies the main landmark; the root
 * `error.tsx` is what catches this layout itself throwing.
 */
export default function AccountError(props: ErrorBoundaryProps) {
  return <ErrorBody {...props} segment="account" />
}
