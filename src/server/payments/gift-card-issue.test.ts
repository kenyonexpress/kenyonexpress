import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Minting gift cards at finalize.
 *
 * Driven through the same fake Supabase client as `gift-vouchers.test.ts`,
 * for the same reason: what matters is the SHAPE of what was written. Above
 * all: the RAW code reaches only the outbox payload, the card row holds its
 * hash, and the outbox goes FIRST so a crash between the writes is
 * recoverable from the payload rather than a card nobody can ever spend.
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
  }),
}

import { hashGiftCardCode } from '@/lib/gift-cards/code'
import { issueGiftCardsForItem, readGiftCardProductIds } from './gift-card-issue'

const NOW = new Date('2026-09-10T12:00:00Z')

const ITEM = {
  id: 'item-1',
  order_id: 'order-1',
  product_id: 'p-gc',
  quantity: 2,
  paid_on_site_agorot: 30_001,
}

const RECIPIENT = {
  email: 'dana@example.com',
  name: 'דנה',
  message: 'מזל טוב!',
  buyerUserId: 'buyer-1',
}

function findAll(table: string, op: string): Call[] {
  return calls.filter((c) => c.table === table && c.op === op)
}

beforeEach(() => {
  calls.length = 0
  queues.clear()
})

describe('readGiftCardProductIds', () => {
  it('returns the flagged ids', async () => {
    queue('products.select', { data: [{ id: 'p-gc' }], error: null })
    const out = await readGiftCardProductIds(adminClient as never, ['p-gc', 'p-other'])
    expect(out).toEqual(new Set(['p-gc']))
  })

  it('a database without 234 answers "no gift cards", not a failed finalize', async () => {
    queue('products.select', {
      data: null,
      error: { code: '42703', message: 'column products.is_gift_card does not exist' },
    })
    const out = await readGiftCardProductIds(adminClient as never, ['p-gc'])
    expect(out).toEqual(new Set())
  })

  it('any other read failure throws, because an empty set would misroute the line', async () => {
    queue('products.select', { data: null, error: { code: '57014', message: 'timeout' } })
    await expect(readGiftCardProductIds(adminClient as never, ['p-gc'])).rejects.toThrow('timeout')
  })
})

describe('issueGiftCardsForItem', () => {
  it('mints one card per unit: raw code only in the outbox, hash in the row, outbox first', async () => {
    queue('gift_cards.select', { data: [], error: null })
    await issueGiftCardsForItem(adminClient as never, ITEM, RECIPIENT, NOW)

    const outbox = findAll('notification_outbox', 'insert')
    const cards = findAll('gift_cards', 'insert')
    expect(outbox).toHaveLength(2)
    expect(cards).toHaveLength(2)

    for (const [index, enqueued] of outbox.entries()) {
      const row = enqueued.payload as {
        kind: string
        recipient_email: string
        dedupe_key: string
        payload: { code: string; amount_agorot: number }
      }
      expect(row.kind).toBe('gift_card_issued')
      expect(row.recipient_email).toBe('dana@example.com')
      expect(row.dedupe_key).toBe(`gift_card:item-1:${index + 1}`)

      const card = cards[index]?.payload as { code_hash: string; unit_index: number }
      expect(card.code_hash).toBe(hashGiftCardCode(row.payload.code))
      expect(card.code_hash).not.toBe(row.payload.code)
      expect(JSON.stringify(card)).not.toContain(row.payload.code)
      expect(card.unit_index).toBe(index + 1)
    }

    // The outbox write precedes its card write, which is what makes a crash
    // between them recoverable (the payload still holds the raw code).
    const order = calls.filter((c) => c.op === 'insert').map((c) => c.table)
    expect(order).toEqual([
      'notification_outbox',
      'gift_cards',
      'notification_outbox',
      'gift_cards',
    ])

    // Line total split per unit, first unit absorbs the remainder.
    const amounts = cards.map((c) => (c.payload as { amount_agorot: number }).amount_agorot)
    expect(amounts).toEqual([15_001, 15_000])
  })

  it('a replay mints only the missing units', async () => {
    queue('gift_cards.select', { data: [{ unit_index: 1 }], error: null })
    await issueGiftCardsForItem(adminClient as never, ITEM, RECIPIENT, NOW)
    expect(findAll('gift_cards', 'insert')).toHaveLength(1)
    const only = findAll('notification_outbox', 'insert')[0]?.payload as { dedupe_key: string }
    expect(only.dedupe_key).toBe('gift_card:item-1:2')
  })

  it('an outbox dedupe collision mints the card with the code already promised', async () => {
    queue('gift_cards.select', { data: [{ unit_index: 2 }], error: null })
    queue('notification_outbox.insert', {
      data: null,
      error: { message: 'duplicate key value violates unique constraint' },
    })
    queue('notification_outbox.select', {
      data: { payload: { code: 'ABCD-EFGH-JKMN-PQRS' } },
      error: null,
    })
    await issueGiftCardsForItem(adminClient as never, ITEM, RECIPIENT, NOW)
    const card = findAll('gift_cards', 'insert')[0]?.payload as { code_hash: string }
    expect(card.code_hash).toBe(hashGiftCardCode('ABCD-EFGH-JKMN-PQRS'))
  })

  it('refuses to mint with nowhere to send the code', async () => {
    await expect(
      issueGiftCardsForItem(adminClient as never, ITEM, { ...RECIPIENT, email: null }, NOW),
    ).rejects.toThrow('no recipient email')
    expect(findAll('gift_cards', 'insert')).toHaveLength(0)
  })

  it('refuses a worthless card rather than minting zero value', async () => {
    await expect(
      issueGiftCardsForItem(
        adminClient as never,
        { ...ITEM, paid_on_site_agorot: 0 },
        RECIPIENT,
        NOW,
      ),
    ).rejects.toThrow('non-positive unit value')
  })

  it('the card carries the statutory five-year expiry', async () => {
    queue('gift_cards.select', { data: [{ unit_index: 1 }], error: null })
    await issueGiftCardsForItem(adminClient as never, ITEM, RECIPIENT, NOW)
    const card = findAll('gift_cards', 'insert')[0]?.payload as { expires_at: string }
    expect(card.expires_at).toBe('2031-09-10T12:00:00.000Z')
  })
})
