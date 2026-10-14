import NotFoundBody, { notFoundMetadata } from '@/components/not-found/NotFoundBody'
import StoreShell from '@/components/store/StoreShell'

/**
 * The 404 for an URL no route matches, and the file every nested `notFound()`
 * inherits.
 *
 * Until UX25 this file was a bare page: an unmatched URL got no header, no
 * footer and no search, and a dead product slug got this file's own `<main>`
 * nested inside the store shell's (measured, logs/ux25/before.json). Now the
 * body is `components/not-found/NotFoundBody` and this file wraps it in the
 * storefront shell for the one case that has no other layout. The route
 * groups that carry their own chrome ((store), (main), (account), (legal),
 * (admin), (supplier), (auth)) each have a `not-found.tsx` that renders the
 * body bare, so a `notFound()` thrown under them paints the shell once.
 */

export const metadata = notFoundMetadata

export default function NotFound() {
  return (
    <StoreShell>
      <NotFoundBody />
    </StoreShell>
  )
}
