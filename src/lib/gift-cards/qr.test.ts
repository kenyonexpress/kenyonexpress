import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
process.env.NEXT_PUBLIC_APP_URL = 'https://kenyonexpress.co.il'

const { giftCardQrDataUrl, giftCardRedeemUrl } = await import('./qr')
const { createGiftCardCode } = await import('./code')

describe('giftCardRedeemUrl', () => {
  it('carries the code in the fragment, never in the path or the query', () => {
    const { code } = createGiftCardCode()
    const url = new URL(giftCardRedeemUrl('https://kenyonexpress.co.il/', code))
    expect(url.pathname).toBe('/gift-card')
    expect(url.search).toBe('')
    expect(url.hash).toBe(`#${code}`)
  })
})

describe('giftCardQrDataUrl', () => {
  it('draws a PNG for a well-formed code', async () => {
    const { code } = createGiftCardCode()
    const dataUrl = await giftCardQrDataUrl(code)
    expect(dataUrl?.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('draws nothing for a code that is not one', async () => {
    expect(await giftCardQrDataUrl('nope')).toBeNull()
    expect(await giftCardQrDataUrl('')).toBeNull()
  })
})
