/**
 * Tests for user verification milestones
 * C65: Phone verification after 5 physical orders
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserVerificationMilestone } from './user-milestones'

// Mocks
const mockRpc = vi.fn()
const mockFrom = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}))

vi.mock('@/lib/observability/log', () => ({
  log: {
    error: vi.fn(),
    info: vi.fn(),
  },
}))

describe('userNeedsPhoneVerification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when RPC returns true', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null })

    const { userNeedsPhoneVerification } = await import('./user-milestones')
    const result = await userNeedsPhoneVerification('user-123')

    expect(result).toBe(true)
    expect(mockRpc).toHaveBeenCalledWith('fn_user_needs_phone_verification', {
      p_user_id: 'user-123',
    })
  })

  it('returns false when RPC returns false', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null })

    const { userNeedsPhoneVerification } = await import('./user-milestones')
    const result = await userNeedsPhoneVerification('user-123')

    expect(result).toBe(false)
  })

  it('returns false and logs error on RPC failure', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Database error' } })

    const { log } = await import('@/lib/observability/log')
    const { userNeedsPhoneVerification } = await import('./user-milestones')
    const result = await userNeedsPhoneVerification('user-123')

    expect(result).toBe(false)
    expect(log.error).toHaveBeenCalledWith('milestone.check_verification_failed', {
      userId: 'user-123',
      error: 'Database error',
    })
  })
})

describe('getUserPhysicalOrderCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns order count from RPC', async () => {
    mockRpc.mockResolvedValueOnce({ data: 7, error: null })

    const { getUserPhysicalOrderCount } = await import('./user-milestones')
    const result = await getUserPhysicalOrderCount('user-123')

    expect(result).toBe(7)
    expect(mockRpc).toHaveBeenCalledWith('fn_count_user_physical_orders', {
      p_user_id: 'user-123',
    })
  })

  it('returns 0 when RPC returns non-number', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null })

    const { getUserPhysicalOrderCount } = await import('./user-milestones')
    const result = await getUserPhysicalOrderCount('user-123')

    expect(result).toBe(0)
  })

  it('returns 0 and logs error on RPC failure', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'Connection failed' } })

    const { log } = await import('@/lib/observability/log')
    const { getUserPhysicalOrderCount } = await import('./user-milestones')
    const result = await getUserPhysicalOrderCount('user-123')

    expect(result).toBe(0)
    expect(log.error).toHaveBeenCalledWith('milestone.count_orders_failed', {
      userId: 'user-123',
      error: 'Connection failed',
    })
  })
})

describe('getUserVerificationMilestone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns milestone when found', async () => {
    const mockMilestone: UserVerificationMilestone = {
      id: 'milestone-1',
      user_id: 'user-123',
      milestone_type: 'phone_verification_after_5_orders',
      achieved_at: '2024-10-24T10:00:00Z',
      verified_at: null,
      metadata: { order_count: 5 },
      created_at: '2024-10-24T10:00:00Z',
      updated_at: '2024-10-24T10:00:00Z',
    }

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockMilestone, error: null }),
    }
    mockFrom.mockReturnValueOnce(mockChain)

    const { getUserVerificationMilestone } = await import('./user-milestones')
    const result = await getUserVerificationMilestone('user-123')

    expect(result).toEqual(mockMilestone)
  })

  it('returns null when milestone not found', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    }
    mockFrom.mockReturnValueOnce(mockChain)

    const { getUserVerificationMilestone } = await import('./user-milestones')
    const result = await getUserVerificationMilestone('user-123')

    expect(result).toBeNull()
  })
})

describe('markMilestoneVerified', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('marks milestone as verified successfully', async () => {
    const mockMilestone: UserVerificationMilestone = {
      id: 'milestone-1',
      user_id: 'user-123',
      milestone_type: 'phone_verification_after_5_orders',
      achieved_at: '2024-10-24T10:00:00Z',
      verified_at: null,
      metadata: { order_count: 5 },
      created_at: '2024-10-24T10:00:00Z',
      updated_at: '2024-10-24T10:00:00Z',
    }

    // Mock getting milestone
    const mockSelectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockMilestone, error: null }),
    }
    mockFrom.mockReturnValueOnce(mockSelectChain)

    // Mock update
    const mockUpdateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    mockFrom.mockReturnValueOnce(mockUpdateChain)

    const { log } = await import('@/lib/observability/log')
    const { markMilestoneVerified } = await import('./user-milestones')
    const result = await markMilestoneVerified('user-123', 'phone_verification_after_5_orders', {
      phone: '+972501234567',
    })

    expect(result.success).toBe(true)
    expect(log.info).toHaveBeenCalledWith('milestone.marked_verified', {
      userId: 'user-123',
      milestoneType: 'phone_verification_after_5_orders',
      milestoneId: 'milestone-1',
    })
  })

  it('returns error when milestone not found', async () => {
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }),
    }
    mockFrom.mockReturnValueOnce(mockChain)

    const { markMilestoneVerified } = await import('./user-milestones')
    const result = await markMilestoneVerified('user-123')

    expect(result.success).toBe(false)
    expect(result.error).toBe('milestone_not_found')
  })
})

describe('createVerificationMilestone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates new milestone successfully', async () => {
    const mockMilestone: UserVerificationMilestone = {
      id: 'milestone-new',
      user_id: 'user-123',
      milestone_type: 'phone_verification_after_5_orders',
      achieved_at: '2024-10-24T10:00:00Z',
      verified_at: null,
      metadata: { order_count: 5 },
      created_at: '2024-10-24T10:00:00Z',
      updated_at: '2024-10-24T10:00:00Z',
    }

    const mockChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockMilestone, error: null }),
    }
    mockFrom.mockReturnValueOnce(mockChain)

    const { log } = await import('@/lib/observability/log')
    const { createVerificationMilestone } = await import('./user-milestones')
    const result = await createVerificationMilestone(
      'user-123',
      'phone_verification_after_5_orders',
      {
        order_count: 5,
      },
    )

    expect(result.success).toBe(true)
    expect(result.milestone).toEqual(mockMilestone)
    expect(log.info).toHaveBeenCalledWith('milestone.created', {
      userId: 'user-123',
      milestoneType: 'phone_verification_after_5_orders',
      milestoneId: 'milestone-new',
    })
  })

  it('handles duplicate milestone gracefully', async () => {
    const mockMilestone: UserVerificationMilestone = {
      id: 'milestone-existing',
      user_id: 'user-123',
      milestone_type: 'phone_verification_after_5_orders',
      achieved_at: '2024-10-24T09:00:00Z',
      verified_at: '2024-10-24T09:30:00Z',
      metadata: { order_count: 5 },
      created_at: '2024-10-24T09:00:00Z',
      updated_at: '2024-10-24T09:30:00Z',
    }

    // Insert fails with duplicate error
    const mockInsertChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: '23505' } }),
    }
    mockFrom.mockReturnValueOnce(mockInsertChain)

    // Then get existing milestone
    const mockSelectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockMilestone, error: null }),
    }
    mockFrom.mockReturnValueOnce(mockSelectChain)

    const { createVerificationMilestone } = await import('./user-milestones')
    const result = await createVerificationMilestone(
      'user-123',
      'phone_verification_after_5_orders',
    )

    expect(result.success).toBe(true)
    expect(result.milestone).toEqual(mockMilestone)
  })
})
