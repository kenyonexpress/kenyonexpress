import { describe, expect, it } from 'vitest'
import { listRecentWhatsAppMessages } from './whatsapp-messages'

const ROW = {
  message_sid: 'SM1',
  phone: '972501234567',
  body: 'שלום',
  intent: 'message',
  ticket_id: 'ticket-1',
  order_id: 'order-1',
  created_at: '2026-09-01T00:00:00.000Z',
}

function fakeAdmin(behavior: { firstError?: { code: string; message: string } }) {
  let call = 0
  return {
    from() {
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'order']) chain[m] = () => chain
      // A real Promise, not a hand-rolled `.then`: biome's noThenProperty
      // rule refuses the latter.
      chain.limit = () => {
        call++
        if (call === 1 && behavior.firstError) {
          return Promise.resolve({ data: null, error: behavior.firstError })
        }
        return Promise.resolve({ data: [ROW], error: null })
      }
      return chain
    },
    // biome-ignore lint/suspicious/noExplicitAny: test-only fake client
  } as any
}

describe('listRecentWhatsAppMessages', () => {
  it('returns rows with order_id when the column is live', async () => {
    const rows = await listRecentWhatsAppMessages(fakeAdmin({}))
    expect(rows).toEqual([ROW])
  })

  it('degrades to order_id: null when the column is not applied yet (238 pending)', async () => {
    const rows = await listRecentWhatsAppMessages(
      fakeAdmin({ firstError: { code: '42703', message: 'column "order_id" does not exist' } }),
    )
    expect(rows).toEqual([{ ...ROW, order_id: null }])
  })

  it('throws on a real failure that is not the missing column', async () => {
    await expect(
      listRecentWhatsAppMessages(fakeAdmin({ firstError: { code: '500', message: 'boom' } })),
    ).rejects.toThrow('boom')
  })
})
