import { describe, expect, it } from 'vitest'
import {
  type WalletVoucher,
  buildApplePass,
  buildGooglePass,
  googleClassId,
  googleObjectId,
} from './pass-model'

const LIVE: WalletVoucher = {
  id: '11111111-2222-3333-4444-555555555555',
  code: 'ABCDE12345',
  qr_payload: 'KEV1.eyJ2IjoxfQ.bWFj',
  status: 'issued',
  face_value_agorot: 20_000,
  coupon_price_agorot: 8_000,
  remaining_amount_due_agorot: 12_000,
  // Far enough out that the clock cannot make this test flake.
  expires_at: '2099-01-31T21:59:59.000Z',
  issued_at: '2026-08-01T09:00:00.000Z',
  product: { name_he: 'ארוחה זוגית' },
  supplier: { name: 'מסעדת הים', address: 'הרצל 1', city: 'תל אביב', contact_phone: '03-1234567' },
}

const APPLE = {
  passTypeIdentifier: 'pass.co.kenyonexpress.coupon',
  teamIdentifier: 'TEAM123456',
  organizationName: 'KenyonExpress',
  origin: 'https://kenyonexpress.co.il',
}

const GOOGLE = {
  issuerId: '3388000000000000000',
  classSuffix: 'kenyon_voucher',
  origin: 'https://kenyonexpress.co.il',
}

describe('the barcode, which is the only field that can fail at a counter', () => {
  it('carries qr_payload byte for byte on Apple', () => {
    const pass = buildApplePass(LIVE, APPLE) as { barcodes: { message: string }[] }
    expect(pass.barcodes[0]?.message).toBe(LIVE.qr_payload)
  })

  it('carries qr_payload byte for byte on Google', () => {
    const object = buildGooglePass(LIVE, GOOGLE) as { barcode: { value: string } }
    expect(object.barcode.value).toBe(LIVE.qr_payload)
  })

  it('never substitutes the short code for the payload', () => {
    // The short code scans as an unknown voucher: the redeem endpoint verifies
    // an HMAC over `KEV1.<body>.<mac>`, and a bare code has no MAC to check.
    const pass = buildApplePass(LIVE, APPLE) as { barcodes: { message: string; altText: string }[] }
    expect(pass.barcodes[0]?.message).not.toBe(LIVE.code)
    // It is still printed for a cashier to type, which is what altText is for.
    expect(pass.barcodes[0]?.altText).toBe('ABCDE-12345')
  })
})

describe('buildApplePass', () => {
  it('keys the pass by voucher id so a second download replaces the card', () => {
    const pass = buildApplePass(LIVE, APPLE) as { serialNumber: string }
    expect(pass.serialNumber).toBe(LIVE.id)
  })

  it('shows what is still due at the counter in the header, not what was paid', () => {
    // A customer reading only "80 ₪" arrives believing they owe nothing.
    const pass = buildApplePass(LIVE, APPLE) as {
      storeCard: { headerFields: { key: string; value: string }[] }
    }
    expect(pass.storeCard.headerFields[0]).toMatchObject({ key: 'due', value: '120.00 ₪' })
  })

  it('is not voided while the voucher is live', () => {
    expect((buildApplePass(LIVE, APPLE) as { voided: boolean }).voided).toBe(false)
  })

  it('voids a redeemed voucher', () => {
    const pass = buildApplePass({ ...LIVE, status: 'redeemed' }, APPLE) as { voided: boolean }
    expect(pass.voided).toBe(true)
  })

  it('voids a voucher past its deadline that the sweep has not caught yet', () => {
    // `status` still reads `issued` between the deadline and the nightly cron.
    // The pass must agree with the counter, not with the column.
    const pass = buildApplePass({ ...LIVE, expires_at: '2020-01-01T00:00:00.000Z' }, APPLE) as {
      voided: boolean
    }
    expect(pass.voided).toBe(true)
  })

  it('puts the business address and phone on the back when they exist', () => {
    const pass = buildApplePass(LIVE, APPLE) as {
      storeCard: { backFields: { key: string; value: string }[] }
    }
    const keys = pass.storeCard.backFields.map((f) => f.key)
    expect(keys).toContain('address')
    expect(keys).toContain('phone')
    expect(pass.storeCard.backFields.find((f) => f.key === 'address')?.value).toBe(
      'הרצל 1, תל אביב',
    )
  })

  it('omits them rather than printing empty rows', () => {
    const pass = buildApplePass({ ...LIVE, supplier: { name: 'מסעדת הים' } }, APPLE) as {
      storeCard: { backFields: { key: string }[] }
    }
    const keys = pass.storeCard.backFields.map((f) => f.key)
    expect(keys).not.toContain('address')
    expect(keys).not.toContain('phone')
  })

  it('links back to the coupon page on this origin', () => {
    const pass = buildApplePass(LIVE, APPLE) as {
      storeCard: { backFields: { key: string; value: string }[] }
    }
    expect(pass.storeCard.backFields.find((f) => f.key === 'link')?.value).toBe(
      `https://kenyonexpress.co.il/coupon/${LIVE.id}`,
    )
  })

  it('falls back to a Hebrew name when the product has none', () => {
    const pass = buildApplePass({ ...LIVE, product: null }, APPLE) as {
      description: string
      storeCard: { primaryFields: { value: string }[] }
    }
    expect(pass.storeCard.primaryFields[0]?.value).toBe('שובר')
    expect(pass.description).toBe('שובר שובר')
  })
})

