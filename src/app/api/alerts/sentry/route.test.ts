import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendAlert } = vi.hoisted(() => ({ sendAlert: vi.fn() }))

vi.mock('@/lib/observability/alert', () => ({ sendAlert }))

import { POST } from './route'

const BASE = 'https://example.test/api/alerts/sentry'
const SECRET = 'a-client-secret-long-enough-to-count'

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

function post(body: string, headers: Record<string, string> = {}, query = ''): NextRequest {
  return new NextRequest(`${BASE}${query}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const metricCritical = JSON.stringify({
  action: 'critical',
  data: {
    metric_alert: { alert_rule: { name: 'Error rate spike', environment: 'production' } },
    description_text: '57 events in the last 60 minutes',
    web_url: 'https://kenyonexpress.sentry.io/alerts/7/',
  },
})

const productionEvent = JSON.stringify({
  action: 'triggered',
  data: {
    triggered_rule: 'New production issue',
    event: {
      title: 'TypeError: boom',
      level: 'error',
      environment: 'production',
      web_url: 'https://kenyonexpress.sentry.io/issues/42/',
    },
  },
})

describe('/api/alerts/sentry', () => {
  beforeEach(() => {
    sendAlert.mockReset()
    sendAlert.mockResolvedValue(true)
    vi.stubEnv('SENTRY_WEBHOOK_SECRET', SECRET)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses an unsigned or badly signed payload, and pages nobody', async () => {
    expect(
      (await POST(post(metricCritical, { 'sentry-hook-resource': 'metric_alert' }))).status,
    ).toBe(401)
    expect(
      (
        await POST(
          post(metricCritical, {
            'sentry-hook-resource': 'metric_alert',
            'sentry-hook-signature': sign(metricCritical, 'wrong-secret'),
          }),
        )
      ).status,
    ).toBe(401)
    expect(
      (
        await POST(
          post(metricCritical, {
            'sentry-hook-resource': 'metric_alert',
            // Signed over a different body than the one sent.
            'sentry-hook-signature': sign(`${metricCritical} `),
          }),
        )
      ).status,
    ).toBe(401)
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('stays closed when the secret is unset, rather than becoming an open relay', async () => {
    vi.stubEnv('SENTRY_WEBHOOK_SECRET', '')
    const res = await POST(
      post(metricCritical, {
        'sentry-hook-resource': 'metric_alert',
        'sentry-hook-signature': sign(metricCritical, ''),
      }),
    )
    expect(res.status).toBe(401)
    expect((await POST(post(metricCritical, {}, '?secret='))).status).toBe(401)
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('relays a signed critical metric alert as an urgent page', async () => {
    const res = await POST(
      post(metricCritical, {
        'sentry-hook-resource': 'metric_alert',
        'sentry-hook-signature': sign(metricCritical),
      }),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      kind: 'metric_alert',
      relayed: true,
      delivered: true,
    })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(sendAlert).toHaveBeenCalledTimes(1)
    expect(sendAlert.mock.calls[0]?.[0]).toMatchObject({
      title: 'KE Sentry CRITICAL: Error rate spike',
      priority: 'urgent',
    })
  })

  it('accepts the shared secret in the URL for the legacy plugin, and reads its shape', async () => {
    const legacy = JSON.stringify({
      project: 'kenyonexpress-web',
      level: 'error',
      message: 'TypeError: boom',
      url: 'https://kenyonexpress.sentry.io/issues/42/',
      triggering_rules: ['New production issue'],
      event: { tags: [['environment', 'production']] },
    })
    const res = await POST(post(legacy, {}, `?secret=${SECRET}`))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ kind: 'event_alert', relayed: true })
    expect(sendAlert.mock.calls[0]?.[0]).toMatchObject({ title: 'KE Sentry: New production issue' })
  })

  it('acknowledges a non-production event alert with 200 and does not page', async () => {
    const local = productionEvent.replace('"environment":"production"', '"environment":"local"')
    const res = await POST(
      post(local, {
        'sentry-hook-resource': 'event_alert',
        'sentry-hook-signature': sign(local),
      }),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      ok: true,
      kind: 'event_alert',
      relayed: false,
      reason: 'environment local is not production',
    })
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('acknowledges the installation handshake and issue lifecycle without paging', async () => {
    const install = JSON.stringify({ action: 'created', data: { installation: { uuid: 'u' } } })
    const res = await POST(
      post(install, {
        'sentry-hook-resource': 'installation',
        'sentry-hook-signature': sign(install),
      }),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ kind: 'installation', relayed: false })

    const issue = JSON.stringify({ action: 'created', data: { issue: { title: 'Boom' } } })
    const res2 = await POST(
      post(issue, { 'sentry-hook-resource': 'issue', 'sentry-hook-signature': sign(issue) }),
    )
    expect(res2.status).toBe(200)
    await expect(res2.json()).resolves.toMatchObject({ kind: 'issue', relayed: false })
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('reports a push that did not get through, so the log says the phone was silent', async () => {
    sendAlert.mockResolvedValue(false)
    const res = await POST(
      post(productionEvent, {
        'sentry-hook-resource': 'event_alert',
        'sentry-hook-signature': sign(productionEvent),
      }),
    )
    await expect(res.json()).resolves.toMatchObject({ relayed: true, delivered: false })
  })

  it('rejects malformed json and an unrecognised shape once authenticated', async () => {
    const bad = '{not json'
    expect((await POST(post(bad, { 'sentry-hook-signature': sign(bad) }))).status).toBe(400)
    const strange = JSON.stringify({ hello: 'world' })
    expect((await POST(post(strange, { 'sentry-hook-signature': sign(strange) }))).status).toBe(400)
    expect(sendAlert).not.toHaveBeenCalled()
  })
})
