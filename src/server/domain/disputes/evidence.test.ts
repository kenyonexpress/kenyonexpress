import {
  type EvidenceInput,
  buildEvidencePack,
  evidencePackText,
} from '@/server/domain/disputes/evidence'
import { describe, expect, it } from 'vitest'

const base: Omit<EvidenceInput, 'generatedAt'> = {
  dispute: {
    providerRef: 'CB-1001',
    kind: 'chargeback',
    amountAgorot: 12_900,
    openedAt: '2026-09-01T08:00:00Z',
    respondBy: '2026-09-15T08:00:00Z',
    reasonCode: '4853',
    notes: null,
  },
  order: {
    id: '11111111-1111-1111-1111-111111111111',
    status: 'paid',
    createdAt: '2026-08-20T08:00:00Z',
    paidAt: '2026-08-20T08:01:00Z',
    acceptedTermsAt: '2026-08-20T08:00:30Z',
    totalAgorot: 12_900,
    customerEmail: 'shopper@example.com',
    customerName: 'שופר',
  },
  items: [{ productName: 'עיסוי', quantity: 1, totalAgorot: 12_900, supplierName: 'ספא' }],
  payments: [
    {
      id: 'p1',
      status: 'succeeded',
      createdAt: '2026-08-20T08:01:00Z',
      transactionId: 'TX-9',
      last4: null,
      amountAgorot: 12_900,
    },
  ],
  redemptions: [],
  refundRequests: [],
}

const pack = (overrides: Partial<Omit<EvidenceInput, 'generatedAt'>> = {}) =>
  buildEvidencePack({ ...base, ...overrides, generatedAt: new Date('2026-09-09T12:00:00Z') })

const section = (input: ReturnType<typeof pack>, title: string) =>
  input.sections.find((s) => s.title === title)

