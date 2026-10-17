import * as ntfyAlert from '@/lib/observability/ntfy-alert'
import * as p95Monitor from '@/lib/observability/p95-monitor'
import { createAdminClient } from '@/lib/supabase/admin'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/observability/ntfy-alert')
vi.mock('@/lib/observability/p95-monitor')
vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_path: string, handler: never) => handler,
}))
vi.mock('@/lib/supabase/admin')

describe('P95 Monitor Cron', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/cron/p95-monitor', () => {
    it('should return 401 if CRON_SECRET is missing', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('Bearer missing-secret'),
        },
      } as never

      process.env.CRON_SECRET = undefined

      const response = await GET(mockRequest)

      expect(response.status).toBe(401)
    })

    it('should return 401 if CRON_SECRET is invalid', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('Bearer wrong-secret'),
        },
      } as never

      process.env.CRON_SECRET = 'correct-secret'

      const response = await GET(mockRequest)

      expect(response.status).toBe(401)
    })

    it('should process violations when CRON_SECRET is valid', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('Bearer correct-secret'),
        },
      } as never

      process.env.CRON_SECRET = 'correct-secret'
      process.env.GITHUB_TOKEN = 'test-token'
      process.env.GITHUB_REPO = 'owner/repo'

      const mockViolations = [
        {
          endpoint_path: '/api/products',
          method: 'GET',
          p95_ms: 550,
          duration_minutes: 15,
          started_at: new Date().toISOString(),
          sustained: true,
        },
      ]

      vi.mocked(p95Monitor.checkSustainedViolations).mockResolvedValueOnce(mockViolations)
      vi.mocked(p95Monitor.createPerformanceTicket).mockResolvedValueOnce('#123')
      vi.mocked(p95Monitor.cleanupOldSamples).mockResolvedValueOnce(true)
      vi.mocked(ntfyAlert.sendNtfyAlert).mockResolvedValueOnce(true as any)

      const mockAdmin = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValueOnce({
              eq: vi.fn().mockReturnValueOnce({
                is: vi.fn().mockReturnValueOnce({
                  limit: vi.fn().mockResolvedValueOnce({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValueOnce({ error: null }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValueOnce({ error: null }),
          }),
        }),
      } as never

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin)

      const response = await GET(mockRequest)

      expect(response.status).toBe(200)

      const json = await response.json()
      expect(json.ok).toBe(true)
      expect(json.violations_detected).toBe(1)
      expect(json.tickets_created).toBeGreaterThanOrEqual(0)
    })

    it('should handle errors gracefully', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('Bearer correct-secret'),
        },
      } as never

      process.env.CRON_SECRET = 'correct-secret'

      vi.mocked(p95Monitor.checkSustainedViolations).mockRejectedValueOnce(new Error('DB error'))

      const response = await GET(mockRequest)

      expect(response.status).toBe(500)

      const json = await response.json()
      expect(json.ok).toBe(false)
      expect(json.error).toBe('DB error')
    })

    it('should skip ticket creation if GITHUB_TOKEN is not set', async () => {
      const mockRequest = {
        headers: {
          get: vi.fn().mockReturnValue('Bearer correct-secret'),
        },
      } as never

      process.env.CRON_SECRET = 'correct-secret'
      process.env.GITHUB_TOKEN = undefined

      const mockViolations = [
        {
          endpoint_path: '/api/products',
          method: 'GET',
          p95_ms: 550,
          duration_minutes: 15,
          started_at: new Date().toISOString(),
          sustained: true,
        },
      ]

      vi.mocked(p95Monitor.checkSustainedViolations).mockResolvedValueOnce(mockViolations)
      vi.mocked(p95Monitor.cleanupOldSamples).mockResolvedValueOnce(true)

      const mockAdmin = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValueOnce({
              eq: vi.fn().mockReturnValueOnce({
                is: vi.fn().mockReturnValueOnce({
                  limit: vi.fn().mockResolvedValueOnce({
                    data: [],
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      } as never

      vi.mocked(createAdminClient).mockReturnValue(mockAdmin)

      const response = await GET(mockRequest)

      expect(response.status).toBe(200)

      const json = await response.json()
      expect(json.ok).toBe(true)
      // No tickets created because GITHUB_TOKEN is missing
      expect(json.tickets_created).toBe(0)
    })
  })
})
