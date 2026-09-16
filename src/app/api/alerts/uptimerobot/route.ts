import { formatUptimeRobotAlert, parseUptimeRobotAlert } from '@/lib/alerts/uptimerobot'
import { sendAlert } from '@/lib/observability/alert'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { secretEquals } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The UptimeRobot webhook: an external monitor's word that the site is down,
 * relayed to the phone.
 *
 * WHY THIS EXISTS WHEN /api/cron/health ALREADY PAGES. The cron runs on the
 * deployment it is checking. If Vercel is down, DNS is wrong, or the
 * certificate has lapsed (all three have happened here; see
 * docs/RUNBOOK.md), the cron does not run and therefore does not page. Only
 * something outside the deployment can report that the deployment is
 * unreachable, and UptimeRobot polling /api/health from its own network is
 * that something. Its alert contact for this project is a webhook to here,
 * and here fans out to ntfy and Telegram through the same `sendAlert` every
 * money-path alert uses.
 *
 * AUTHENTICATION. UptimeRobot signs nothing and sets no headers, so the gate
 * is a shared secret in the URL, compared in constant time. Without the
 * secret set, the route is closed: an open relay here would let anyone page
 * the operator at will, which is a denial of the channel.
 *
 * GET AND POST. UptimeRobot calls the webhook URL with GET and `*placeholder*`
 * substitution unless a POST body is configured, in which case it sends form
 * or JSON. All three arrive here as one flat bag of strings; the body wins
 * over the query when both carry a field.
 */

const MAX_BODY_BYTES = 8 * 1024

function fieldsFromQuery(request: NextRequest): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of request.nextUrl.searchParams) {
    if (key !== 'secret') out[key] = value
  }
  return out
}

async function fieldsFromBody(request: NextRequest): Promise<Record<string, unknown>> {
  const raw = await request.text()
  if (!raw || raw.length > MAX_BODY_BYTES) return {}
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    try {
      const parsed: unknown = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    } catch {
      return {}
    }
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of new URLSearchParams(raw)) out[key] = value
  return out
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.UPTIMEROBOT_WEBHOOK_SECRET ?? ''
  const provided =
    request.nextUrl.searchParams.get('secret') ?? request.headers.get('x-uptimerobot-secret')
  if (!secretEquals(provided, secret)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const fields = {
    ...fieldsFromQuery(request),
    ...(request.method === 'POST' ? await fieldsFromBody(request) : {}),
  }
  const alert = parseUptimeRobotAlert(fields)
  if (!alert) {
    log.warn('uptime.alert_unparsed', { keys: Object.keys(fields).slice(0, 20) })
    return NextResponse.json({ ok: false, error: 'unrecognised alert' }, { status: 400 })
  }

  const formatted = formatUptimeRobotAlert(alert)
  const delivered = await sendAlert(formatted)

  // `error` for a down alert: this is the line an operator greps for in the
  // log drain when the phone was silent, and it must sort with the outage.
  const entry = alert.kind === 'down' ? log.error : log.info
  entry('uptime.alert_received', {
    kind: alert.kind,
    monitor: alert.monitorName,
    duration_seconds: alert.durationSeconds,
    ssl_days_left: alert.sslDaysLeft,
    delivered,
  })

  return NextResponse.json(
    { ok: true, kind: alert.kind, delivered },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  )
}

export const GET = withRequestLog('/api/alerts/uptimerobot', handle)
export const POST = withRequestLog('/api/alerts/uptimerobot', handle)
