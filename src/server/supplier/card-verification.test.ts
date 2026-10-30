import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

type Call = { table: string; op: string; values?: unknown }
const calls: Call[] = []
let claimedRow: Record<string, unknown> | null = null

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
  b.update = (v: unknown) => {
    op = 'update'
    values = v
    calls.push({ table, op, values })
    return b
  }
  b.select = chain
  b.eq = chain
  b.single = async () => ({ data: { id: 'lead-1' }, error: null })
  b.maybeSingle = async () =>
    op === 'update' && (values as { status?: string })?.status === 'processing'
      ? { data: claimedRow, error: null }
      : { data: null, error: null }
  // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is awaited as a thenable
  b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null })
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => builder(table) }),
}))

const provider = {
  name: 'cardcom',
  verifyLowProfile: vi.fn(),
  refundByTransactionId: vi.fn(async () => ({ success: true })),
}
vi.mock('@/lib/payments', () => ({
  getPaymentProvider: () => provider,
  loadCardcomEnv: () => ({ appUrl: 'https://example.test' }),
}))

const createSupplierLead = vi.fn(async () => ({ ok: true as const, leadId: 'lead-1' }))
vi.mock('./lead-create', () => ({ createSupplierLead, alertTeam: vi.fn() }))

const { completeSupplierCardVerification, liveChargeAllowed } = await import('./card-verification')

const payload = {
  business_name: 'עסק',
  contact_name: 'איש קשר',
  email: 'a@b.co',
  phone: '+972501234567',
  city: '',
  category: '',
  website: '',
  message: '',
  agreement_hash: 'h',
}

beforeEach(() => {
  calls.length = 0
  createSupplierLead.mockClear()
  provider.refundByTransactionId.mockClear()
  claimedRow = {
    id: 'v-1',
    status: 'processing',
    payload,
    low_profile_code: 'lp-1',
    amount_agorot: 100,
    ip_address: null,
    user_agent: 'Mozilla/5.0',
  }
})

const okResult = {
  success: true,
  amountAgorot: 100,
  transactionId: 'txn-1',
  lowProfileId: 'lp-1',
  token: { token: 'tok', last4: '4242', brand: 'Visa', expiryMonth: 12, expiryYear: 2030 },
  raw: {},
}

describe('completeSupplierCardVerification', () => {
  it('stores the token, voids the shekel and only then creates the lead', async () => {
    provider.verifyLowProfile.mockResolvedValueOnce(okResult)
    await expect(completeSupplierCardVerification('v-1')).resolves.toBe('verified')
    expect(calls.some((c) => c.table === 'supplier_card_tokens' && c.op === 'insert')).toBe(true)
    expect(provider.refundByTransactionId).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'txn-1', cancelOnly: true, amountAgorot: 100 }),
    )
    expect(createSupplierLead).toHaveBeenCalledOnce()
    expect(createSupplierLead).toHaveBeenCalledWith(
      payload,
      null,
      expect.objectContaining({ verificationId: 'v-1', userAgent: 'Mozilla/5.0' }),
    )
  })

  it('creates no lead when the terminal reports a different amount', async () => {
    provider.verifyLowProfile.mockResolvedValueOnce({ ...okResult, amountAgorot: 10_000 })
    await expect(completeSupplierCardVerification('v-1')).resolves.toBe('failed')
    expect(createSupplierLead).not.toHaveBeenCalled()
  })

  it('creates no lead on a decline', async () => {
    provider.verifyLowProfile.mockResolvedValueOnce({ ...okResult, success: false })
    await expect(completeSupplierCardVerification('v-1')).resolves.toBe('failed')
    expect(createSupplierLead).not.toHaveBeenCalled()
  })

  it('trusts Cardcom over a failed=1 flag on the redirect', async () => {
    provider.verifyLowProfile.mockResolvedValueOnce(okResult)
    await expect(completeSupplierCardVerification('v-1', { reportedFailure: true })).resolves.toBe(
      'verified',
    )
    expect(provider.refundByTransactionId).toHaveBeenCalledOnce()
  })

  it('does nothing when another request already claimed the attempt', async () => {
    claimedRow = null
    await expect(completeSupplierCardVerification('v-1')).resolves.toBe('pending')
    expect(createSupplierLead).not.toHaveBeenCalled()
  })
})

describe('liveChargeAllowed (C101)', () => {
  it('always allows mock and sandbox terminals', () => {
    expect(liveChargeAllowed('mock', false, {})).toBe(true)
    expect(liveChargeAllowed('cardcom', true, {})).toBe(true)
  })
  it('blocks a live terminal unless PAYMENTS_PROD_ENABLED is exactly true', () => {
    expect(liveChargeAllowed('cardcom', false, {})).toBe(false)
    expect(liveChargeAllowed('cardcom', false, { PAYMENTS_PROD_ENABLED: '1' })).toBe(false)
    expect(liveChargeAllowed('cardcom', false, { PAYMENTS_PROD_ENABLED: 'true' })).toBe(true)
  })
})
