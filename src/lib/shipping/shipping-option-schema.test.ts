import { orderExtrasSchema } from '@/lib/validations/checkout'
import { describe, expect, it } from 'vitest'
import { resolveShippingChoice, shippingCarrierNoteLine } from './quote'

describe('shipping_option through the checkout schema', () => {
  it('accepts the radio value, treats empty as absent, and refuses junk by shape', () => {
    expect(orderExtrasSchema.parse({ shipping_option: 'chita:express' }).shipping_option).toBe(
      'chita:express',
    )
    expect(orderExtrasSchema.parse({ shipping_option: '' }).shipping_option).toBeUndefined()
    expect(orderExtrasSchema.parse({}).shipping_option).toBeUndefined()
    expect(orderExtrasSchema.safeParse({ shipping_option: '<script>' }).success).toBe(false)
    expect(orderExtrasSchema.safeParse({ shipping_option: 'a'.repeat(61) }).success).toBe(false)
  })

  it('resolves only registry members, and renders the supplier note line', () => {
    expect(resolveShippingChoice('israel_post:ems')).toEqual({
      carrierId: 'israel_post',
      serviceCode: 'ems',
      carrierLabel: 'דואר ישראל',
      serviceLabel: 'EMS מהיר',
    })
    expect(resolveShippingChoice('israel_post:teleport')).toBeNull()
    expect(resolveShippingChoice('ups:standard')).toBeNull()
    expect(resolveShippingChoice(undefined)).toBeNull()
    expect(shippingCarrierNoteLine(resolveShippingChoice('chita:standard')!)).toBe(
      "חברת משלוחים מבוקשת: צ'יטה שליחויות (שליח עד הבית)",
    )
  })
})
