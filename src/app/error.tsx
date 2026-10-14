'use client'

import ErrorBody, { type ErrorBoundaryProps } from '@/components/error/ErrorBody'

/**
 * The 500 boundary for everything under the root layout, and the file every
 * nested error falls back to when a route group's LAYOUT is what threw.
 *
 * Until UX26 this file was the whole 500 page, and it rendered with no chrome
 * for every error in the app, because no route group had an `error.tsx` of
 * its own. Now the body is `components/error/ErrorBody` and every route group
 * with a layout carries an `error.tsx` that renders it inside that layout
 * (header, footer, the group's own `<main>`). This file is what remains for
 * the one case no group can catch, a layout crash, so it supplies the `<main>`
 * the layout would have, and nothing else: a client file cannot render the
 * server-side shell.
 *
 * Named AppError rather than Error: Next only cares that this file default
 * exports the boundary, and calling it Error shadows the global inside its
 * own props type.
 */
export default function AppError(props: ErrorBoundaryProps) {
  return (
    <main id="main-content" dir="rtl" className="min-h-screen bg-white">
      <ErrorBody {...props} segment="root" />
    </main>
  )
}
