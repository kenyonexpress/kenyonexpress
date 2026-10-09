import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendAlert } = vi.hoisted(() => ({ sendAlert: vi.fn() }))

vi.mock('@/lib/observability/alert', () => ({ sendAlert }))

import { GET, POST } from './route'

const BASE = 'https://example.test/api/alerts/uptimerobot'

function get(query: Record<string, string>): NextRequest {
  const url = new URL(BASE)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function post(query: Record<string, string>, body: string, contentType: string): NextRequest {
  const url = new URL(BASE)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  return new NextRequest(url, { method: 'POST', body, headers: { 'content-type': contentType } })
}

describe('/api/alerts/uptimerobot', () => {
  beforeEach(() => {
    sendAlert.mockReset()
    sendAlert.mockResolvedValue(true)
    vi.stubEnv('UPTIMEROBOT_WEBHOOK_SECRET', 'a-secret-long-enough-to-count')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses without the secret, and pages nobody', async () => {
    expect((await GET(get({ alertType: '1' }))).status).toBe(401)
    expect((await GET(get({ alertType: '1', secret: 'wrong' }))).status).toBe(401)
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('stays closed when the secret is unset, rather than becoming an open relay', async () => {
    vi.stubEnv('UPTIMEROBOT_WEBHOOK_SECRET', '')
    expect((await GET(get({ alertType: '1', secret: '' }))).status).toBe(401)
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('relays a GET with substituted placeholders as an urgent page', async () => {
    const res = await GET(
      get({
        secret: 'a-secret-long-enough-to-count',
        alertType: '1',
        monitorFriendlyName: 'KenyonExpress /api/health',
        monitorURL: 'https://kenyonexpress.co.il/api/health',
        alertDetails: 'HTTP 503 - Service Unavailable',
      }),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, kind: 'down', delivered: true })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(sendAlert).toHaveBeenCalledTimes(1)
    expect(sendAlert.mock.calls[0]?.[0]).toMatchObject({
      title: 'KE DOWN: KenyonExpress /api/health',
      priority: 'urgent',
    })
    expect(sendAlert.mock.calls[0]?.[0].message).toContain('HTTP 503')
  })

  it('accepts a JSON POST body and lets it override the query', async () => {
    const res = await POST(
      post(
        { secret: 'a-secret-long-enough-to-count', alertType: '1' },
        JSON.stringify({ alertType: '2', monitorFriendlyName: 'KE', alertDuration: '90' }),
        'application/json',
      ),
    )
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ kind: 'up' })
    expect(sendAlert.mock.calls[0]?.[0]).toMatchObject({ priority: 'default' })
  })

  it('accepts a form-encoded POST body', async () => {
    const res = await POST(
      post(
        { secret: 'a-secret-long-enough-to-count' },
        'alertType=3&monitorFriendlyName=KE&sslExpiryDaysLeft=5',
        'application/x-www-form-urlencoded',
      ),
    )
    await expect(res.json()).resolves.toMatchObject({ kind: 'ssl_expiry' })
    expect(sendAlert.mock.calls[0]?.[0].message).toContain('5 ימים')
  })

  it('answers 400 on an unrecognised alert type and pages nobody', async () => {
    const res = await GET(get({ secret: 'a-secret-long-enough-to-count', alertType: '7' }))
    expect(res.status).toBe(400)
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('still answers 200 when neither channel accepted, and says so', async () => {
    sendAlert.mockResolvedValue(false)
    const res = await GET(get({ secret: 'a-secret-long-enough-to-count', alertType: '1' }))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, delivered: false })
  })
})
