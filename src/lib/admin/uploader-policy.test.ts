import { describe, expect, it } from 'vitest'
import { applyUploaderPolicy } from './uploader-policy'

const money = {
  price_ils: 100,
  platform_percent: 25,
  supplier_split_percent: 75,
  coupon_price_ils: null,
}

describe('applyUploaderPolicy', () => {
  it('strips the commission split from an uploader and forces pending approval', () => {
    const { fields, forcePendingApproval } = applyUploaderPolicy('content_uploader', money)
    expect(fields).not.toHaveProperty('platform_percent')
    expect(fields).not.toHaveProperty('supplier_split_percent')
    expect(fields.price_ils).toBe(100)
    expect(forcePendingApproval).toBe(true)
  })

  it('passes admin and super_admin writes through untouched', () => {
    for (const role of ['admin', 'super_admin'] as const) {
      const { fields, forcePendingApproval } = applyUploaderPolicy(role, money)
      expect(fields).toEqual(money)
      expect(forcePendingApproval).toBe(false)
    }
  })

  it('does not mutate the caller object', () => {
    applyUploaderPolicy('content_uploader', money)
    expect(money.platform_percent).toBe(25)
  })
})
