import { debugErrorRoutesEnabled } from '@/lib/observability/debug-error-gate'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { type ReactNode, Suspense } from 'react'

/**
 * The storefront twin of `/debug/sentry/render` (UX26): throws during the
 * Server Component render pass INSIDE the store shell, so the error page a
 * shopper actually sees, `(store)/error.tsx` under the header and the
 * footer, can be opened on a built server and on a deploy. The root route
 * exercises the root boundary (no layout but the root one); without this one
 * the in-shell boundary could only be verified by breaking a real page.
 *
 * Same gate, same 404 by default, same Suspense for `cacheComponents`; see
 * the root route and `lib/observability/debug-error-gate.ts`.
 */
export default function SentryStoreRenderErrorPage() {
  return (
    <Suspense fallback={null}>
      <ThrowDuringRender />
    </Suspense>
  )
}

async function ThrowDuringRender(): Promise<ReactNode> {
  await connection()

  if (!debugErrorRoutesEnabled()) notFound()

  throw new Error(`Sentry store-render check: debug-store-render-${Date.now().toString(36)}`)
}
