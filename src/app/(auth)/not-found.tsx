import NotFoundBody, { notFoundMetadata } from '@/components/not-found/NotFoundBody'

/**
 * This group's layout already paints its own chrome, so the 404 is the bare
 * body, and compact: no storefront search and no category tiles here. Without
 * this file Next inherits the root `not-found.tsx`, which wraps the body in
 * `StoreShell`, and the storefront header would render inside this layout
 * (UX25).
 */
export const metadata = notFoundMetadata

export default function NotFound() {
  return <NotFoundBody compact />
}
