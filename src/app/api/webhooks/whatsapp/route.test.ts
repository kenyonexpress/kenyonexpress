import { createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Twilio inbound webhook. What is tested here is everything around the
 * pure pieces (classification and copy have their own tests): that the route
 * is closed without a credential, that a bad signature gets nothing, that
 * consent rows are written for the right intent, that free text lands in a
 * ticket, and that a replayed MessageSid does not do anything twice.
 */

type TableCall = { method: string; args: unknown[] }

const calls: Record<string, TableCall[]> = {}
let seenRow: { message_sid: string } | null = null
let openTicketRow: { id: string } | null = null
let upsertError: { message: string } | null = null
let rpcResult: { data: unknown; error: { message: string } | null } = { data: [], error: null }
let rpcCalls: Array<{ fn: string; args: unknown }> = []
// Simulates production before migration 211: the intent CHECK rejects the new
// values, and the route must fall back to 'message' to keep replay protection.
let intentCheckRejectsNewValues = false

function record(table: string, method: string, args: unknown[]) {
  calls[table] = calls[table] ?? []
  calls[table].push({ method, args })
}

function tableStub(table: string) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) {
    chain[m] = (...args: unknown[]) => {
      record(table, m, args)
      return chain
    }
  }
  chain.maybeSingle = async () => {
    record(table, 'maybeSingle', [])
    if (table === 'whatsapp_inbound_messages') return { data: seenRow, error: null }
    if (table === 'support_tickets') return { data: openTicketRow, error: null }
    return { data: null, error: null }
  }
  chain.upsert = async (...args: unknown[]) => {
    record(table, 'upsert', args)
    return { error: upsertError }
  }
  chain.insert = (...args: unknown[]) => {
    record(table, 'insert', args)
    const row = args[0] as Record<string, unknown> | undefined
    const violatesIntentCheck =
      intentCheckRejectsNewValues &&
      table === 'whatsapp_inbound_messages' &&
      (row?.intent === 'order_status' || row?.intent === 'refund_request')
    const error = violatesIntentCheck
      ? { message: 'violates check constraint "whatsapp_inbound_messages_intent_check"' }
      : null
    // Awaitable directly (the message inserts) AND chainable through
    // .select().single() (the ticket insert), like the real builder.
    return Object.assign(Promise.resolve({ error }), {
      select: () => ({
        single: async () => ({ data: { id: 'ticket-1111-2222' }, error: null }),
      }),
    })
  }
  return chain
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => tableStub(table),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args })
      return rpcResult
    },
  }),
}))

import { POST } from './route'

const AUTH_TOKEN = 'token-secret'
const WEBHOOK_URL = 'https://example.test/api/webhooks/whatsapp'

function sign(params: Record<string, string>, url = WEBHOOK_URL, token = AUTH_TOKEN): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join('')
  return createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64')
}

function twilioRequest(
  params: Record<string, string>,
  options: { signature?: string | null } = {},
): NextRequest {
  const body = new URLSearchParams(params).toString()
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
  }
  const signature = options.signature === undefined ? sign(params) : options.signature
  if (signature !== null) headers['x-twilio-signature'] = signature
  return new NextRequest(WEBHOOK_URL, { method: 'POST', headers, body })
}

const INBOUND = {
  MessageSid: 'SM123',
  From: 'whatsapp:+972501234567',
  To: 'whatsapp:+14155238886',
  Body: 'מתי ההזמנה שלי מגיעה?',
}

