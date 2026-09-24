import { afterEach, describe, expect, it, vi } from 'vitest'
import { orderContactLink, productQuestionLink } from './inquiry-links'

describe('inquiry links', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('opens a wa.me chat, never a phone call, with the product named', () => {
    const href = productQuestionLink('תיק עור JEEP', 'https://kenyonexpress.co.il/product/x')
    expect(href).toMatch(/^https:\/\/wa\.me\/972\d+\?text=/)
    const text = decodeURIComponent(href?.split('text=')[1] ?? '')
    expect(text).toContain('תיק עור JEEP')
    expect(text).toContain('https://kenyonexpress.co.il/product/x')
    expect(href).not.toContain('tel:')
  })

  it('uses the env override number for both links', () => {
    vi.stubEnv('NEXT_PUBLIC_WHATSAPP_PHONE', '0501234567')
    expect(productQuestionLink('x')).toContain('wa.me/972501234567')
    expect(orderContactLink('abcdef12-0000-4000-8000-000000000000')).toContain('wa.me/972501234567')
  })

  it('names the order by its short id, upper-cased', () => {
    const href = orderContactLink('abcdef12-0000-4000-8000-000000000000')
    expect(decodeURIComponent(href?.split('text=')[1] ?? '')).toContain('ABCDEF12')
  })

  it('prefills the order details the order page hands it', () => {
    const href = orderContactLink('abcdef12-0000-4000-8000-000000000000', {
      itemNames: ['ארוחה זוגית'],
      totalAgorot: 4000,
    })
    const text = decodeURIComponent(href?.split('text=')[1] ?? '')
    expect(text).toContain('ABCDEF12')
    expect(text).toContain('ארוחה זוגית')
    expect(text).toContain('40.00')
  })
})
