import { describe, expect, it } from 'vitest'
import {
  MAINTENANCE_RETRY_AFTER_SECONDS,
  isMaintenanceExempt,
  isMaintenanceMode,
  maintenanceHeaders,
  maintenanceHtml,
} from './maintenance'

describe('isMaintenanceMode', () => {
  it('is on only for a value that plainly says so', () => {
    for (const on of ['1', 'true', 'on', 'YES', ' true ']) {
      expect(isMaintenanceMode({ MAINTENANCE_MODE: on } as unknown as NodeJS.ProcessEnv), on).toBe(
        true,
      )
    }
    for (const off of [undefined, '', '0', 'false', 'maybe', 'off']) {
      expect(
        isMaintenanceMode({ MAINTENANCE_MODE: off } as unknown as NodeJS.ProcessEnv),
        String(off),
      ).toBe(false)
    }
  })
})

describe('isMaintenanceExempt', () => {
  it('keeps the operator, the scheduler, health and assets reachable', () => {
    for (const path of [
      '/admin',
      '/admin/feature-flags',
      '/api/admin/orders',
      '/api/cron/health',
      '/api/health',
      '/monitoring/x',
      '/_next/static/chunk.js',
      '/favicon.ico',
      '/robots.txt',
    ]) {
      expect(isMaintenanceExempt(path), path).toBe(true)
    }
  })

  it('covers the shop, the account, the supplier portal and the public API', () => {
    for (const path of [
      '/',
      '/product/x',
      '/checkout',
      '/account',
      '/supplier/scan',
      '/api/search',
      '/administrator',
    ]) {
      expect(isMaintenanceExempt(path), path).toBe(false)
    }
  })
})

describe('the page', () => {
  it('is a self-contained RTL document with no script and a retry header', () => {
    const html = maintenanceHtml()
    expect(html).toContain('<html lang="he" dir="rtl">')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('src=')
    expect(html).toContain('noindex')
    const headers = maintenanceHeaders()
    expect(headers['Retry-After']).toBe(String(MAINTENANCE_RETRY_AFTER_SECONDS))
    expect(headers['Cache-Control']).toBe('no-store')
  })
})