describe('whatsapp webhook', () => {
  beforeEach(() => {
    for (const key of Object.keys(calls)) delete calls[key]
    seenRow = null
    openTicketRow = null
    upsertError = null
    rpcResult = { data: [], error: null }
    rpcCalls = []
    intentCheckRejectsNewValues = false
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest')
    vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN)
    vi.stubEnv('TWILIO_WHATSAPP_FROM', '+14155238886')
    vi.stubEnv('TWILIO_WEBHOOK_URL', WEBHOOK_URL)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('answers 401 to everything when Twilio is not configured', async () => {
    vi.stubEnv('TWILIO_AUTH_TOKEN', '')
    const response = await POST(twilioRequest(INBOUND))
    expect(response.status).toBe(401)
    expect(calls.whatsapp_inbound_messages).toBeUndefined()
  })

  it('rejects a missing signature', async () => {
    expect((await POST(twilioRequest(INBOUND, { signature: null }))).status).toBe(401)
  })

  it('rejects a signature over different params', async () => {
    const forged = sign({ ...INBOUND, Body: 'הסר' })
    expect((await POST(twilioRequest(INBOUND, { signature: forged }))).status).toBe(401)
  })

  it('acknowledges a replayed MessageSid without acting twice', async () => {
    seenRow = { message_sid: 'SM123' }
    const response = await POST(twilioRequest(INBOUND))
    expect(response.status).toBe(200)
    expect(await response.text()).not.toContain('<Message>')
    expect(calls.support_tickets).toBeUndefined()
    expect(calls.whatsapp_contacts).toBeUndefined()
  })

  it('opt-out writes the consent row and confirms in the TwiML reply', async () => {
    const response = await POST(twilioRequest({ ...INBOUND, Body: 'הסר' }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/xml')

    const upsert = calls.whatsapp_contacts?.find((c) => c.method === 'upsert')
    expect(upsert).toBeDefined()
    const row = upsert?.args[0] as Record<string, unknown>
    expect(row.phone).toBe('972501234567')
    expect(row.status).toBe('opted_out')

    expect(await response.text()).toContain('הוסרתם')
    expect(calls.support_tickets).toBeUndefined()
  })

  it('opt-in writes opted_in and confirms', async () => {
    const response = await POST(twilioRequest({ ...INBOUND, Body: 'הצטרפות' }))
    const upsert = calls.whatsapp_contacts?.find((c) => c.method === 'upsert')
    const row = upsert?.args[0] as Record<string, unknown>
    expect(row.status).toBe('opted_in')
    expect(await response.text()).toContain('נרשמתם')
  })

  it('free text opens a ticket, stores the message, and acks with the ref', async () => {
    const response = await POST(twilioRequest(INBOUND))
    expect(response.status).toBe(200)

    const ticketInsert = calls.support_tickets?.find((c) => c.method === 'insert')
    expect(ticketInsert).toBeDefined()
    expect((ticketInsert?.args[0] as Record<string, unknown>).channel).toBe('whatsapp')

    const messageInsert = calls.support_ticket_messages?.find((c) => c.method === 'insert')
    const message = messageInsert?.args[0] as Record<string, unknown>
    expect(message.ticket_id).toBe('ticket-1111-2222')
    expect(message.direction).toBe('inbound')
    expect(message.body).toBe(INBOUND.Body)

    // The audit row for replay protection.
    const inboundInsert = calls.whatsapp_inbound_messages?.find((c) => c.method === 'insert')
    expect((inboundInsert?.args[0] as Record<string, unknown>).message_sid).toBe('SM123')

    expect(await response.text()).toContain('TICKET-1')
  })

  it('free text joins the open ticket for the phone instead of opening a second one', async () => {
    openTicketRow = { id: 'ticket-open-9999' }
    await POST(twilioRequest(INBOUND))
    expect(calls.support_tickets?.find((c) => c.method === 'insert')).toBeUndefined()
    const messageInsert = calls.support_ticket_messages?.find((c) => c.method === 'insert')
    expect((messageInsert?.args[0] as Record<string, unknown>).ticket_id).toBe('ticket-open-9999')
  })

  it('a status question replies with the orders the lookup returned, no ticket', async () => {
    rpcResult = {
      data: [
        {
          order_ref: 'ABCDEF12',
          status: 'paid',
          total_agorot: 12345,
          created_at: '2026-09-01T10:00:00Z',
        },
      ],
      error: null,
    }
    const response = await POST(twilioRequest({ ...INBOUND, Body: 'סטטוס' }))
    expect(response.status).toBe(200)
    expect(rpcCalls[0]?.fn).toBe('fn_wa_orders_for_phone')
    expect(rpcCalls[0]?.args).toEqual({ p_phone: '972501234567' })

    const text = await response.text()
    expect(text).toContain('ABCDEF12')
    expect(text).toContain('שולמה ובטיפול')
    expect(calls.support_tickets).toBeUndefined()

    // The audit row carries the real intent.
    const inboundInsert = calls.whatsapp_inbound_messages?.find((c) => c.method === 'insert')
    expect((inboundInsert?.args[0] as Record<string, unknown>).intent).toBe('order_status')
  })

  it('a status question from a phone with no orders gets the no-orders reply', async () => {
    rpcResult = { data: [], error: null }
    const response = await POST(twilioRequest({ ...INBOUND, Body: 'איפה ההזמנה שלי?' }))
    expect(await response.text()).toContain('לא מצאנו')
    expect(calls.support_tickets).toBeUndefined()
  })

  it('a failed status lookup files a ticket so a human answers, not silence', async () => {
    // Production before migration 211: the function does not exist yet.
    rpcResult = { data: null, error: { message: 'function fn_wa_orders_for_phone does not exist' } }
    const response = await POST(twilioRequest({ ...INBOUND, Body: 'סטטוס' }))
    expect(response.status).toBe(200)
    expect(calls.support_tickets?.find((c) => c.method === 'insert')).toBeDefined()
    expect(await response.text()).toContain('TICKET-1')
  })

  it('a refund request opens a ticket whose subject carries the refund prefix', async () => {
    const response = await POST(twilioRequest({ ...INBOUND, Body: 'בקשת זיכוי' }))
    expect(response.status).toBe(200)

    const ticketInsert = calls.support_tickets?.find((c) => c.method === 'insert')
    const ticket = ticketInsert?.args[0] as Record<string, unknown>
    expect(String(ticket.subject)).toMatch(/^בקשת זיכוי/)

    const messageInsert = calls.support_ticket_messages?.find((c) => c.method === 'insert')
    expect((messageInsert?.args[0] as Record<string, unknown>).direction).toBe('inbound')

    const text = await response.text()
    expect(text).toContain('TICKET-1')
    expect(text).toContain('זיכוי')
  })

  it('a refund request joins the open ticket instead of opening a second one', async () => {
    openTicketRow = { id: 'ticket-open-9999' }
    await POST(twilioRequest({ ...INBOUND, Body: 'זיכוי' }))
    expect(calls.support_tickets?.find((c) => c.method === 'insert')).toBeUndefined()
    const messageInsert = calls.support_ticket_messages?.find((c) => c.method === 'insert')
    expect((messageInsert?.args[0] as Record<string, unknown>).ticket_id).toBe('ticket-open-9999')
  })

  it('retries the audit row as intent message while the 211 CHECK is not applied', async () => {
    intentCheckRejectsNewValues = true
    const response = await POST(twilioRequest({ ...INBOUND, Body: 'זיכוי' }))
    expect(response.status).toBe(200)

    const inserts = calls.whatsapp_inbound_messages?.filter((c) => c.method === 'insert') ?? []
    expect(inserts).toHaveLength(2)
    expect((inserts[0]?.args[0] as Record<string, unknown>).intent).toBe('refund_request')
    expect((inserts[1]?.args[0] as Record<string, unknown>).intent).toBe('message')
    // Replay protection survived: the row landed under the fallback intent.
    expect((inserts[1]?.args[0] as Record<string, unknown>).message_sid).toBe('SM123')
  })

  it('a consent write that fails returns 500 so Twilio retries', async () => {
    upsertError = { message: 'relation does not exist' }
    expect((await POST(twilioRequest({ ...INBOUND, Body: 'הסר' }))).status).toBe(500)
  })

  it('acknowledges a signed payload with no usable sender rather than erroring', async () => {
    const params = { ...INBOUND, From: 'whatsapp:+14155230000' }
    const response = await POST(twilioRequest(params))
    expect(response.status).toBe(200)
    expect(calls.whatsapp_inbound_messages).toBeUndefined()
  })
})
