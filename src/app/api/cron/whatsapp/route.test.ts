import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The WhatsApp outbox drain. The copy is covered by messages.test.ts; here it
 * is the queue mechanics that can fail quietly: sending to a phone that opted
 * out after enqueue, retry bookkeeping, parking unrenderable rows, and not
 * burning attempts on a machine with no Twilio credential.
 */

type OutboxRow = {
  id: string
  kind: string
  phone: string
  payload: Record<string, unknown> | null
  dedupe_key: string
  attempts: number
}

let outboxRows: OutboxRow[] = []
let contactStatus: string | null = 'opted_in'
const updates: Array<{ patch: Record<string, unknown>; id: string }> = []
const sendMock = vi.fn()

function outboxStub() {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'lte', 'order']) {
    chain[m] = () => chain
  }
  chain.limit = async () => ({ data: outboxRows, error: null })
  chain.update = (patch: Record<string, unknown>) => ({
    eq: async (_column: string, id: string) => {
      updates.push({ patch, id })
      return { error: null }
    },
  })
  return chain
}

function contactsStub() {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq']) {
    chain[m] = () => chain
  }
  chain.maybeSingle = async () => ({
    data: contactStatus ? { status: contactStatus } : null,
    error: null,
  })
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === 'whatsapp_outbox' ? outboxStub() : contactsStub()),
  }),
}))

vi.mock('@/server/whatsapp/twilio', () => ({
  sendWhatsAppMessage: (...args: unknown[]) => sendMock(...args),
}))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/whatsapp', {
    headers: auth ? { authorization: auth } : {},
  })
}

const ROW: OutboxRow = {
  id: 'row-1',
  kind: 'order_paid',
  phone: '972501234567',
  payload: { order_ref: 'ABCDEF12', customer_name: 'דנה', total_agorot: 5000 },
  dedupe_key: 'wa:order_paid:abc',
  attempts: 0,
}

describe('whatsapp outbox drain', () => {
  beforeEach(() => {
    outboxRows = [ROW]
    contactStatus = 'opted_in'
    updates.length = 0
    sendMock.mockReset().mockResolvedValue({ ok: true, sid: 'SM1' })
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a missing or wrong credential and stays closed when unset', async () => {
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sends a due row and marks it sent', async () => {
    const response = await GET(request('Bearer s3cret'))
    expect(await response.json()).toMatchObject({ ok: true, sent: 1 })

    expect(sendMock).toHaveBeenCalledWith('972501234567', expect.stringContaining('ABCDEF12'))
    expect(updates[0]?.patch).toMatchObject({ status: 'sent', attempts: 1 })
  })

  it('skips, and does not send, when the phone opted out after enqueue', async () => {
    contactStatus = 'opted_out'
    const response = await GET(request('Bearer s3cret'))
    expect(await response.json()).toMatchObject({ ok: true, optedOut: 1, sent: 0 })
    expect(sendMock).not.toHaveBeenCalled()
    expect(updates[0]?.patch).toMatchObject({ status: 'skipped' })
  })

  it('a phone with no consent row at all is also skipped', async () => {
    contactStatus = null
    await GET(request('Bearer s3cret'))
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('parks a row nothing can render as dead on the first look', async () => {
    outboxRows = [{ ...ROW, kind: 'order_teleported' }]
    const response = await GET(request('Bearer s3cret'))
    expect(await response.json()).toMatchObject({ dead: 1 })
    expect(sendMock).not.toHaveBeenCalled()
    expect(updates[0]?.patch).toMatchObject({ status: 'dead' })
  })

  it('a failed send backs off and stays pending', async () => {
    sendMock.mockResolvedValue({ ok: false, reason: 'http_500' })
    const response = await GET(request('Bearer s3cret'))
    expect(await response.json()).toMatchObject({ failed: 1 })
    expect(updates[0]?.patch).toMatchObject({ status: 'pending', attempts: 1 })
    expect(updates[0]?.patch.last_error).toBe('http_500')
  })

  it('the fifth failure parks the row as dead', async () => {
    outboxRows = [{ ...ROW, attempts: 4 }]
    sendMock.mockResolvedValue({ ok: false, reason: 'http_500' })
    const response = await GET(request('Bearer s3cret'))
    expect(await response.json()).toMatchObject({ dead: 1 })
    expect(updates[0]?.patch).toMatchObject({ status: 'dead', attempts: 5 })
  })

  it('no credential leaves the row untouched, burning no attempts', async () => {
    sendMock.mockResolvedValue({ ok: false, skipped: true, reason: 'not_configured' })
    const response = await GET(request('Bearer s3cret'))
    expect(await response.json()).toMatchObject({ skipped: 1 })
    expect(updates).toHaveLength(0)
  })
})
