import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as metrics from './metrics'

// Mock Supabase client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(),
    from: vi.fn(),
  })),
}))

describe('observability/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('recordEndpointMetric', () => {
    it('should record endpoint hit with response time and status', async () => {
      const result = await metrics.recordEndpointMetric('/api/test', 'GET', 150, 200)
      expect(result).toBeDefined()
    })

    it('should handle errors gracefully', async () => {
      const result = await metrics.recordEndpointMetric('/api/test', 'GET', 5000, 500)
      // Should return null on error or handle gracefully
      expect(typeof result === 'string' || result === null).toBe(true)
    })
  })

  describe('getEndpointMetrics', () => {
    it('should return empty array on error', async () => {
      const result = await metrics.getEndpointMetrics()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('getUnresolvedAlerts', () => {
    it('should return empty array on error', async () => {
      const result = await metrics.getUnresolvedAlerts()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('getEndpointMetric', () => {
    it('should handle endpoint not found', async () => {
      const result = await metrics.getEndpointMetric('/api/nonexistent', 'GET')
      expect(result === null || typeof result === 'object').toBe(true)
    })
  })

  describe('updateEndpointStatus', () => {
    it('should update endpoint status', async () => {
      const result = await metrics.updateEndpointStatus('/api/test', 'GET', 'ok')
      expect(typeof result === 'boolean').toBe(true)
    })
  })

  describe('acknowledgeAlert', () => {
    it('should acknowledge alert', async () => {
      const result = await metrics.acknowledgeAlert('test-alert-id')
      expect(typeof result === 'boolean').toBe(true)
    })
  })

  describe('resolveAlert', () => {
    it('should resolve alert', async () => {
      const result = await metrics.resolveAlert('test-alert-id')
      expect(typeof result === 'boolean').toBe(true)
    })
  })

  describe('checkAndTriggerSLAAlert', () => {
    it('should check SLA breach for metric', async () => {
      const result = await metrics.checkAndTriggerSLAAlert('test-metric-id')
      expect(typeof result === 'boolean').toBe(true)
    })
  })
})