describe('buildEvidencePack', () => {
  it('states an absence in words rather than omitting the section', () => {
    // A missing paragraph reads as an oversight. "No redemption was recorded"
    // is the fact that tells the operator to settle instead of fighting.
    const redemption = section(pack(), 'מימוש השובר אצל בית העסק')
    expect(redemption?.lines.join(' ')).toContain('לא נרשם אף מימוש')
    expect(redemption?.supportive).toBe(false)
  })

  it('treats a successful redemption as the supportive fact it is', () => {
    const result = pack({
      redemptions: [
        {
          code: 'ABC123',
          outcome: 'redeemed',
          at: '2026-08-25T15:00:00Z',
          supplierName: 'ספא',
          staffName: null,
          scanMethod: 'qr',
          ip: '203.0.113.7',
        },
      ],
    })
    const redemption = section(result, 'מימוש השובר אצל בית העסק')
    expect(redemption?.supportive).toBe(true)
    expect(redemption?.lines[0]).toContain('ABC123')
    expect(redemption?.lines[0]).toContain('ספא')
    expect(result.defensible).toBe(true)
  })

  it('DOES NOT dress a failed scan as proof of delivery', () => {
    // Somebody tried to redeem is not the same claim as somebody received the
    // service, and this pack is submitted to a bank under our name.
    const result = pack({
      redemptions: [
        {
          code: 'ABC123',
          outcome: 'already_redeemed',
          at: '2026-08-25T15:00:00Z',
          supplierName: 'ספא',
          staffName: null,
          scanMethod: 'qr',
          ip: null,
        },
      ],
    })
    const redemption = section(result, 'מימוש השובר אצל בית העסק')
    expect(redemption?.supportive).toBe(false)
    expect(redemption?.lines.join(' ')).toContain('אינו הוכחה')
  })

  it('lets NOTHING but a redemption clear the evidence bar', () => {
    // The bug this caught: `defensible` originally counted the item list, the
    // successful charge and "the customer never contacted us", so it was true
    // for every dispute and the warning built on it meant nothing. Nobody
    // disputes being billed, and every merchant has a terms checkbox.
    const built = pack()
    for (const title of ['ההזמנה', 'אישור התנאים', 'מה נרכש', 'החיוב', 'פניות קודמות של הלקוח']) {
      expect(section(built, title)?.supportive, title).toBe(false)
    }
    expect(built.defensible).toBe(false)
  })

  it('says the terms were never accepted when they were not', () => {
    const result = pack({ order: { ...base.order, acceptedTermsAt: null } })
    expect(section(result, 'אישור התנאים')?.lines[0]).toContain('לא נרשם אישור תנאים')
  })

  it('reports prior refund requests, which cut against us, rather than hiding them', () => {
    const result = pack({
      refundRequests: [
        { status: 'rejected', reasonCode: 'not_received', createdAt: '2026-08-28T09:00:00Z' },
      ],
    })
    const prior = section(result, 'פניות קודמות של הלקוח')
    expect(prior?.supportive).toBe(false)
    expect(prior?.lines[0]).toContain('rejected')
  })

  it('notes that the customer never asked us first, without calling it evidence', () => {
    const prior = section(pack(), 'פניות קודמות של הלקוח')
    expect(prior?.lines[0]).toContain('לא פנה אלינו')
    expect(prior?.supportive).toBe(false)
  })

  it('is defensible on a redemption alone, and on nothing else', () => {
    expect(pack().defensible).toBe(false)
    expect(
      pack({
        redemptions: [
          {
            code: 'ABC',
            outcome: 'redeemed',
            at: '2026-08-25T15:00:00Z',
            supplierName: null,
            staffName: null,
            scanMethod: null,
            ip: null,
          },
        ],
      }).defensible,
    ).toBe(true)
  })

  it('still lists a failed payment, because the operator needs the trail', () => {
    const failed = pack({
      payments: [
        {
          id: 'p1',
          status: 'failed',
          createdAt: '2026-08-20T08:01:00Z',
          transactionId: null,
          last4: null,
          amountAgorot: 12_900,
        },
      ],
    })
    expect(section(failed, 'החיוב')?.lines[0]).toContain('failed')
  })

  it('includes operator notes only when there are any', () => {
    expect(section(pack(), 'הערות המפעיל')).toBeUndefined()
    const withNotes = pack({ dispute: { ...base.dispute, notes: 'שיחה עם הסולק\nביקשו מסמכים' } })
    expect(section(withNotes, 'הערות המפעיל')?.lines).toEqual(['שיחה עם הסולק', 'ביקשו מסמכים'])
  })

  it('formats money as shekels from integer agorot', () => {
    expect(section(pack(), 'התיק')?.lines.join(' ')).toContain('₪129.00')
  })

  it('never leaves an unrendered placeholder in a line', () => {
    const result = pack({
      order: { ...base.order, customerEmail: null, customerName: null, totalAgorot: null },
      items: [],
      payments: [],
    })
    for (const s of result.sections) {
      for (const line of s.lines) {
        expect(line, line).not.toMatch(/undefined|NaN|\[object/)
      }
    }
  })
})

describe('evidencePackText', () => {
  it('leads with a warning when the pack has nothing affirmative in it', () => {
    const text = evidencePackText(pack())
    expect(text).toContain('אין בתיק הזה ראיה שהלקוח קיבל')
  })

  it('does not warn when the pack is defensible', () => {
    const text = evidencePackText(
      pack({
        redemptions: [
          {
            code: 'ABC',
            outcome: 'redeemed',
            at: '2026-08-25T15:00:00Z',
            supplierName: null,
            staffName: null,
            scanMethod: null,
            ip: null,
          },
        ],
      }),
    )
    expect(text).not.toContain('אין בתיק הזה ראיה שהלקוח קיבל')
    expect(text).toContain('תיק CB-1001')
  })

  it('renders every section as a heading with its lines', () => {
    const built = pack()
    const text = evidencePackText(built)
    for (const s of built.sections) {
      expect(text).toContain(`## ${s.title}`)
    }
  })
})
