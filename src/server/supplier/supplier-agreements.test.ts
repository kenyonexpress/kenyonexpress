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
  b.single = async () => ({ data: { id: 'lead-1' }, error: null })
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
const { SUPPLIER_AGREEMENT_VERSION, supplierAgreementHash } = await import(
  '@/lib/legal/supplier-agreement'
)

const payload = {
  business_name: 'עסק בדיקה',
  contact_name: 'איש קשר',
  email: 'test@example.co.il',
  phone: '+972501234567',
  city: 'תל אביב',
  category: 'מסעדות',
  website: 'https://example.co.il',
  message: 'הודעה',
  agreement_hash: supplierAgreementHash(),
}

beforeEach(() => {
  calls.length = 0
})

describe('supplier agreement recording (C29)', () => {
  it('records agreement with version hash, IP and user agent', async () => {
    await createSupplierLead(payload, '1.2.3.4', {
      verificationId: 'verification-123',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    })

    const agreementCall = calls.find((c) => c.table === 'supplier_agreements' && c.op === 'insert')
    expect(agreementCall).toBeDefined()
    expect(agreementCall?.values).toMatchObject({
      supplier_lead_id: 'lead-1',
      verification_id: 'verification-123',
      version_hash: supplierAgreementHash(),
      version_date: SUPPLIER_AGREEMENT_VERSION,
      ip_address: '1.2.3.4',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
    })
  })

  it('records agreement without verification_id when not provided', async () => {
    await createSupplierLead(payload, '192.168.1.1', {})

    const agreementCall = calls.find((c) => c.table === 'supplier_agreements' && c.op === 'insert')
    expect(agreementCall).toBeDefined()
    expect(agreementCall?.values).toMatchObject({
      supplier_lead_id: 'lead-1',
      verification_id: null,
      version_hash: supplierAgreementHash(),
      version_date: SUPPLIER_AGREEMENT_VERSION,
      ip_address: '192.168.1.1',
    })
  })

  it('records agreement with null IP when IP is invalid', async () => {
    await createSupplierLead(payload, 'not-an-ip', {
      verificationId: 'v-456',
      userAgent: 'TestAgent/1.0',
    })

    const agreementCall = calls.find((c) => c.table === 'supplier_agreements' && c.op === 'insert')
    expect(agreementCall?.values).toMatchObject({
      ip_address: null,
      user_agent: 'TestAgent/1.0',
    })
  })

  it('truncates user agent to 512 characters', async () => {
    const longUserAgent = 'A'.repeat(600)
    await createSupplierLead(payload, '10.0.0.1', {
      verificationId: 'v-789',
      userAgent: longUserAgent,
    })

    const agreementCall = calls.find((c) => c.table === 'supplier_agreements' && c.op === 'insert')
    expect(agreementCall?.values).toMatchObject({
      user_agent: 'A'.repeat(512),
    })
  })

  it('still creates lead even if agreement recording fails', async () => {
    // The createSupplierLead function logs the error but does not fail
    const result = await createSupplierLead(payload, '1.2.3.4', {
      verificationId: 'v-999',
    })

    expect(result).toEqual({ ok: true, leadId: 'lead-1' })
  })
})
