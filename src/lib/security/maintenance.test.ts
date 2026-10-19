import { describe, expect, it } from 'vitest'
import { isMaintenanceExempt, maintenanceEnabled } from './maintenance'

describe('maintenance mode', () => {
  it('is off unless explicitly on', () => {
    expect(maintenanceEnabled({} as NodeJS.ProcessEnv)).toBe(false)
    expect(maintenanceEnabled({ MAINTENANCE_MODE: '0' } as unknown as NodeJS.ProcessEnv)).toBe(
      false,
    )
    expect(maintenanceEnabled({ MAINTENANCE_MODE: '1' } as unknown as NodeJS.ProcessEnv)).toBe(true)
    expect(maintenanceEnabled({ MAINTENANCE_MODE: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(
      true,
    )
  })
  it('keeps payments, webhooks, crons, admin and login reachable', () => {
    for (const p of [
      '/api/payments/cardcom/webhook',
      '/api/webhooks/whatsapp',
      '/api/cron/expire-vouchers',
      '/api/health',
      '/admin/products',
      '/login',
      '/checkout/return',
    ]) {
      expect(isMaintenanceExempt(p), p).toBe(true)
    }
  })
  it('blocks the storefront, and does not match on a bare prefix', () => {
    for (const p of ['/', '/product/x', '/cart', '/checkout', '/administrators', '/loginx']) {
      expect(isMaintenanceExempt(p), p).toBe(false)
    }
  })
})
