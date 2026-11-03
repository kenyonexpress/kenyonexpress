import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Resend delivery webhook. It WRITES THE SUPPRESSION LIST, so an unsigned
 * caller must never reach the write, and a soft bounce must never suppress.
 */

const KEY = Buffer.from('c184-test-secret-bytes').toString('base64')
const SECRET = `whsec_${KEY}`

const upserts: { table: string; values: Record<string, unknown>; options: unknown }[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      upsert: async (values: Record<string, unknown>, options: unknown) => {
        upserts.push({ table, values, options })
        return { error: null }
      },
    }),
  }),
}))

const { POST } = await import('./route')

function signedRequest(payload: unknown, opts: { secret?: string; timestamp?: number } = {}) {
  const body = JSON.stringify(payload)
  const id = 'msg_c184'
  const timestamp = String(opts.timestamp ?? Math.floor(Date.now() / 1000))
  const key = Buffer.from((opts.secret ?? SECRET).replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return new NextRequest('https://kenyonexpress.co.il/api/webhooks/resend', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'svix-id': id,
      'svix-timestamp': timestamp,
      'svix-signature': `v1,${signature}`,
    },
  })
}

beforeEach(() => {
  upserts.length = 0
  vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/webhooks/resend', () => {
  it('refuses everything when the secret is not configured', async () => {
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
    const response = await POST(
      signedRequest({ type: 'email.complained', data: { to: ['a@b.co'] } }),
    )
    expect(response.status).toBe(401)
    expect(upserts).toHaveLength(0)
  })

  it('refuses a signature made with another secret', async () => {
    const other = `whsec_${Buffer.from('someone-else').toString('base64')}`
    const response = await POST(
      signedRequest({ type: 'email.complained', data: { to: ['a@b.co'] } }, { secret: other }),
    )
    expect(response.status).toBe(401)
    expect(upserts).toHaveLength(0)
  })

  it('refuses a replayed (stale) signature', async () => {
    const response = await POST(
      signedRequest(
        { type: 'email.complained', data: { to: ['a@b.co'] } },
        { timestamp: Math.floor(Date.now() / 1000) - 3600 },
      ),
    )
    expect(response.status).toBe(401)
    expect(upserts).toHaveLength(0)
  })

  it('suppresses a permanent bounce, lowercased, without overwriting an existing row', async () => {
    const response = await POST(
      signedRequest({
        type: 'email.bounced',
        data: { to: ['Person@Example.com'], bounce: { type: 'Permanent', subType: 'General' } },
      }),
    )
    expect(response.status).toBe(200)
    expect(upserts).toHaveLength(1)
    expect(upserts[0]?.table).toBe('email_suppressions')
    expect(upserts[0]?.values).toMatchObject({ email: 'person@example.com', reason: 'hard_bounce' })
    expect(upserts[0]?.options).toEqual({ onConflict: 'email', ignoreDuplicates: true })
  })

  it('suppresses a complaint', async () => {
    const response = await POST(
      signedRequest({ type: 'email.complained', data: { to: ['a@b.co'] } }),
    )
    expect(response.status).toBe(200)
    expect(upserts[0]?.values).toMatchObject({ email: 'a@b.co', reason: 'complaint' })
  })

  it('does not suppress a soft bounce', async () => {
    const response = await POST(
      signedRequest({
        type: 'email.bounced',
        data: { to: ['a@b.co'], bounce: { type: 'Transient', subType: 'MailboxFull' } },
      }),
    )
    expect(response.status).toBe(200)
    expect(upserts).toHaveLength(0)
  })

  it('answers 400 to a signed body that is not JSON', async () => {
    const body = 'not json'
    const id = 'msg_bad'
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signature = createHmac('sha256', Buffer.from(KEY, 'base64'))
      .update(`${id}.${timestamp}.${body}`)
      .digest('base64')
    const response = await POST(
      new NextRequest('https://kenyonexpress.co.il/api/webhooks/resend', {
        method: 'POST',
        body,
        headers: {
          'svix-id': id,
          'svix-timestamp': timestamp,
          'svix-signature': `v1,${signature}`,
        },
      }),
    )
    expect(response.status).toBe(400)
  })
})
