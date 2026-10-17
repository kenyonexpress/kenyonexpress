import { describe, expect, it, vi } from 'vitest'
import {
  CAMPAIGN_DESCRIPTIONS,
  type CustomerSegmentType,
  type RFMScore,
  SEGMENT_LABELS,
  calculateRFMScores,
  classifySegment,
  formatRFMMetrics,
  getSegmentUsers,
  getUserSegments,
  segmentUsers,
} from './rfm-analysis'

// Mock Supabase client
const createMockSupabaseClient = () => ({
  rpc: vi.fn(),
  from: vi.fn(),
  auth: {
    getUser: vi.fn(),
  },
})

describe('RFM Analysis', () => {
  describe('calculateRFMScores', () => {
    it('should call fn_calculate_rfm_scores RPC function', async () => {
      const supabase = createMockSupabaseClient()
      const mockData = [
        {
          user_id: 'user-1',
          recency_days: 10,
          frequency_count: 5,
          monetary_total_ils: 50000,
        },
      ]

      supabase.rpc.mockResolvedValueOnce({
        data: mockData,
        error: null,
      })

      // biome-ignore lint/suspicious/noExplicitAny: Mock supabase client
      const result = await calculateRFMScores(supabase as any)

      expect(supabase.rpc).toHaveBeenCalledWith('fn_calculate_rfm_scores')
      expect(result).toEqual(mockData)
    })

    it('should throw error if RPC fails', async () => {
      const supabase = createMockSupabaseClient()
      supabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database error' },
      })

      // biome-ignore lint/suspicious/noExplicitAny: Mock supabase client
      await expect(calculateRFMScores(supabase as any)).rejects.toThrow(
        'Failed to calculate RFM scores',
      )
    })
  })

  describe('segmentUsers', () => {
    it('should call fn_segment_users RPC function', async () => {
      const supabase = createMockSupabaseClient()
      const mockData = [
        { user_id: 'user-1', segment_type: 'champions' },
        { user_id: 'user-2', segment_type: 'loyal' },
      ]

      supabase.rpc.mockResolvedValueOnce({
        data: mockData,
        error: null,
      })

      // biome-ignore lint/suspicious/noExplicitAny: Mock supabase client
      const result = await segmentUsers(supabase as any)

      expect(supabase.rpc).toHaveBeenCalledWith('fn_segment_users')
      expect(result).toEqual(mockData)
    })

    it('should throw error if RPC fails', async () => {
      const supabase = createMockSupabaseClient()
      supabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Segmentation failed' },
      })

      // biome-ignore lint/suspicious/noExplicitAny: Mock supabase client
      await expect(segmentUsers(supabase as any)).rejects.toThrow('Failed to segment users')
    })
  })

  describe('getUserSegments', () => {
    it('should retrieve segments for authenticated user', async () => {
      const supabase = createMockSupabaseClient()
      const mockSegments = [
        {
          segment_type: 'champions',
          name_he: 'אלופים',
          name_en: 'Champions',
          description_he: 'VIP customers',
          campaign_hook_enabled: true,
        },
      ]

      supabase.rpc.mockResolvedValueOnce({
        data: mockSegments,
        error: null,
      })

      // biome-ignore lint/suspicious/noExplicitAny: Mock supabase client
      const result = await getUserSegments(supabase as any)

      expect(supabase.rpc).toHaveBeenCalledWith('fn_get_user_segments')
      expect(result).toEqual(mockSegments)
    })
  })

  describe('getSegmentUsers', () => {
    it('should retrieve all users in a segment', async () => {
      const supabase = createMockSupabaseClient()
      const mockUsers = [
        {
          user_id: 'user-1',
          email: 'user1@example.com',
          full_name: 'User One',
          recency_days: 10,
          frequency_count: 5,
          monetary_total_ils: 50000,
          assigned_at: '2024-01-15T10:00:00Z',
        },
      ]

      supabase.rpc.mockResolvedValueOnce({
        data: mockUsers,
        error: null,
      })

      // biome-ignore lint/suspicious/noExplicitAny: Mock supabase client
      const result = await getSegmentUsers(supabase as any, 'champions')

      expect(supabase.rpc).toHaveBeenCalledWith('fn_get_segment_users', {
        p_segment_type: 'champions',
      })
      expect(result).toEqual(mockUsers)
    })
  })

  describe('classifySegment', () => {
    it('should classify champions segment', () => {
      const rfm: RFMScore = {
        id: '1',
        user_id: 'user-1',
        recency_days: 30,
        frequency_count: 5,
        monetary_total_ils: 50000,
        last_order_at: '2024-01-15T10:00:00Z',
        first_order_at: '2023-01-15T10:00:00Z',
        avg_order_value_ils: 10000,
        calculated_at: '2024-01-16T10:00:00Z',
        updated_at: '2024-01-16T10:00:00Z',
      }

      expect(classifySegment(rfm)).toBe('champions')
    })

    it('should classify loyal segment', () => {
      const rfm: RFMScore = {
        id: '1',
        user_id: 'user-1',
        recency_days: 60,
        frequency_count: 3,
        monetary_total_ils: 25000,
        last_order_at: '2024-01-15T10:00:00Z',
        first_order_at: '2023-01-15T10:00:00Z',
        avg_order_value_ils: 8333,
        calculated_at: '2024-01-16T10:00:00Z',
        updated_at: '2024-01-16T10:00:00Z',
      }

      expect(classifySegment(rfm)).toBe('loyal')
    })

    it('should classify potential segment', () => {
      const rfm: RFMScore = {
        id: '1',
        user_id: 'user-1',
        recency_days: 30,
        frequency_count: 1,
        monetary_total_ils: 10000,
        last_order_at: '2024-01-15T10:00:00Z',
        first_order_at: '2024-01-15T10:00:00Z',
        avg_order_value_ils: 10000,
        calculated_at: '2024-01-16T10:00:00Z',
        updated_at: '2024-01-16T10:00:00Z',
      }

      expect(classifySegment(rfm)).toBe('potential')
    })

    it('should classify at_risk segment', () => {
      const rfm: RFMScore = {
        id: '1',
        user_id: 'user-1',
        recency_days: 120,
        frequency_count: 1,
        monetary_total_ils: 5000,
        last_order_at: '2023-10-15T10:00:00Z',
        first_order_at: '2023-10-15T10:00:00Z',
        avg_order_value_ils: 5000,
        calculated_at: '2024-01-16T10:00:00Z',
        updated_at: '2024-01-16T10:00:00Z',
      }

      expect(classifySegment(rfm)).toBe('at_risk')
    })

    it('should classify dormant segment', () => {
      const rfm: RFMScore = {
        id: '1',
        user_id: 'user-1',
        recency_days: 200,
        frequency_count: 2,
        monetary_total_ils: 15000,
        last_order_at: '2023-08-15T10:00:00Z',
        first_order_at: '2023-08-10T10:00:00Z',
        avg_order_value_ils: 7500,
        calculated_at: '2024-01-16T10:00:00Z',
        updated_at: '2024-01-16T10:00:00Z',
      }

      expect(classifySegment(rfm)).toBe('dormant')
    })
  })

  describe('formatRFMMetrics', () => {
    it('should format RFM metrics for display', () => {
      const rfm: RFMScore = {
        id: '1',
        user_id: 'user-1',
        recency_days: 30,
        frequency_count: 5,
        monetary_total_ils: 50000,
        last_order_at: '2024-01-15T10:00:00Z',
        first_order_at: '2023-01-15T10:00:00Z',
        avg_order_value_ils: 10000,
        calculated_at: '2024-01-16T10:00:00Z',
        updated_at: '2024-01-16T10:00:00Z',
      }

      const formatted = formatRFMMetrics(rfm)

      expect(formatted.recency).toBe('30 days')
      expect(formatted.frequency).toBe('5 orders')
      expect(formatted.monetary).toBe('₪500.00')
      expect(formatted.avgOrderValue).toBe('₪100.00')
      expect(formatted.lastOrder).toEqual(new Date('2024-01-15T10:00:00Z'))
    })

    it('should handle null last_order_at', () => {
      const rfm: RFMScore = {
        id: '1',
        user_id: 'user-1',
        recency_days: 9999,
        frequency_count: 0,
        monetary_total_ils: 0,
        last_order_at: null,
        first_order_at: null,
        avg_order_value_ils: 0,
        calculated_at: '2024-01-16T10:00:00Z',
        updated_at: '2024-01-16T10:00:00Z',
      }

      const formatted = formatRFMMetrics(rfm)

      expect(formatted.lastOrder).toBeNull()
    })
  })

  describe('SEGMENT_LABELS', () => {
    it('should have labels for all segment types', () => {
      const segments: CustomerSegmentType[] = [
        'champions',
        'loyal',
        'potential',
        'at_risk',
        'dormant',
      ]

      for (const segment of segments) {
        expect(SEGMENT_LABELS[segment]).toBeDefined()
        expect(SEGMENT_LABELS[segment].he).toBeDefined()
        expect(SEGMENT_LABELS[segment].en).toBeDefined()
      }
    })
  })

  describe('CAMPAIGN_DESCRIPTIONS', () => {
    it('should have campaign descriptions for all segment types', () => {
      const segments: CustomerSegmentType[] = [
        'champions',
        'loyal',
        'potential',
        'at_risk',
        'dormant',
      ]

      for (const segment of segments) {
        expect(CAMPAIGN_DESCRIPTIONS[segment]).toBeDefined()
        expect(CAMPAIGN_DESCRIPTIONS[segment].he).toBeDefined()
        expect(CAMPAIGN_DESCRIPTIONS[segment].en).toBeDefined()
      }
    })
  })
})
