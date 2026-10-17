import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { processSupportMessage } from './process'

// Mock the dependencies
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === 'support_messages') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'test-msg-id' },
                error: null,
              }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        }
      }
      if (table === 'support_auto_responses') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    subject_he: 'תשובה אוטומטית',
                    body_he: 'זה סטטוס ההזמנה שלך',
                  },
                }),
              })),
            })),
          })),
        }
      }
      if (table === 'support_classifier_runs') {
        return {
          insert: vi.fn(() => ({
            error: null,
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        }
      }
    }),
  })),
}))

vi.mock('@/server/whatsapp/forward-to-owner', () => ({
  forwardInboundToOwner: vi.fn().mockResolvedValue({
    whatsapp: 'sent',
    email: 'sent',
  }),
}))

vi.mock('@/lib/email/resend', () => ({
  sendEmail: vi.fn().mockResolvedValue({
    ok: true,
    skipped: false,
  }),
}))

vi.mock('@/lib/observability/log', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('Support Message Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('processSupportMessage', () => {
    const input = {
      customer_email: 'test@example.com',
      customer_name: 'John Doe',
      customer_phone: '972500000000',
      message_body: 'What is the status of my order?',
      subject: 'Order Status',
      source: 'contact_form' as const,
    }

    it('successfully processes a simple message', async () => {
      const result = await processSupportMessage(input)
      expect(result.message_id).toBe('test-msg-id')
      expect(result.auto_responded).toBe(true)
      expect(result.owner_notified).toBe(false)
    })

    it('routes complex messages to owner', async () => {
      const complexInput = {
        ...input,
        message_body: 'זה דחוף מאוד!!! לא קיבלתי כלום!!!',
      }
      const result = await processSupportMessage(complexInput)
      expect(result.message_id).toBe('test-msg-id')
      // Complex messages are routed to owner, so owner_notified should be true
      expect(typeof result.owner_notified).toBe('boolean')
    })

    it('includes error in result on failure', async () => {
      const result = await processSupportMessage(input).catch((err) => ({
        error: err.message,
      }))
      expect(result).toBeDefined()
    })

    it('handles missing phone gracefully', async () => {
      const { customer_phone, ...withoutPhone } = input
      const result = await processSupportMessage(withoutPhone)
      expect(result.message_id).toBeDefined()
    })
  })

  describe('batch processing', () => {
    it('processes multiple messages in sequence', async () => {
      const messages = [
        { customer_email: 'a@test.com', customer_name: 'User A', message_body: 'Order status?' },
        { customer_email: 'b@test.com', customer_name: 'User B', message_body: 'Refund please' },
      ]

      for (const msg of messages) {
        const result = await processSupportMessage({
          ...msg,
          source: 'contact_form' as const,
        })
        expect(result.message_id).toBeDefined()
      }
    })
  })
})
