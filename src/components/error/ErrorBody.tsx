'use client'

import WhatsAppIcon from '@/components/shared/WhatsAppIcon'
import { markSessionBuggy } from '@/lib/analytics/replay-trigger'
import {
  HEALTH_COPY,
  HEALTH_PROBE_TIMEOUT_MS,
  type HealthState,
  STATUS_PATH,
  probeHealth,
} from '@/lib/health/public-status'
import { withSentry } from '@/lib/observability/sentry-browser'
import { storeWhatsAppLink } from '@/lib/whatsapp'
import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * THE 500 BODY, shared by every `error.tsx` in the app (UX26, 15.10.2026).
 *
 * MEASURED BEFORE (logs/ux26/before.json, the build of HEAD 7d1562a86 at
 * 380 / 768 / 1440 with the debug-throw gate on): a Server Component that
 * threw rendered the root `error.tsx` with NO storefront chrome (header
 * false, footer false, no skip link), a grey ⚠️ glyph, the heading, one
 * sentence, "נסו שוב" and "לדף הבית", and the digest as a bare grey number.
 * It offered no way to tell "is it just this page?" from "is the site down?",
 * no way to reach a person, and the browser tab kept the home page's title.
 * There was no `error.tsx` under any route group, so the store shell was
 * never painted around an error; and `/status` was a 404.
 *
 * WHY ONE BODY AND SEVERAL FILES, like the 404 (`not-found/NotFoundBody`).
 * Next renders the NEAREST `error.tsx` inside the layouts above it: a file
 * under `(store)` renders inside `StoreShell`, with the header and the
 * footer, while the root file is what a layout crash falls back to and has
 * only the root layout around it. So the root file wraps this body in its own
 * `<main>`, and every route group with a layout carries an `error.tsx` that
 * renders the body bare, inside the group's `<main>`. This component is
 * therefore NOT a `<main>`.
 *
 * WHAT IT OFFERS, in order: the brand mark (the 404's bag with an exclamation
 * and a 500 pill), the heading the suites look for, one sentence, retry in
 * place first (most of these are transient: a dropped connection, a cold
 * start) then home, the STATUS CHECK (one round trip to `/api/health` after
 * mount, read into one sentence: "just this page" / "a general outage" /
 * "could not check", with a link to `/status` for the table), the SUPPORT
 * BUTTON (WhatsApp through `lib/whatsapp`, the one store number, with the
 * page and the digest already in the message so support gets the handle
 * without asking for it; the contact form beside it), and the digest labelled
 * as what it is. The digest is shown deliberately: it is the only handle
 * support has on which server-side error a caller hit, and it carries no
 * detail of its own.
 *
 * REPORTING stays here, once per error: the plain SDK on demand (a static
 * import would put ~95 KB gzipped back on every route's first load, since
 * the root boundary is in the root layout's client graph), tagged with the
 * boundary, the segment and the digest; the bare console line that still
 * works when the DSN is unset; and the replay flag, because a boundary
 * CATCHES the error and nothing else ever sees it.
 */

export const ERROR_HEADING = 'משהו השתבש אצלנו'

/** The tab title while the boundary is up; the page's own title says nothing about an error. */
export const ERROR_PAGE_TITLE = 'משהו השתבש | קניון אקספרס'

export type ErrorSegment =
  | 'root'
  | 'store'
  | 'main'
  | 'account'
  | 'legal'
  | 'admin'
  | 'supplier'
  | 'auth'

/** What Next hands an `error.tsx`; every boundary file forwards it unchanged. */
export type ErrorBoundaryProps = {
  error: Error & { digest?: string }
  reset: () => void
}

type Props = ErrorBoundaryProps & {
  /** Which boundary file rendered the body; a Sentry tag, nothing visual. */
  segment: ErrorSegment
}

/** The WhatsApp opener, with the page and the digest so support never has to ask. */
export function supportMessage(digest?: string, path?: string): string {
  const lines = ['שלום, נתקלתי בתקלה באתר קניון אקספרס.']
  if (path) lines.push(`הדף: ${path}`)
  if (digest) lines.push(`קוד תקלה: ${digest}`)
  return lines.join('\n')
}

const DOT: Record<HealthState, string> = {
  checking: 'bg-muted animate-pulse motion-reduce:animate-none',
  ok: 'bg-success',
  degraded: 'bg-error',
  unknown: 'bg-muted',
}

function BrandMark() {
  return (
    <div
      data-error-mark
      aria-hidden="true"
      className="relative flex size-28 items-center justify-center rounded-full bg-brand-primary text-heading md:size-32"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        width="64"
        height="64"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-14 md:size-16"
      >
        {/* The same bag as the 404 mark, handles up. */}
        <path d="M14 22h36l-3 32H17L14 22Z" />
        <path d="M24 22v-4a8 8 0 0 1 16 0v4" />
        {/* An exclamation on the bag: the bag is fine, something else broke. */}
        <path d="M32 31v9" />
        <circle cx="32" cy="46" r="0.5" fill="currentColor" />
      </svg>
      <span className="absolute -bottom-2 rounded-pill border-2 border-white bg-heading px-3 py-0.5 text-sm font-black tracking-wider text-white">
        500
      </span>
    </div>
  )
}

export default function ErrorBody({ error, reset, segment }: Props) {
  const [health, setHealth] = useState<HealthState>('checking')
  const [path, setPath] = useState<string | undefined>(undefined)

  useEffect(() => {
    // The plain SDK, not the helpers in lib/observability: those run on
    // @sentry/node and tag everything area=payments, so importing them into a
    // client boundary would both fail to bundle and mislabel every UI error as
    // a money-path one. `digest` is tagged because it is the only handle that
    // ties the browser event to the server-side one onRequestError reported.
    withSentry((Sentry) => {
      Sentry.withScope((scope) => {
        scope.setTag('boundary', 'app-error')
        scope.setTag('segment', segment)
        if (error.digest) scope.setTag('digest', error.digest)
        Sentry.captureException(error)
      })
    })

    // Kept alongside, not replaced: lib/observability/log.ts reads its request
    // id from node:async_hooks, which is a build error in a client bundle, so
    // this stays a bare console line. It is also what still works when the
    // DSN is unset and every Sentry call above is inert.
    console.error('app error boundary:', error.digest ?? '', error)

    // A boundary rendering is the clearest "this session is buggy" there is,
    // and like the Sentry call above it is the ONLY signal: the boundary
    // caught the error, so the recorder's window listeners never saw it.
    markSessionBuggy('error_boundary')
  }, [error, segment])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the probe runs again for every new error the boundary catches (a retry that fails again), not only once per mount
  useEffect(() => {
    // One round trip, aborted on unmount or on a retry that re-renders the
    // boundary with a new error; a timeout so a hung server reads as
    // "could not check" instead of "checking…" forever.
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), HEALTH_PROBE_TIMEOUT_MS)
    setHealth('checking')
    probeHealth(fetch, controller.signal).then((state) => {
      if (!controller.signal.aborted) setHealth(state)
    })
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [error])

  useEffect(() => {
    setPath(`${window.location.pathname}${window.location.search}`)
    const previous = document.title
    document.title = ERROR_PAGE_TITLE
    return () => {
      document.title = previous
    }
  }, [])

  const whatsapp = storeWhatsAppLink(supportMessage(error.digest, path))

  return (
    <div
      data-error
      dir="rtl"
      className="mx-auto w-full max-w-deals px-deals-pad py-10 font-sans md:px-deals-pad-md md:py-14 xl:px-0"
    >
      <section className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <BrandMark />
        <h1 className="mt-6 text-2xl font-bold text-heading md:text-3xl">{ERROR_HEADING}</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted md:text-base">
          התקלה נרשמה אצלנו ואנחנו מטפלים בה. לרוב מדובר בתקלה רגעית, ונסיון נוסף מסדר אותה.
        </p>

        <nav
          aria-label="דרכים להמשיך"
          className="mt-6 flex flex-wrap items-center justify-center gap-3"
        >
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-touch-min items-center rounded-pill bg-brand-primary px-6 text-sm font-bold text-heading transition-colors hover:bg-brand-primary-hover"
          >
            נסו שוב
          </button>
          <Link
            href="/"
            className="inline-flex min-h-touch-min items-center rounded-pill border border-border px-6 text-sm font-bold text-heading transition-colors hover:bg-surface-hover"
          >
            לדף הבית
          </Link>
        </nav>

        <div
          data-error-status
          data-state={health}
          className="mt-6 flex w-full max-w-md flex-col items-center gap-1 rounded-elevated border border-border bg-surface px-4 py-3 text-sm text-heading"
        >
          {/* <output>, not a <p role="status">: the same implicit role, as the
              cart line and the contact form do it. */}
          <output aria-live="polite" className="flex items-start gap-2 text-start">
            <span
              aria-hidden="true"
              className={`mt-1.5 size-2.5 shrink-0 rounded-full ${DOT[health]}`}
            />
            <span>{HEALTH_COPY[health]}</span>
          </output>
          <Link
            href={STATUS_PATH}
            className="inline-flex min-h-touch-min items-center font-bold text-link underline-offset-2 hover:underline"
          >
            לדף מצב המערכת
          </Link>
        </div>

        <div data-error-help className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {whatsapp ? (
            <a
              data-error-support
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-touch-min items-center gap-2 rounded-pill bg-whatsapp px-5 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              <WhatsAppIcon size={22} />
              פנייה לתמיכה בוואטסאפ
            </a>
          ) : null}
          <Link
            href="/contact"
            {...(whatsapp ? {} : { 'data-error-support': true })}
            className="inline-flex min-h-touch-min items-center rounded-pill border border-border px-5 text-sm font-bold text-heading transition-colors hover:bg-surface-hover"
          >
            טופס יצירת קשר
          </Link>
        </div>

        {error.digest ? (
          <p data-error-digest className="mt-6 text-xs text-muted">
            קוד תקלה לתמיכה:{' '}
            <code
              dir="ltr"
              className="rounded bg-surface-hover px-1.5 py-0.5 font-mono text-heading"
            >
              {error.digest}
            </code>
          </p>
        ) : null}
      </section>
    </div>
  )
}
