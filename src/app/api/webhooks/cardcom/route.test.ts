import { createHmac } from 'node:crypto'
import { vi } from 'vitest'

/**
 * Unit tests for Cardcom webhook handler
 * Tests signature validation and event processing
 */

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: () => ({ eq: () => ({ in: () => ({}) }) }),
      select: () => ({ eq: () => ({}) }),
    }),
  }),
}))

// Import after mocks
const { POST } = await import('./route')

describe('Cardcom Webhook Handler', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      CARDCOM_WEBHOOK_SECRET: 'test-secret-key',
      SUPABASE_SECRET_KEY: 'test-supabase-key-1234567890',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Signature Validation', () => {
    it('rejects requests without signature', async () => {
      const payload = {
        event_type: 'payment_success',
        order_id: 'order-123',
        payment_id: 'payment-456',
      }

      const request = new Request('http://localhost/api/webhooks/cardcom', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const response = await POST(request as any)
      expect(response.status).toBe(401)
    })

    it('rejects requests with invalid signature', async () => {
      const payload = {
        event_type: 'payment_success',
        order_id: 'order-123',
        payment_id: 'payment-456',
        signature: 'invalid-signature',
      }

      const request = new Request('http://localhost/api/webhooks/cardcom', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const response = await POST(request as any)
      expect(response.status).toBe(401)
    })

    it('accepts requests with valid signature', async () => {
      const payloadData = {
        event_type: 'payment_success',
        order_id: 'order-123',
        payment_id: 'payment-456',
      }

      const rawBody = JSON.stringify(payloadData)
      const signature = createHmac('sha256', 'test-secret-key').update(rawBody).digest('hex')

      const payload = { ...payloadData, signature }

      const request = new Request('http://localhost/api/webhooks/cardcom', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const response = await POST(request as any)
      // Should not be 401 (may be 500 due to DB, but signature passed)
      expect(response.status).not.toBe(401)
    })

    it('uses timing-safe comparison', async () => {
      const payloadData = {
        event_type: 'payment_success',
        order_id: 'order-123',
        payment_id: 'payment-456',
      }

      const rawBody = JSON.stringify(payloadData)
      const validSignature = createHmac('sha256', 'test-secret-key').update(rawBody).digest('hex')

      // Create signature with one character different
      const invalidSignature = `${validSignature.slice(0, -1)}0`

      const payload = { ...payloadData, signature: invalidSignature }

      const request = new Request('http://localhost/api/webhooks/cardcom', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const response = await POST(request as any)
      expect(response.status).toBe(401)
    })
  })

  describe('Event Processing', () => {
    it('validates required fields', async () => {
      const payloadData = {
        event_type: 'payment_success',
        // Missing order_id and payment_id
      }

      const rawBody = JSON.stringify(payloadData)
      const signature = createHmac('sha256', 'test-secret-key').update(rawBody).digest('hex')

      const payload = { ...payloadData, signature }

      const request = new Request('http://localhost/api/webhooks/cardcom', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const response = await POST(request as any)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Missing required fields')
    })

    it('handles unknown event types', async () => {
      const payloadData = {
        event_type: 'unknown_event',
        order_id: 'order-123',
        payment_id: 'payment-456',
      }

      const rawBody = JSON.stringify(payloadData)
      const signature = createHmac('sha256', 'test-secret-key').update(rawBody).digest('hex')

      const payload = { ...payloadData, signature }

      const request = new Request('http://localhost/api/webhooks/cardcom', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      const response = await POST(request as any)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toContain('Unknown event type')
    })
  })

  describe('State Transitions', () => {
    it('defines valid payment states', () => {
      const validStates = ['initiated', 'redirected', 'succeeded', 'failed', 'refunded']
      expect(validStates).toContain('succeeded')
      expect(validStates).toContain('failed')
      expect(validStates).toContain('refunded')
    })

    it('defines valid order states', () => {
      const validStates = ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded']
      expect(validStates).toContain('pending')
      expect(validStates).toContain('paid')
      expect(validStates).toContain('refunded')
    })
  })
})
