import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateSupplierVerificationAction } from './actions'

// Mock dependencies
vi.mock('@/lib/admin/rbac', () => ({
  requireSection: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          is: vi.fn(() => ({ error: null })),
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      })),
    },
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('updateSupplierVerificationAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws error for missing supplier_id', async () => {
    const formData = new FormData()
    formData.set('status', 'verified')

    await expect(updateSupplierVerificationAction(formData)).rejects.toThrow(
      'Missing required fields',
    )
  })

  it('throws error for missing status', async () => {
    const formData = new FormData()
    formData.set('supplier_id', 'test-id')

    await expect(updateSupplierVerificationAction(formData)).rejects.toThrow(
      'Missing required fields',
    )
  })

  it('throws error for invalid status', async () => {
    const formData = new FormData()
    formData.set('supplier_id', 'test-id')
    formData.set('status', 'invalid-status')

    await expect(updateSupplierVerificationAction(formData)).rejects.toThrow(
      'Invalid verification status',
    )
  })

  it('accepts verified status', async () => {
    const formData = new FormData()
    formData.set('supplier_id', 'test-id')
    formData.set('status', 'verified')

    // Should not throw
    await expect(updateSupplierVerificationAction(formData)).resolves.not.toThrow()
  })

  it('accepts pending status', async () => {
    const formData = new FormData()
    formData.set('supplier_id', 'test-id')
    formData.set('status', 'pending')

    // Should not throw
    await expect(updateSupplierVerificationAction(formData)).resolves.not.toThrow()
  })

  it('accepts unverified status', async () => {
    const formData = new FormData()
    formData.set('supplier_id', 'test-id')
    formData.set('status', 'unverified')

    // Should not throw
    await expect(updateSupplierVerificationAction(formData)).resolves.not.toThrow()
  })
})
