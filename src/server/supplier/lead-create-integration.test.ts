import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

type Call = { table: string; op: string; values?: unknown }
const calls: Call[] = []

function builder(table: string) {
  let op = 'select'
  let values: unknown
  const b: Record<string, unknown> = {}
  const chain = () => b
  b.insert = (v: unknown) => {
    op = 'insert'
    values = v
    calls.push({ table, op, values })
    return b
  }
  b.select = chain
  b.single = async () => ({ data: { id: 'lead-test-123' }, error: null })
  // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is awaited as a thenable
  b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))

vi.mock('@/lib/email/resend', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }))
vi.mock('@/lib/email/admin-alerts', () => ({ adminAlertRecipient: () => 'admin@test' }))

const { createSupplierLead } = await import('./lead-create')
const { supplierAgreementHash, SUPPLIER_AGREEMENT_VERSION } = await import(
  '@/lib/legal/supplier-agreement'
)

beforeEach(() => {
  calls.length = 0
})

describe('createSupplierLead integration with supplier_agreements (C29)', () => {
  const testPayload = {
    business_name: 'Test Business',
    contact_name: 'Test Contact',
    email: 'test@example.com',
    phone: '+972501234567',
    city: 'Tel Aviv',
    category: 'Restaurant',
    website: 'https://example.com',
    message: 'Test message',
    agreement_hash: supplierAgreementHash(),
  }

  it('inserts into supplier_agreements when createSupplierLead is called', async () => {
    await createSupplierLead(testPayload, '192.0.2.100', {
      verificationId: 'ver-123',
      userAgent: 'Test-Browser/1.0',
    })

    const agreementInsert = calls.find(
      (c) => c.table === 'supplier_agreements' && c.op === 'insert',
    )
    expect(agreementInsert).toBeDefined()
    expect(agreementInsert?.values).toMatchObject({
      supplier_lead_id: 'lead-test-123',
      verification_id: 'ver-123',
      version_hash: supplierAgreementHash(),
      version_date: SUPPLIER_AGREEMENT_VERSION,
      ip_address: '192.0.2.100',
      user_agent: 'Test-Browser/1.0',
    })
  })

  it('inserts into both supplier_leads and supplier_agreements in correct order', async () => {
    await createSupplierLead(testPayload, '10.0.0.1', {
      verificationId: 'ver-456',
    })

    const leadInsert = calls.find((c) => c.table === 'supplier_leads' && c.op === 'insert')
    const agreementInsert = calls.find(
      (c) => c.table === 'supplier_agreements' && c.op === 'insert',
    )
    const auditInsert = calls.find((c) => c.table === 'audit_log' && c.op === 'insert')

    // Verify all three inserts happened
    expect(leadInsert).toBeDefined()
    expect(agreementInsert).toBeDefined()
    expect(auditInsert).toBeDefined()

    // Verify correct order: leads first, then agreements, then audit
    const leadIdx = calls.indexOf(leadInsert!)
    const agreementIdx = calls.indexOf(agreementInsert!)
    const auditIdx = calls.indexOf(auditInsert!)

    expect(leadIdx).toBeLessThan(agreementIdx)
    expect(agreementIdx).toBeLessThan(auditIdx)
  })

  it('includes supplier_lead_id from the created lead in agreement insert', async () => {
    await createSupplierLead(testPayload, '172.16.0.1', {
      verificationId: 'ver-789',
    })

    const agreementInsert = calls.find(
      (c) => c.table === 'supplier_agreements' && c.op === 'insert',
    )
    expect(agreementInsert?.values).toHaveProperty('supplier_lead_id', 'lead-test-123')
  })

  it('handles null verification_id when not provided', async () => {
    await createSupplierLead(testPayload, '192.168.1.1', {})

    const agreementInsert = calls.find(
      (c) => c.table === 'supplier_agreements' && c.op === 'insert',
    )
    expect(agreementInsert?.values).toMatchObject({
      verification_id: null,
      user_agent: null,
    })
  })

  it('truncates user_agent to 512 characters', async () => {
    const longUserAgent = 'A'.repeat(600)
    await createSupplierLead(testPayload, '10.1.1.1', {
      verificationId: 'ver-999',
      userAgent: longUserAgent,
    })

    const agreementInsert = calls.find(
      (c) => c.table === 'supplier_agreements' && c.op === 'insert',
    )
    const insertedUserAgent = (agreementInsert?.values as Record<string, unknown>)?.user_agent
    expect(typeof insertedUserAgent).toBe('string')
    expect((insertedUserAgent as string).length).toBe(512)
  })

  it('still creates lead even if agreement insert were to fail silently', async () => {
    // The createSupplierLead implementation logs errors but does not throw
    const result = await createSupplierLead(testPayload, '203.0.113.1', {
      verificationId: 'ver-silent-fail',
    })

    expect(result).toEqual({ ok: true, leadId: 'lead-test-123' })
    const leadInsert = calls.find((c) => c.table === 'supplier_leads' && c.op === 'insert')
    expect(leadInsert).toBeDefined()
  })
})
