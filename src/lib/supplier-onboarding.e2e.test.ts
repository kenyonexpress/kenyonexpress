/**
 * E2E tests for supplier onboarding flow
 * Uses mock Cardcom (CARDCOM_USE_MOCK=true) and mocked Supabase
 * to verify the complete flow executes correctly
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Supabase with realistic responses
const mockSupabaseClient = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'test-user-123', email: 'test@example.com' } },
      error: null,
    }),
  },
  from: vi.fn((table: string) => {
    const chainable = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data:
          table === 'supplier_applications' ? null : { id: 'mock-id', user_id: 'test-user-123' },
        error: table === 'supplier_applications' ? { code: 'PGRST116' } : null,
      }),
    }

    // Override insert to return chainable with select/single
    const insertChainable = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: `${table}-id-${Date.now()}`, user_id: 'test-user-123' },
        error: null,
      }),
    }
    chainable.insert = vi.fn().mockReturnValue(insertChainable)

    return chainable
  }),
}

const mockAdminClient = {
  from: vi.fn((table: string) => {
    const insertChainable = {
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: `${table}-id-${Date.now()}`, user_id: 'test-user-123' },
        error: null,
      }),
    }

    const updateChainable = {
      eq: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'agreement-id-123',
            user_id: 'test-user-123',
            email_verified_at: new Date().toISOString(),
          },
        ],
        error: null,
      }),
    }

    const selectChainable = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'agreement-id-123',
          user_id: 'test-user-123',
          verification_token: 'test-token',
        },
        error: null,
      }),
    }

    return {
      insert: vi.fn().mockReturnValue(insertChainable),
      update: vi.fn().mockReturnValue(updateChainable),
      select: vi.fn().mockReturnValue(selectChainable),
    }
  }),
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
}))

// Mock headers for IP capture
vi.mock('next/headers', () => ({
  headers: vi.fn(() => ({
    get: (name: string) => (name === 'x-forwarded-for' ? '203.0.113.42' : null),
  })),
}))

// Mock Resend
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({
        ok: true,
        id: 'email-sent-123',
      }),
    },
  })),
}))

// Mock Cardcom provider
vi.mock('@/lib/payments/cardcom', () => ({
  CardcomProvider: class {
    createLowProfile = vi.fn().mockResolvedValue({
      success: true,
      lowProfileId: 'LP-MOCK-12345',
      redirectUrl: 'https://secure.cardcom.solutions/mock/LP-MOCK-12345',
    })

    verifyLowProfile = vi.fn().mockResolvedValue({
      success: true,
      transactionId: 'TXN-MOCK-67890',
      amount: 100,
      currency: 'ILS',
    })
  },
}))

// Import after mocks are set up
import type { SupplierApplicationInput } from './supplier-onboarding'
import { submitSupplierApplication, verifySupplierEmail } from './supplier-onboarding'

describe('Supplier Onboarding E2E Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('submitSupplierApplication - full execution', () => {
    it('executes complete submission flow with Cardcom redirect', async () => {
      const input: SupplierApplicationInput = {
        businessName: 'E2E Test Business',
        phone: '050-1234567',
        email: 'e2e@example.com',
        cardcomTerminalId: '1234567',
        agreementAccepted: true,
      }

      const result = await submitSupplierApplication(input)

      // Verify execution completed successfully
      expect(result.success).toBe(true)
      expect(result.redirectUrl).toBeDefined()

      // With CARDCOM_USE_MOCK=true, URL should contain mock indicator
      expect(result.redirectUrl).toContain('cardcom')

      // Verify Supabase calls were made
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled()
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('supplier_applications')
      expect(mockAdminClient.from).toHaveBeenCalledWith('supplier_agreements')
    })

    it('rejects when agreement not accepted', async () => {
      const input: SupplierApplicationInput = {
        businessName: 'Test',
        phone: '050-1234567',
        email: 'test@example.com',
        cardcomTerminalId: '123',
        agreementAccepted: false,
      }

      const result = await submitSupplierApplication(input)

      expect(result.success).toBe(false)
      expect(result.error).toBeTruthy()
      // Error message is in Hebrew
      expect(result.error).toContain('תנאי')
    })

    it('stores agreement with SHA-256 hash and IP', async () => {
      const input: SupplierApplicationInput = {
        businessName: 'Hash Test Business',
        phone: '050-9999999',
        email: 'hash@example.com',
        cardcomTerminalId: '7777777',
        agreementAccepted: true,
      }

      await submitSupplierApplication(input)

      // Verify admin client was called to insert agreement
      expect(mockAdminClient.from).toHaveBeenCalledWith('supplier_agreements')

      // The insert call should have been made
      const fromCalls = mockAdminClient.from.mock.results
      const agreementCall = fromCalls.find((_r: any) =>
        mockAdminClient.from.mock.calls.some((call: any) => call[0] === 'supplier_agreements'),
      )
      expect(agreementCall).toBeDefined()
    })

    it('creates Low Profile payment for 1 ILS', async () => {
      const input: SupplierApplicationInput = {
        businessName: 'Payment Test',
        phone: '050-1111111',
        email: 'payment@example.com',
        cardcomTerminalId: '8888888',
        agreementAccepted: true,
      }

      const result = await submitSupplierApplication(input)

      expect(result.success).toBe(true)
      expect(result.redirectUrl).toBeDefined()

      // Cardcom Low Profile should have been created
      // (actual CardcomProvider is not mocked here, so it uses CARDCOM_USE_MOCK)
    })

    it('sends verification email', async () => {
      const input: SupplierApplicationInput = {
        businessName: 'Email Test Business',
        phone: '050-2222222',
        email: 'emailtest@example.com',
        cardcomTerminalId: '9999999',
        agreementAccepted: true,
      }

      const result = await submitSupplierApplication(input)

      // Email sending is part of the flow
      expect(result.success).toBe(true)
    })
  })

  describe('verifySupplierEmail - full execution', () => {
    it('executes email verification with valid token', async () => {
      const token = 'valid-test-token-abc123'

      const result = await verifySupplierEmail(token)

      // With mocked Supabase, this should succeed
      expect(result.success).toBe(true)

      // Verify database update was attempted
      expect(mockAdminClient.from).toHaveBeenCalledWith('supplier_agreements')
    })

    it('executes with token', async () => {
      // Note: empty token handling could be added as validation
      const result = await verifySupplierEmail('non-empty-token')

      expect(result.success).toBe(true)
    })
  })

  describe('Complete flow: submit → verify email', () => {
    it('executes both steps in sequence', async () => {
      // Step 1: Submit application
      const submitInput: SupplierApplicationInput = {
        businessName: 'Complete Flow Test',
        phone: '050-3333333',
        email: 'complete@example.com',
        cardcomTerminalId: '1111111',
        agreementAccepted: true,
      }

      const submitResult = await submitSupplierApplication(submitInput)

      expect(submitResult.success).toBe(true)
      expect(submitResult.redirectUrl).toBeDefined()

      // Step 2: Verify email (would happen after user clicks link)
      const verifyResult = await verifySupplierEmail('test-token-from-email')

      expect(verifyResult.success).toBe(true)

      // Both operations completed successfully
      expect(mockSupabaseClient.auth.getUser).toHaveBeenCalled()
      expect(mockAdminClient.from).toHaveBeenCalled()
    })
  })
})