describe('buildGooglePass', () => {
  it('is ACTIVE while the voucher is live', () => {
    expect((buildGooglePass(LIVE, GOOGLE) as { state: string }).state).toBe('ACTIVE')
  })

  it('is EXPIRED once it has been redeemed', () => {
    const object = buildGooglePass({ ...LIVE, status: 'redeemed' }, GOOGLE) as { state: string }
    expect(object.state).toBe('EXPIRED')
  })

  it('is EXPIRED for a refunded voucher, not merely inactive', () => {
    // Google has no "spent" state. Leaving it ACTIVE puts a dead voucher back
    // on the lock screen when the customer walks past the shop.
    const object = buildGooglePass({ ...LIVE, status: 'refunded' }, GOOGLE) as { state: string }
    expect(object.state).toBe('EXPIRED')
  })

  it('names the object by the voucher code, which is what redemption knows', () => {
    // The redeem RPC is called with a short code and hands one back. Keying the
    // object on the UUID would put a `vouchers` lookup inside the counter's scan
    // purely to learn which wallet object to expire.
    const object = buildGooglePass(LIVE, GOOGLE) as { id: string; classId: string }
    expect(object.id).toBe(`${GOOGLE.issuerId}.${LIVE.code}`)
    expect(object.classId).toBe(`${GOOGLE.issuerId}.kenyon_voucher`)
  })

  it('lets the client retire the pass on its own at the deadline', () => {
    // Why the nightly expiry sweep pushes nothing: Google reads this and moves
    // the card itself, exactly as Apple reads `expirationDate`.
    const object = buildGooglePass(LIVE, GOOGLE) as {
      validTimeInterval: { end: { date: string } }
    }
    expect(object.validTimeInterval.end.date).toBe('2099-01-31T21:59:59.000Z')
  })

  it('tags Hebrew text with a language, so it is not laid out as English', () => {
    const object = buildGooglePass(LIVE, GOOGLE) as {
      header: { defaultValue: { language: string; value: string } }
    }
    expect(object.header.defaultValue).toEqual({ language: 'iw', value: 'ארוחה זוגית' })
  })

  it('carries the three money numbers, not just the price paid', () => {
    const object = buildGooglePass(LIVE, GOOGLE) as {
      textModulesData: { id: string; body: string }[]
    }
    const byId = Object.fromEntries(object.textModulesData.map((m) => [m.id, m.body]))
    expect(byId).toMatchObject({ due: '120.00 ₪', paid: '80.00 ₪', face: '200.00 ₪' })
  })
})

describe('google identifiers', () => {
  it('strips characters Google will not accept in an object id', () => {
    // A rejected id surfaces to the customer as a save link that errors, with
    // nothing on our side to say why.
    expect(googleObjectId('123', 'abc/def?g')).toBe('123.abcdefg')
  })

  it('builds the class id from the issuer and the suffix', () => {
    expect(googleClassId({ issuerId: '123', classSuffix: 'v' })).toBe('123.v')
  })
})
