import { debugErrorRoutesEnabled } from '@/lib/observability/debug-error-gate'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { type ReactNode, Suspense } from 'react'

/**
 * Throws during the Server Component render pass, which is the case
 * `onRequestError` reports as `routeType: 'render'` with a `renderSource` of
 * `react-server-components`.
 *
 * This is the one worth checking on every deploy, because it is the case where
 * the error object Next hands over is NOT the one that was thrown - React
 * replaces it, and `digest` is the only stable handle left. src/instrumentation.ts
 * tags that digest for exactly this reason; without it, a production RSC crash
 * is an anonymous "an error occurred" on both the page and the report.
 *
 * The Suspense boundary is required by `cacheComponents: true`; see the sibling
 * page for the build error it prevents. Throwing inside the streamed child is
 * still an RSC-pass throw, which is the whole point of the route.
 */
export default function SentryRenderErrorPage() {
  return (
    <Suspense fallback={null}>
      <ThrowDuringRender />
    </Suspense>
  )
}

/**
 * The return type is annotated because this function never returns: TypeScript
 * infers `Promise<void>`, which is not a valid JSX element type and fails the
 * build's type-check step rather than the compile step.
 */
async function ThrowDuringRender(): Promise<ReactNode> {
  await connection()

  if (!debugErrorRoutesEnabled()) notFound()

  throw new Error(`Sentry RSC-render check: debug-render-${Date.now().toString(36)}`)
}
