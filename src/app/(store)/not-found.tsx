import NotFoundBody, { notFoundMetadata } from '@/components/not-found/NotFoundBody'

/**
 * This group's layout already paints the chrome, so the 404 is the bare body.
 * Without this file Next inherits the root `not-found.tsx`, which wraps the
 * body in `StoreShell`, and the header would render twice (UX25).
 */
export const metadata = notFoundMetadata

export default function NotFound() {
  return <NotFoundBody />
}
