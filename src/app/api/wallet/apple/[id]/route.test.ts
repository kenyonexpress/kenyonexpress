import { readZip } from '@/lib/wallet/zip'
import { NextRequest } from 'next/server'
import forge from 'node-forge'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const getCustomerVoucher = vi.fn()
const passImages = vi.fn()

vi.mock('@/server/queries/vouchers', () => ({
  getCustomerVoucher: (...args: unknown[]) => getCustomerVoucher(...args),
}))
vi.mock('@/lib/wallet/pass-images', () => ({
  passImages: () => passImages(),
}))

import { GET } from './route'

const VOUCHER = {
  id: '11111111-2222-3333-4444-555555555555',
  code: 'ABCDE12345',
  qr_payload: 'KEV1.eyJ2IjoxfQ.bWFj',
  status: 'issued',
  face_value_agorot: 20_000,
  coupon_price_agorot: 8_000,
  remaining_amount_due_agorot: 12_000,
  expires_at: '2099-01-31T21:59:59.000Z',
  issued_at: '2026-08-01T09:00:00.000Z',
  product: { name_he: 'ארוחה זוגית' },
  supplier: { name: 'מסעדת הים' },
}

let certificatePem: string
let privateKeyPem: string

beforeAll(() => {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const certificate = forge.pki.createCertificate()
  certificate.publicKey = keys.publicKey
  certificate.serialNumber = '01'
  certificate.validity.notBefore = new Date(0)
  certificate.validity.notAfter = new Date(4102444800000)
  const attrs = [{ name: 'commonName', value: 'test' }]
  certificate.setSubject(attrs)
  certificate.setIssuer(attrs)
  certificate.sign(keys.privateKey, forge.md.sha256.create())
  certificatePem = forge.pki.certificateToPem(certificate)
  privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey)
})

function configure(): void {
  vi.stubEnv('APPLE_WALLET_PASS_TYPE_ID', 'pass.test.kenyonexpress.coupon')
  vi.stubEnv('APPLE_WALLET_TEAM_ID', 'TEAM123456')
  vi.stubEnv('APPLE_WALLET_CERT_PEM', certificatePem)
  vi.stubEnv('APPLE_WALLET_KEY_PEM', privateKeyPem)
  vi.stubEnv('APPLE_WALLET_WWDR_PEM', certificatePem)
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://kenyonexpress.co.il/')
}

function request(id: string) {
  return [
    new NextRequest(`https://kenyonexpress.co.il/api/wallet/apple/${id}`),
    { params: Promise.resolve({ id }) },
  ] as const
}

beforeEach(() => {
  getCustomerVoucher.mockReset().mockResolvedValue(VOUCHER)
  passImages
    .mockReset()
    .mockResolvedValue([{ name: 'icon.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/wallet/apple/[id]', () => {
  it('serves a signed archive with the pkpass content type', async () => {
    configure()
    const response = await GET(...request(VOUCHER.id))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/vnd.apple.pkpass')
    expect(response.headers.get('content-disposition')).toContain('ABCDE12345.pkpass')

    const entries = readZip(Buffer.from(await response.arrayBuffer()))
    expect(entries.map((e) => e.name)).toEqual([
      'pass.json',
      'icon.png',
      'manifest.json',
      'signature',
    ])
  })

  it('carries the same QR payload the coupon page shows', async () => {
    configure()
    const response = await GET(...request(VOUCHER.id))
    const entries = readZip(Buffer.from(await response.arrayBuffer()))
    const pass = JSON.parse(
      entries.find((e) => e.name === 'pass.json')?.data.toString('utf8') as string,
    ) as { barcodes: { message: string }[]; serialNumber: string }

    expect(pass.barcodes[0]?.message).toBe(VOUCHER.qr_payload)
    expect(pass.serialNumber).toBe(VOUCHER.id)
  })

  it('never caches: the body is one customer’s live voucher', async () => {
    configure()
    const response = await GET(...request(VOUCHER.id))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('is 404, not 500, when Apple Wallet is not configured', async () => {
    // Nothing renders the button in that case, so a request here is a stale tab
    // or a probe. Neither should be told an error occurred.
    const response = await GET(...request(VOUCHER.id))
    expect(response.status).toBe(404)
    expect(getCustomerVoucher).not.toHaveBeenCalled()
  })

  it('is 404 for a voucher the caller does not own', async () => {
    // `getCustomerVoucher` reads through the user-scoped client, so RLS decides
    // and somebody else's id is indistinguishable from one that never existed.
    // This endpoint hands out the payload the counter accepts; it cannot be
    // looser than the coupon page.
    configure()
    getCustomerVoucher.mockResolvedValue(null)
    expect((await GET(...request(VOUCHER.id))).status).toBe(404)
  })

  it('reports a build failure as 500 rather than a truncated download', async () => {
    configure()
    passImages.mockRejectedValue(new Error('sharp exploded'))
    const response = await GET(...request(VOUCHER.id))
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ ok: false, error: 'build_failed' })
  })

  it('links back to the site without a doubled slash', async () => {
    configure()
    const entries = readZip(Buffer.from(await (await GET(...request(VOUCHER.id))).arrayBuffer()))
    const pass = JSON.parse(
      entries.find((e) => e.name === 'pass.json')?.data.toString('utf8') as string,
    ) as { storeCard: { backFields: { key: string; value: string }[] } }
    expect(pass.storeCard.backFields.find((f) => f.key === 'link')?.value).toBe(
      `https://kenyonexpress.co.il/coupon/${VOUCHER.id}`,
    )
  })
})
