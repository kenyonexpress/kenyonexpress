import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Turning a paid order's coupons into gifts.
 *
 * Driven through the same fake Supabase client as `refund.test.ts` and
 * `invoices.test.ts`, and for the same reason: what matters here is the SHAPE
 * of what was written - which guard was on the update, what went into the
 * outbox payload, and above all that the RAW token reaches the email and only
 * the hash reaches the voucher row.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function queue(key: string, ...results: Result[]): void {
  queues.set(key, [...(queues.get(key) ?? []), ...results])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(table: string, op: string, payload?: unknown): never {
  const record: Call = { table, op, payload, chain: [] }
  calls.push(record)
  const key = `${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(key))
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    insert: (payload: unknown) => builder(table, 'insert', payload),
    update: (payload: unknown) => builder(table, 'update', payload),
    upsert: (payload: unknown) => builder(table, 'upsert', payload),
  }),
}

import { hashGiftClaimToken } from '@/lib/gifts/claim-token'
import { readGiftIntent, sendOrderGifts } from './gift-vouchers'

const ORDER_ID = '33333333-3333-4333-8333-333333333333'

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}
function findAll(table: string, op: string): Call[] {
  return calls.filter((c) => c.table === table && c.op === op)
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
  vi.restoreAllMocks()
})

describe('readGiftIntent', () => {
  it('is a gift only when there is somebody to send it to', () => {
    expect(readGiftIntent({})).toBeNull()
    expect(readGiftIntent({ gift_recipient_email: '  ' })).toBeNull()
    expect(readGiftIntent({ gift_recipient_name: 'דנה', gift_message: 'מזל טוב' })).toBeNull()
    expect(
      readGiftIntent({ gift_recipient_email: ' dana@example.com ', gift_recipient_name: ' דנה ' }),
    ).toEqual({ recipientEmail: 'dana@example.com', recipientName: 'דנה', message: null })
  })
})

describe('sendOrderGifts', () => {
  const intent = {
    recipientEmail: 'dana@example.com',
    recipientName: 'דנה',
    message: 'מזל טוב!',
  }

  function scriptTwoVouchers(): void {
    queue('vouchers.select', {
      data: [
        { id: 'v1', product_id: 'p1', expires_at: '2027-01-01T00:00:00Z', gift_sent_at: null },
        { id: 'v2', product_id: 'p1', expires_at: '2027-01-01T00:00:00Z', gift_sent_at: null },
      ],
      error: null,
    })
    queue('products.select', { data: [{ id: 'p1', name_he: 'ספא זוגי' }], error: null })
    queue('vouchers.update', { data: { id: 'v1' }, error: null })
  }

  it('mints one token per voucher, stores only the hash, and mails only the token', async () => {
    scriptTwoVouchers()
    const result = await sendOrderGifts(adminClient as never, {
      orderId: ORDER_ID,
      buyerUserId: 'buyer',
      intent,
      buyerName: 'יוסי',
    })
    expect(result.sent).toBe(2)

    const updates = findAll('vouchers', 'update')
    expect(updates).toHaveLength(2)
    const queued = findAll('notification_outbox', 'insert')
    expect(queued).toHaveLength(2)

    for (const [index, update] of updates.entries()) {
      const written = update.payload as { gift_claim_token_hash: string }
      const enqueued = queued[index]
      if (!enqueued) throw new Error(`no outbox row for voucher ${index}`)
      const mailed = (enqueued.payload as { payload: { claim_token: string } }).payload

      // The credential in the mail; the hash in the row. Getting this backwards
      // would mean a read of `vouchers` yields a working claim link.
      expect(written.gift_claim_token_hash).toBe(hashGiftClaimToken(mailed.claim_token))
      expect(written.gift_claim_token_hash).not.toBe(mailed.claim_token)
      expect(JSON.stringify(written)).not.toContain(mailed.claim_token)
    }

    // Two vouchers, two different tokens.
    const tokens = queued.map(
      (call) => (call.payload as { payload: { claim_token: string } }).payload.claim_token,
    )
    expect(new Set(tokens).size).toBe(2)
  })

  it('guards the update on gift_sent_at IS NULL so a replayed finalize sends once', async () => {
    scriptTwoVouchers()
    await sendOrderGifts(adminClient as never, {
      orderId: ORDER_ID,
      buyerUserId: 'buyer',
      intent,
    })
    const chain = find('vouchers', 'update')?.chain ?? []
    expect(chain).toContainEqual(['is', ['gift_sent_at', null]])
  })

  it('keys the outbox row on the voucher, which is what makes a replay a no-op', async () => {
    scriptTwoVouchers()
    await sendOrderGifts(adminClient as never, {
      orderId: ORDER_ID,
      buyerUserId: 'buyer',
      intent,
    })
    const row = find('notification_outbox', 'insert')?.payload as Record<string, unknown>
    expect(row.dedupe_key).toBe('gift:v1')
    expect(row.kind).toBe('voucher_gifted')
    expect(row.recipient_email).toBe('dana@example.com')
  })

  it('sends nothing for vouchers that were already sent', async () => {
    queue('vouchers.select', {
      data: [
        { id: 'v1', product_id: 'p1', expires_at: null, gift_sent_at: '2026-08-07T00:00:00Z' },
      ],
      error: null,
    })
    const result = await sendOrderGifts(adminClient as never, {
      orderId: ORDER_ID,
      buyerUserId: 'buyer',
      intent,
    })
    expect(result).toEqual({ sent: 0, reason: 'nothing_to_send' })
    expect(find('vouchers', 'update')).toBeUndefined()
    expect(find('notification_outbox', 'insert')).toBeUndefined()
  })

  it('survives a database without 108 rather than failing the finalize that called it', async () => {
    queue('vouchers.select', {
      data: null,
      error: { code: '42703', message: 'column vouchers.gift_sent_at does not exist' },
    })
    const result = await sendOrderGifts(adminClient as never, {
      orderId: ORDER_ID,
      buyerUserId: 'buyer',
      intent,
    })
    expect(result).toEqual({ sent: 0, reason: 'columns_missing' })
  })
})
