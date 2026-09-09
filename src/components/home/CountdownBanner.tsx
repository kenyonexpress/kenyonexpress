'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * A banner counting down to a deadline.
 *
 * IT IS A CLIENT COMPONENT AND THAT IS FORCED, not preferred. Everything else
 * a home page section renders is server-rendered and prerendered;
 * `cacheComponents` treats reading the clock in a prerendered Server Component
 * as a build error, which is the same wall that pushed the schedule into
 * `v_homepage_sections_live`. A counter is the clock, once a second, so it has
 * to run in the browser.
 *
 * THE FIRST PAINT SHOWS THE DEADLINE, NOT THE DIGITS. Rendering a computed
 * remaining time on the server would be a hydration mismatch by construction:
 * the server's number is stale by the time the browser reads it. So the static
 * markup carries the date, and the digits replace it on the first tick. Nothing
 * moves vertically when they do - both are one line - which is what keeps this
 * out of CLS on the LCP page.
 *
 * A PASSED DEADLINE RENDERS NOTHING. The section's own schedule (`ends_at`)
 * controls whether the banner is on the page at all and is a separate decision:
 * an operator may want the banner up until 2am for a sale that ended at
 * midnight. What they never want is a counter reading a negative number, or
 * "00:00:00" sitting there for two hours as if the sale were about to start.
 */

type Remaining = { days: number; hours: number; minutes: number; seconds: number } | null

function remainingFrom(deadline: number, now: number): Remaining {
  const ms = deadline - now
  if (ms <= 0) return null
  const seconds = Math.floor(ms / 1000)
  return {
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  }
}

const pad = (value: number) => value.toString().padStart(2, '0')

export default function CountdownBanner({
  title,
  subtitle,
  deadline,
  linkUrl,
  ctaLabel,
}: {
  title: string | null
  subtitle: string | null
  deadline: string
  linkUrl?: string
  ctaLabel?: string
}) {
  const target = new Date(deadline).getTime()
  const [remaining, setRemaining] = useState<Remaining>(null)
  const [ticking, setTicking] = useState(false)

  useEffect(() => {
    if (!Number.isFinite(target)) return
    const tick = () => {
      setRemaining(remainingFrom(target, Date.now()))
      setTicking(true)
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [target])

  if (!Number.isFinite(target)) return null
  // Passed, and the browser has confirmed it. Before the first tick `ticking`
  // is false and the static date is what shows, so a visitor never sees the
  // banner appear and then vanish.
  if (ticking && remaining === null) return null

  const printedDeadline = new Date(target).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <section
      aria-label={title ?? 'ספירה לאחור'}
      className="mx-auto w-full max-w-deals px-deals-pad py-6 md:px-deals-pad-md xl:px-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-brand px-5 py-4">
        <div>
          {title && <p className="text-lg font-bold text-heading">{title}</p>}
          {subtitle && <p className="mt-1 text-sm text-heading/80">{subtitle}</p>}
        </div>

        {/* dir="ltr" because a duration is a number and reads left to right in
            Hebrew too, the same way the price and the phone number do. */}
        <p
          dir="ltr"
          className="font-mono text-2xl font-bold text-heading tabular-nums"
          aria-live="off"
        >
          {remaining
            ? `${remaining.days > 0 ? `${remaining.days}:` : ''}${pad(remaining.hours)}:${pad(remaining.minutes)}:${pad(remaining.seconds)}`
            : printedDeadline}
        </p>

        {linkUrl && (
          <Link
            href={linkUrl}
            className="rounded-lg bg-heading px-5 py-2.5 text-sm font-semibold text-white"
          >
            {ctaLabel ?? 'לדילים'}
          </Link>
        )}
      </div>
    </section>
  )
}
