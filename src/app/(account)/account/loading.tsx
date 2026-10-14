import AccountContentSkeleton from '@/components/account/AccountContentSkeleton'

/**
 * The instant state for every /account page (UX27).
 *
 * Next wraps this segment's page, and every page below it, in a Suspense
 * boundary with this as the fallback, and paints it the moment a client-side
 * navigation starts, before the new page's RSC payload has arrived. Without
 * it a press on an account tab left the previous page on screen for the
 * 2.3-2.6s the new one took to stream (measured, logs/ux27/before.json).
 *
 * The same body is the `(account)/layout.tsx` Suspense fallback, which is
 * what the server's first flush carries on a direct load; see the component.
 *
 * The two dynamic pages under here (orders/[id], return/[orderId]) already
 * streamed under the layout's boundary before this file existed, so an
 * unknown id was already a streamed not-found; this file changes nothing
 * about their status code.
 */
export default function AccountLoading() {
  return <AccountContentSkeleton />
}
