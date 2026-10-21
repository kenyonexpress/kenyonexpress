import { describe, expect, it } from 'vitest'
import {
  SUPPLIER_AGREEMENT_CLAUSES,
  SUPPLIER_AGREEMENT_VERSION,
  supplierAgreementHash,
} from './supplier-agreement'

describe('supplier agreement', () => {
  it('has a stable sha256 hash', () => {
    expect(supplierAgreementHash()).toMatch(/^[0-9a-f]{64}$/)
    expect(supplierAgreementHash()).toBe(supplierAgreementHash())
  })
  it('names Israeli law and Tel Aviv jurisdiction', () => {
    const text = SUPPLIER_AGREEMENT_CLAUSES.join(' ')
    expect(text).toContain('לדין הישראלי')
    expect(text).toContain('תל אביב')
  })
  it('gives the platform an unlimited right to refund any customer in full (F42)', () => {
    const text = SUPPLIER_AGREEMENT_CLAUSES.join(' ')
    expect(text).toContain('זכות בלתי מוגבלת להחזיר לכל לקוח את מלוא הסכום')
    expect(text).toContain('ללא צורך באישור העסק')
    expect(text).toContain('ללא חובת הנמקה')
  })
  it('carries a dated version', () => {
    expect(SUPPLIER_AGREEMENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
