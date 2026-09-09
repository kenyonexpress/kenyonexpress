import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Auth gate for the invoice issuer. An unauthenticated caller must not be able
 * to trigger invoice generation against Cardcom on demand.
 */

const { createAdminClient, issueInvoice, loadDueInvoices } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  issueInvoice: vi.fn(),
  loadDueInvoices: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }))
vi.mock('@/server/payments/invoices', () => ({ issueInvoice, loadDueInvoices }))

import { GET } from './route'

function request(auth?: string): NextRequest {
  return new NextRequest('https://example.test/api/cron/invoices', {
    headers: auth ? { authorization: auth } : {},
  })
}

describe('invoices cron auth', () => {
  beforeEach(() => {
    createAdminClient.mockReset()
    issueInvoice.mockReset()
    loadDueInvoices.mockReset()
    vi.stubEnv('CRON_SECRET', 's3cret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('rejects a request with no credential before touching anything', async () => {
    expect((await GET(request())).status).toBe(401)
    expect(createAdminClient).not.toHaveBeenCalled()
    expect(loadDueInvoices).not.toHaveBeenCalled()
    expect(issueInvoice).not.toHaveBeenCalled()
  })

  it('rejects a wrong credential', async () => {
    expect((await GET(request('Bearer wrong'))).status).toBe(401)
    expect(loadDueInvoices).not.toHaveBeenCalled()
  })

  it('stays closed when CRON_SECRET is unset rather than opening', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await GET(request('Bearer '))).status).toBe(401)
    expect(loadDueInvoices).not.toHaveBeenCalled()
  })
})
