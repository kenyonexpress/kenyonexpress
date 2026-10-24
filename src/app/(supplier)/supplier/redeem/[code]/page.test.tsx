import { beforeEach, describe, expect, it, vi } from 'vitest'

const { recordRefusedScan, checkRateLimit, getVoucherForRedemption } = vi.hoisted(() => ({
  recordRefusedScan: vi.fn(),
  checkRateLimit: vi.fn(),
  getVoucherForRedemption: vi.fn(),
}))

vi.mock('@/server/domain/vouchers/scan-context', () => ({
  recordRefusedScan,
  readScanContext: () => ({ ip: '1.2.3.4', userAgent: null }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({ checkRateLimit }))
vi.mock('@/lib/supplier/rbac', () => ({
  getSupplierMemberships: vi.fn().mockResolvedValue([{ supplierId: 's1' }]),
}))
vi.mock('@/server/queries/vouchers', () => ({ getVoucherForRedemption }))
vi.mock('next/headers', () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))
vi.mock('@/app/redeem/[token]/RedeemConfirm', () => ({ default: () => null }))

import SupplierRedeemCodePage from './page'

const CODE = 'ABCDE23456'

// Walks all props, not just children: refusals are <Refusal title detail />.
function text(node: any): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join(' ')
  if (typeof node !== 'object') return ''
  return Object.values(node.props ?? {})
    .map(text)
    .join(' ')
}

async function renderBody(code: string): Promise<any> {
  const shell = SupplierRedeemCodePage({ params: Promise.resolve({ code }) }) as any
  const child = shell.props.children
  return child.type(child.props)
}

const voucher = {
  code: CODE,
  status: 'issued',
  productName: 'מוצר',
  faceValueAgorot: 10000,
  couponPriceAgorot: 6000,
  remainingAmountDueAgorot: 4000,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  redeemedAt: null,
}

describe('/supplier/redeem/[code]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    checkRateLimit.mockResolvedValue(true)
  })

  it('refuses a malformed code and records it without reading vouchers', async () => {
    const out = await renderBody('abc')
    expect(text(out)).toContain('קוד השובר אינו תקין')
    expect(recordRefusedScan).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'invalid_request', scanMethod: 'manual' }),
    )
    expect(getVoucherForRedemption).not.toHaveBeenCalled()
  })

  it('reports another supplier code as not found and records it', async () => {
    getVoucherForRedemption.mockResolvedValue(null)
    const out = await renderBody(CODE)
    expect(text(out)).toContain('השובר לא נמצא')
    expect(recordRefusedScan).toHaveBeenCalledWith(
      expect.objectContaining({ codeEntered: CODE, outcome: 'not_found' }),
    )
  })

  it('does not claim "not found" when the read itself failed', async () => {
    getVoucherForRedemption.mockRejectedValue(new Error('db down'))
    const out = await renderBody(CODE)
    expect(text(out)).toContain('לא ניתן לבדוק את השובר כרגע')
    expect(recordRefusedScan).not.toHaveBeenCalled()
  })

  it('stops at the per-address rate limit', async () => {
    checkRateLimit.mockResolvedValue(false)
    expect(text(await renderBody(CODE))).toContain('יותר מדי נסיונות')
    expect(getVoucherForRedemption).not.toHaveBeenCalled()
  })

  it('hands a signed QR token to /redeem/<token>', async () => {
    await expect(renderBody('KEV1.a.b')).rejects.toThrow('REDIRECT:/redeem/KEV1.a.b')
  })

  it('renders the confirm screen for an issued voucher, tolerating the display separator', async () => {
    getVoucherForRedemption.mockResolvedValue(voucher)
    const out = await renderBody('ABCDE-23456')
    expect(getVoucherForRedemption).toHaveBeenCalledWith(CODE, expect.anything())
    const confirm = out.props.children[1]
    expect(confirm.props.token).toBeUndefined()
    expect(confirm.props.expired).toBe(false)
    expect(confirm.props.codeDisplay).toBe('ABCDE-23456')
  })

  it('passes an expired voucher through marked expired so it cannot be armed', async () => {
    getVoucherForRedemption.mockResolvedValue({
      ...voucher,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    const out = await renderBody(CODE)
    expect(out.props.children[1].props.expired).toBe(true)
  })

  it('passes an already redeemed voucher through with its status', async () => {
    getVoucherForRedemption.mockResolvedValue({
      ...voucher,
      status: 'redeemed',
      redeemedAt: new Date().toISOString(),
    })
    const out = await renderBody(CODE)
    expect(out.props.children[1].props.status).toBe('redeemed')
  })
})
