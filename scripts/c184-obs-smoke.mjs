#!/usr/bin/env node
/**
 * C184 live observability smoke test.
 *
 *   SENTRY_DSN=https://<key>@<host>/<project> \
 *   NEXT_PUBLIC_POSTHOG_KEY=phc_... [NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com] \
 *   [POSTHOG_PERSONAL_API_KEY=phx_... POSTHOG_PROJECT_ID=123] \
 *   [WEBHOOK_BASE=https://www.kenyonexpress.co.il] \
 *   node scripts/c184-obs-smoke.mjs
 *
 * 1. Sentry: one event per runtime (client, server, edge) through the envelope
 *    endpoint the SDKs use, each tagged `runtime` and `c184_smoke`.
 * 2. PostHog: view_item -> add_to_cart -> begin_checkout -> purchase for one
 *    synthetic distinct_id, in order, through /batch/. With a personal API key
 *    it also creates the funnel insight; without one it prints the query.
 * 3. Resend webhook: an UNSIGNED post must be refused (401). A 200 here would
 *    mean anyone can write the suppression list.
 *
 * Exit 0 only when every live check passed.
 */

const SUMMARY = []
const record = (name, ok, detail) => {
  SUMMARY.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`)
}

async function sentry() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return record('sentry', false, 'SENTRY_DSN missing')
  const url = new URL(dsn)
  const key = url.username
  const project = url.pathname.replace(/^\//, '')
  const endpoint = `${url.protocol}//${url.host}/api/${project}/envelope/`

  for (const [runtime, platform] of [
    ['client', 'javascript'],
    ['server', 'node'],
    ['edge', 'javascript'],
  ]) {
    const eventId = crypto.randomUUID().replaceAll('-', '')
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform,
      level: 'info',
      environment: 'c184-smoke',
      message: { formatted: `C184 smoke test (${runtime})` },
      tags: { runtime, c184_smoke: 'true' },
      sdk: { name: 'c184-obs-smoke', version: '1.0.0' },
    }
    const envelope = [
      JSON.stringify({ event_id: eventId, dsn, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n')
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-sentry-envelope',
        'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${key}, sentry_client=c184-obs-smoke/1.0.0`,
      },
      body: envelope,
    })
    const text = await response.text()
    record(
      `sentry:${runtime}`,
      response.status === 200,
      `HTTP ${response.status} ${text.slice(0, 80)}`,
    )
  }
}

const FUNNEL = ['view_item', 'add_to_cart', 'begin_checkout', 'purchase']

async function posthog() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(
    /\/+$/,
    '',
  )
  if (!key) return record('posthog', false, 'NEXT_PUBLIC_POSTHOG_KEY missing')

  const distinctId = `c184-smoke-${Date.now()}`
  const start = Date.now()
  const batch = FUNNEL.map((event, index) => ({
    event,
    distinct_id: distinctId,
    timestamp: new Date(start + index * 1000).toISOString(),
    properties: { c184_smoke: true, value: 100, currency: 'ILS', item_count: 1 },
  }))
  const response = await fetch(`${host}/batch/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: key, batch }),
  })
  const text = await response.text()
  record(
    'posthog:funnel-events',
    response.status === 200,
    `HTTP ${response.status} ${text.slice(0, 80)} distinct_id=${distinctId}`,
  )

  const query = {
    kind: 'InsightVizNode',
    source: {
      kind: 'FunnelsQuery',
      series: FUNNEL.map((event) => ({ kind: 'EventsNode', event, name: event })),
      dateRange: { date_from: '-30d' },
      funnelsFilter: {
        funnelVizType: 'steps',
        funnelOrderType: 'ordered',
        funnelWindowInterval: 14,
        funnelWindowIntervalUnit: 'day',
      },
    },
  }
  const personal = process.env.POSTHOG_PERSONAL_API_KEY
  const projectId = process.env.POSTHOG_PROJECT_ID
  if (!personal || !projectId) {
    console.log('SKIP  posthog:insight  no POSTHOG_PERSONAL_API_KEY/POSTHOG_PROJECT_ID; query:')
    console.log(JSON.stringify(query))
    return
  }
  const appHost = host.replace('.i.posthog.com', '.posthog.com')
  const created = await fetch(`${appHost}/api/projects/${projectId}/insights/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${personal}` },
    body: JSON.stringify({ name: 'Funnel: view -> add -> checkout -> paid', query }),
  })
  record('posthog:insight', created.ok, `HTTP ${created.status}`)
}

async function resendWebhook() {
  const base = (process.env.WEBHOOK_BASE ?? 'https://www.kenyonexpress.co.il').replace(/\/+$/, '')
  const response = await fetch(`${base}/api/webhooks/resend`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'c184-obs-smoke' },
    body: JSON.stringify({
      type: 'email.complained',
      data: { to: ['c184-smoke@example.invalid'] },
    }),
  })
  record('resend:unsigned-refused', response.status === 401, `${base} HTTP ${response.status}`)
}

await sentry()
await posthog()
await resendWebhook()

const failed = SUMMARY.filter((entry) => !entry.ok)
console.log(`\n${SUMMARY.length - failed.length}/${SUMMARY.length} live checks passed`)
process.exit(failed.length === 0 ? 0 : 1)
