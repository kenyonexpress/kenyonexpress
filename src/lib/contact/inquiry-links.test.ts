import { afterEach, describe, expect, it, vi } from 'vitest'
import { appendPageUrl, orderContactLink, productQuestionLink } from './inquiry-links'

describe('appendPageUrl', () => {
  const href = `https://wa.me/972501234567?text=${encodeURIComponent('שלום, יש לי שאלה על X')}`

  it('adds the page address on its own line, encoded like waChatLink', () => {
    const out = appendPageUrl(href, 'https://www.kenyonexpress.co.il/product/x')
    expect(out.startsWith('https://wa.me/972501234567?text=')).toBe(true)
    expect(out).not.toContain('+')
    expect(decodeURIComponent(out.split('text=')[1] ?? '')).toBe(
      'שלום, יש לי שאלה על X\nhttps://www.kenyonexpress.co.il/product/x',
    )
  })

  it('does not stack a second copy on re-render', () => {
    const once = appendPageUrl(href, 'https://www.kenyonexpress.co.il/product/x')
    expect(appendPageUrl(once, 'https://www.kenyonexpress.co.il/product/x')).toBe(once)
  })

  it('fills an empty text with the address alone', () => {
    const out = appendPageUrl('https://wa.me/972501234567', 'https://k.e/p')
    expect(decodeURIComponent(out.split('text=')[1] ?? '')).toBe('https://k.e/p')
  })
})

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
