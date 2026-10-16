'use client'

import {
  DEPENDENCY_COPY,
  type HealthState,
  READY_COPY,
  type ReadyCheck,
  probeReady,
} from '@/lib/health/public-status'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The public status panel (UX26): `/api/ready` read from the BROWSER, every
 * thirty seconds and on demand, into a headline and the five services.
 *
 * WHY THE BROWSER AND NOT THE SERVER. The page exists for the minute the
 * site is broken. A server-rendered status page is rendered by the thing
 * that is broken, and under `cacheComponents` a request-time read here would
 * also make the page dynamic. So the page is a static shell with no data
 * read at all, and the panel asks the readiness route after hydration: a
 * probe that fails renders as "could not check" (`unknown`), which is the
 * honest answer from a browser that cannot reach the server.
 *
 * NO CLOCK ON THE SERVER. "Last checked" is set in the browser after the
 * first answer and rendered as a time in Israel; the prerender carries no
 * timestamp and the hydration cannot mismatch.
 */

export const STATUS_REFRESH_MS = 30_000

const DOT: Record<HealthState, string> = {
  checking: 'bg-muted animate-pulse motion-reduce:animate-none',
  ok: 'bg-success',
  degraded: 'bg-error',
  unknown: 'bg-muted',
}

const CHECK_DOT: Record<ReadyCheck['status'], string> = {
  ok: 'bg-success',
  down: 'bg-error',
  not_configured: 'bg-muted',
}

const timeFormat = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

export default function StatusPanel({ refreshMs = STATUS_REFRESH_MS }: { refreshMs?: number }) {
  const [state, setState] = useState<HealthState>('checking')
  const [checks, setChecks] = useState<ReadyCheck[]>([])
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  const refresh = useCallback(async () => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    setBusy(true)
    const snapshot = await probeReady(fetch, controller.signal)
    if (controller.signal.aborted) return
    setState(snapshot.state)
    setChecks(snapshot.checks)
    setCheckedAt(timeFormat.format(new Date()))
    setBusy(false)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), refreshMs)
    return () => {
      window.clearInterval(timer)
      inFlight.current?.abort()
    }
  }, [refresh, refreshMs])

  return (
    <div
      data-status-panel
      data-state={state}
      className="rounded-md border border-border bg-surface p-4 text-heading md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <output aria-live="polite" className="flex items-center gap-2 font-bold">
          <span aria-hidden="true" className={`size-3 shrink-0 rounded-full ${DOT[state]}`} />
          <span>{READY_COPY[state]}</span>
        </output>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          className="inline-flex min-h-touch-min items-center rounded-pill border border-border px-4 text-sm font-bold text-heading transition-colors hover:bg-surface-hover disabled:opacity-60"
        >
          {busy ? 'בודקים…' : 'בדקו שוב'}
        </button>
      </div>

      {checks.length > 0 ? (
        <ul className="m-0 mt-4 list-none divide-y divide-border p-0">
          {checks.map((check) => (
            <li
              key={check.name}
              data-status-check={check.name}
              data-status={check.status}
              className="flex min-h-touch-min items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`size-2.5 shrink-0 rounded-full ${CHECK_DOT[check.status]}`}
                />
                {check.label}
              </span>
              <span className={check.status === 'down' ? 'font-bold text-error' : 'text-muted'}>
                {DEPENDENCY_COPY[check.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p data-status-checked className="mt-4 mb-0 text-xs text-muted">
        {checkedAt ? (
          <>
            נבדק לאחרונה בשעה <span dir="ltr">{checkedAt}</span> (שעון ישראל). הבדיקה חוזרת כל חצי
            דקה.
          </>
        ) : (
          'הבדיקה רצה מהדפדפן שלכם מול השרת.'
        )}
      </p>
    </div>
  )
}
