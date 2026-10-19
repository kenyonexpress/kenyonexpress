import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type NtfyAlertPayload,
  buildHealthSummary,
  sendNtfyAlert,
  sendNtfyAlertBatch,
} from './ntfy-alert'

// Mock fetch
global.fetch = vi.fn()

describe('observability/ntfy-alert', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('sendNtfyAlert', () => {
    it('should send alert to ntfy.sh', async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response)

      const payload: NtfyAlertPayload = {
        endpoint: '/api/test',
        method: 'GET',
        alertType: 'p95_exceeded',
        severity: 'warning',
        metricValue: 450,
        thresholdValue: 300,
        timestamp: new Date().toISOString(),
      }

      const result = await sendNtfyAlert(payload)
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalled()
    })

    it('should handle alert with custom target', async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response)

      const payload: NtfyAlertPayload = {
        endpoint: '/api/test',
        method: 'GET',
        alertType: 'error_rate_high',
        severity: 'critical',
        metricValue: 5,
        thresholdValue: 0.1,
        timestamp: new Date().toISOString(),
      }

      const result = await sendNtfyAlert(payload, 'ntfy.sh/custom-topic')
      expect(result).toBe(true)
    })

    it('should return false on fetch error', async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const payload: NtfyAlertPayload = {
        endpoint: '/api/test',
        method: 'GET',
        alertType: 'downtime',
        severity: 'critical',
        metricValue: 100,
        thresholdValue: 0,
        timestamp: new Date().toISOString(),
      }

      const result = await sendNtfyAlert(payload)
      expect(result).toBe(false)
    })

    it('should return false on non-ok response', async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response)

      const payload: NtfyAlertPayload = {
        endpoint: '/api/test',
        method: 'POST',
        alertType: 'p95_exceeded',
        severity: 'warning',
        metricValue: 400,
        thresholdValue: 300,
        timestamp: new Date().toISOString(),
      }

      const result = await sendNtfyAlert(payload)
      expect(result).toBe(false)
    })

    it('should include severity priority in headers', async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response)

      const payload: NtfyAlertPayload = {
        endpoint: '/api/critical',
        method: 'GET',
        alertType: 'downtime',
        severity: 'critical',
        metricValue: 0,
        thresholdValue: 1,
        timestamp: new Date().toISOString(),
      }

      await sendNtfyAlert(payload)

      const callArgs = mockFetch.mock.calls[0]
      expect(callArgs).toBeDefined()
      if (callArgs) {
        const headers = callArgs[1]?.headers as Record<string, string>
        expect(headers.Priority).toBe('high')
      }
    })
  })

  describe('sendNtfyAlertBatch', () => {
    it('should send multiple alerts and track success/failure', async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response)

      const alerts: NtfyAlertPayload[] = [
        {
          endpoint: '/api/test1',
          method: 'GET',
          alertType: 'p95_exceeded',
          severity: 'warning',
          metricValue: 350,
          thresholdValue: 300,
          timestamp: new Date().toISOString(),
        },
        {
          endpoint: '/api/test2',
          method: 'POST',
          alertType: 'error_rate_high',
          severity: 'critical',
          metricValue: 2,
          thresholdValue: 0.1,
          timestamp: new Date().toISOString(),
        },
      ]

      const result = await sendNtfyAlertBatch(alerts)
      expect(result.sent).toBe(2)
      expect(result.failed).toBe(0)
    })

    it('should track failed alerts', async () => {
      const mockFetch = vi.mocked(global.fetch)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
      } as Response)
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const alerts: NtfyAlertPayload[] = [
        {
          endpoint: '/api/test1',
          method: 'GET',
          alertType: 'p95_exceeded',
          severity: 'warning',
          metricValue: 350,
          thresholdValue: 300,
          timestamp: new Date().toISOString(),
        },
        {
          endpoint: '/api/test2',
          method: 'POST',
          alertType: 'error_rate_high',
          severity: 'critical',
          metricValue: 2,
          thresholdValue: 0.1,
          timestamp: new Date().toISOString(),
        },
      ]

      const result = await sendNtfyAlertBatch(alerts)
      expect(result.sent).toBe(1)
      expect(result.failed).toBe(1)
    })
  })

  describe('buildHealthSummary', () => {
    it('should build green summary when all healthy', () => {
      const summary = buildHealthSummary(10, 0, 0)
      expect(summary.severity).toBe('info')
      expect(summary.endpoint).toBe('System Health')
      expect(summary.alertType).toBe('error_rate_high')
    })

    it('should build yellow summary when endpoints degraded', () => {
      const summary = buildHealthSummary(8, 2, 0)
      expect(summary.severity).toBe('warning')
    })

    it('should build red summary when endpoints down', () => {
      const summary = buildHealthSummary(7, 2, 1)
      expect(summary.severity).toBe('critical')
    })

    it('should include correct status in metric value', () => {
      const summary = buildHealthSummary(5, 3, 2)
      expect(summary.metricValue).toContain('5 healthy')
      expect(summary.metricValue).toContain('3 degraded')
      expect(summary.metricValue).toContain('2 down')
    })
  })
})
