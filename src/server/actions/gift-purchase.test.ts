import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieSet = vi.fn()
const addToCart = vi.fn()
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`)
})
let productRow: Record<string, unknown> | null = null

vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))
vi.mock('@/server/actions/cart', () => ({ addToCart: (...a: unknown[]) => addToCart(...a) }))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('@/lib/supabase/anon', () => ({
  createPublicClient: () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      maybeSingle: async () => ({ data: productRow, error: null }),
    }
    return { from: () => chain }
  },
}))

import { GIFT_DRAFT_COOKIE, decodeGiftDraft } from '@/lib/gifts/draft'
import { startGiftPurchase } from './gift-purchase'

const PRODUCT_ID = '22222222-2222-4222-8222-222222222222'

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  data.set('product_id', PRODUCT_ID)
  for (const [k, v] of Object.entries(fields)) data.set(k, v)
  return data
}

function inDays(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

beforeEach(() => {
  cookieSet.mockReset()
  addToCart.mockReset()
  redirect.mockClear()
  productRow = { id: PRODUCT_ID, type: 'coupon', is_coupon_enabled: true }
  addToCart.mockResolvedValue({ ok: true, cart: {} })
})

describe('startGiftPurchase (S22)', () => {
  it('adds the coupon to the cart, stores the draft for /checkout and redirects there', async () => {
    const deliver = inDays(10)
    await expect(
      startGiftPurchase(
        null,
        form({
          gift_recipient_email: 'friend@example.com',
          gift_recipient_name: 'דנה',
          gift_message: 'מזל טוב',
          gift_deliver_at: deliver,
          gift_wrap: 'on',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/checkout')

    expect(addToCart).toHaveBeenCalledWith(PRODUCT_ID, null, 1)
    expect(cookieSet).toHaveBeenCalledTimes(1)
    const [name, value, options] = cookieSet.mock.calls[0] as [string, string, object]
    expect(name).toBe(GIFT_DRAFT_COOKIE)
    expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/checkout' })
    expect(decodeGiftDraft(value)).toEqual({
      gift_recipient_email: 'friend@example.com',
      gift_recipient_name: 'דנה',
      gift_message: 'מזל טוב',
      gift_deliver_at: deliver,
      gift_wrap: true,
    })
  })

  it('requires a valid recipient email and touches nothing without one', async () => {
    const result = await startGiftPurchase(null, form({ gift_recipient_email: 'nope' }))
    expect(result).toEqual({ error: 'כתובת המייל של המקבל אינה תקינה' })
    expect(addToCart).not.toHaveBeenCalled()
    expect(cookieSet).not.toHaveBeenCalled()
  })

  it('refuses a send date in the past, on the page where it was typed', async () => {
    const result = await startGiftPurchase(
      null,
      form({ gift_recipient_email: 'friend@example.com', gift_deliver_at: inDays(-5) }),
    )
    expect(result).toEqual({ error: 'לא ניתן לתזמן משלוח לתאריך שעבר' })
    expect(addToCart).not.toHaveBeenCalled()
  })

  it('refuses a send date past the 365-day ceiling', async () => {
    const result = await startGiftPurchase(
      null,
      form({ gift_recipient_email: 'friend@example.com', gift_deliver_at: inDays(400) }),
    )
    expect(result && 'error' in result && result.error).toMatch(/365/)
    expect(addToCart).not.toHaveBeenCalled()
  })

  it('refuses a physical product, which checkout cannot gift either', async () => {
    productRow = { id: PRODUCT_ID, type: 'physical', is_coupon_enabled: false }
    const result = await startGiftPurchase(
      null,
      form({ gift_recipient_email: 'friend@example.com' }),
    )
    expect(result).toEqual({ error: 'אפשר לשלוח כמתנה רק קופון' })
    expect(addToCart).not.toHaveBeenCalled()
  })

  it('refuses a product that is not active', async () => {
    productRow = null
    const result = await startGiftPurchase(
      null,
      form({ gift_recipient_email: 'friend@example.com' }),
    )
    expect(result).toEqual({ error: 'אפשר לשלוח כמתנה רק קופון' })
  })

  it('shows the cart refusal as-is and stores no draft', async () => {
    addToCart.mockResolvedValue({ ok: false, error: 'אזל המלאי', code: 'out_of_stock' })
    const result = await startGiftPurchase(
      null,
      form({ gift_recipient_email: 'friend@example.com' }),
    )
    expect(result).toEqual({ error: 'אזל המלאי' })
    expect(cookieSet).not.toHaveBeenCalled()
  })
})
