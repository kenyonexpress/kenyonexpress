import { CONSENT_COOKIE, CONSENT_WORDING_VERSION } from '@/lib/analytics/consent'
import { RECENT_VIEWS_KEY } from '@/lib/recommendations/recent-views'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/cart/AddToCartButton', () => ({ default: () => null }))
vi.mock('@/components/product/WishlistButton', () => ({ default: () => null }))
vi.mock('@/components/compare/CompareButton', () => ({ default: () => null }))

const {
  default: ForYouRow,
  FOR_YOU_ENDPOINT,
  FOR_YOU_TITLE,
  forYouRequestUrl,
} = await import('./ForYouRow')

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

const card = (id: string) => ({
  id,
  slug: id,
  name_he: `מוצר ${id}`,
  kenyon_price: 100,
  full_price: null,
  images: [],
  stock_quantity: 2,
  category: null,
})

function clearCookies() {
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`
  }
}

function grantConsent() {
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(`granted.${CONSENT_WORDING_VERSION}`)}; Path=/`
}

const fetchMock = vi.fn()

beforeEach(() => {
  clearCookies()
  window.localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('forYouRequestUrl', () => {
  it('is null without consent, and null with consent but nothing to personalise on', () => {
    expect(forYouRequestUrl({ allowed: false, seeds: [A], hasDistinctId: true })).toBeNull()
    expect(forYouRequestUrl({ allowed: true, seeds: [], hasDistinctId: false })).toBeNull()
  })

  it('sends the seeds, and a bare request when only the cookie id exists', () => {
    expect(forYouRequestUrl({ allowed: true, seeds: [A, B], hasDistinctId: false })).toBe(
      `${FOR_YOU_ENDPOINT}?seed=${encodeURIComponent(`${A},${B}`)}`,
    )
    expect(forYouRequestUrl({ allowed: true, seeds: [], hasDistinctId: true })).toBe(
      FOR_YOU_ENDPOINT,
    )
  })
})

describe('ForYouRow', () => {
  it('mounts empty and makes no request for a visitor who declined tracking', async () => {
    window.localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify([A]))
    const { container } = render(<ForYouRow />)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(container.innerHTML).toBe('')
  })

  it('asks the endpoint with the recent views and renders the row it gets back', async () => {
    grantConsent()
    window.localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify([A]))
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ products: [card('x'), card('y')] }), { status: 200 }),
    )
    render(<ForYouRow />)
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${FOR_YOU_ENDPOINT}?seed=${A}`)
    expect(await screen.findByRole('heading', { name: FOR_YOU_TITLE })).toBeTruthy()
    expect(screen.getByText('מוצר x')).toBeTruthy()
  })

  it('stays empty under the floor and on a failed request', async () => {
    grantConsent()
    document.cookie = 'ke_ph_id=visitor-1; Path=/'
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ products: [card('x')] }), { status: 200 }),
    )
    const first = render(<ForYouRow />)
    await act(async () => {})
    expect(fetchMock.mock.calls[0]?.[0]).toBe(FOR_YOU_ENDPOINT)
    expect(first.container.innerHTML).toBe('')
    first.unmount()

    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    const second = render(<ForYouRow />)
    await act(async () => {})
    expect(second.container.innerHTML).toBe('')
  })
})
