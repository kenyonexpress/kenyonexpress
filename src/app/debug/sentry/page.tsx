import { debugErrorRoutesEnabled } from '@/lib/observability/debug-error-gate'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Suspense } from 'react'

/**
 * The Server Function half of the Sentry wiring check.
 *
 * `onRequestError` receives a `routeType` that separates the three ways server
 * code can fail, and each needs its own trigger because they travel different
 * paths inside Next:
 *
 *   'route'  -> /api/debug/sentry            (a Route Handler)
 *   'render' -> /debug/sentry/render         (a Server Component)
 *   'action' -> the form below               (a Server Function)
 *
 * The form is a plain `<form action={...}>` with no client component anywhere,
 * so it submits without JavaScript. That is deliberate: a check that needed
 * hydration to work could not distinguish "Server Functions do not report" from
 * "the button never ran".
 *
 * Everything here is behind the same gate and 404s by default.
 *
 * THE SUSPENSE BOUNDARY IS REQUIRED, not stylistic. This project sets
 * `cacheComponents: true`, under which `connection()` at the top of the page
 * fails the BUILD, not a request:
 *
 *   Error: Route "/debug/sentry": Uncached data was accessed outside of
 *   <Suspense>. ... Export encountered an error, exiting the build.
 *
 * So the uncached read is pushed into a child the shell can stream around.
 * `connection()` itself is what keeps the gate a runtime decision - without it
 * the env var is read while building and the 404 is baked into the output,
 * which would make SENTRY_DEBUG_ROUTES do nothing on an already-built deploy.
 */
export default function SentryDebugPage() {
  return (
    <Suspense fallback={null}>
      <GatedDebugPanel />
    </Suspense>
  )
}

async function GatedDebugPanel() {
  await connection()

  if (!debugErrorRoutesEnabled()) notFound()

  async function throwFromServerAction(): Promise<void> {
    'use server'
    throw new Error(`Sentry server-action check: debug-action-${Date.now().toString(36)}`)
  }

  return (
    <main dir="rtl" style={{ padding: '2rem', maxWidth: '40rem', lineHeight: 1.8 }}>
      <h1>בדיקת חיווט Sentry</h1>
      <p>
        כל אחד מהשלושה זורק שגיאה מסוג אחר, כדי לוודא ש-<code>onRequestError</code> תופס את שלושתם.
        חפשו ב-Sentry את המחרוזת שמוצגת בשגיאה.
      </p>

      <form action={throwFromServerAction}>
        <button type="submit">זרוק שגיאה מ-Server Action</button>
      </form>

      <ul>
        <li>
          <a href="/debug/sentry/render">שגיאה בזמן רינדור של Server Component</a>
        </li>
        <li>
          <a href="/api/debug/sentry">שגיאה ב-Route Handler</a>
        </li>
      </ul>
    </main>
  )
}
