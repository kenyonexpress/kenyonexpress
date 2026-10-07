import { beforeEach, describe, expect, it, vi } from 'vitest'

const revalidateTag = vi.fn()
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag, revalidatePath }))

const { isRevalidatablePath, revalidateCachePaths, revalidateCacheTags } = await import(
  './revalidate'
)

beforeEach(() => {
  revalidateTag.mockReset()
  revalidatePath.mockReset()
})

describe('revalidateCacheTags', () => {
  it('submits every tag once with the max profile and echoes what it submitted', () => {
    const out = revalidateCacheTags(['catalogue', 'product:abc', 'catalogue'])
    expect(out).toEqual(['catalogue', 'product:abc'])
    expect(revalidateTag).toHaveBeenCalledTimes(2)
    expect(revalidateTag).toHaveBeenCalledWith('catalogue', 'max')
    expect(revalidateTag).toHaveBeenCalledWith('product:abc', 'max')
  })

  /**
   * The one-argument form is deprecated and blocking (`{ expire: 0 }`); a
   * webhook has no reader waiting, so it must never be the blocking kind.
   */
  it('never calls the one-argument, blocking form', () => {
    revalidateCacheTags(['home'])
    for (const call of revalidateTag.mock.calls) {
      expect(call).toHaveLength(2)
      expect(call[1]).toBe('max')
    }
  })

  it('skips empty and oversized tags, which Next would drop silently', () => {
    expect(revalidateCacheTags(['', 'x'.repeat(257)])).toEqual([])
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('isRevalidatablePath', () => {
  it('accepts the public catalogue surfaces', () => {
    for (const path of [
      '/',
      '/products',
      '/search',
      '/sitemap.xml',
      '/feed.xml',
      '/merchant.xml',
      '/category/hot-deals',
      '/product/demo-product-2',
      '/coupon/demo',
      '/s/0f2b6a9e-7c1d-4e5a-9b3c-2d8e1f4a6c7b',
    ]) {
      expect(isRevalidatablePath(path), path).toBe(true)
    }
  })

  it('refuses private surfaces and anything not a storefront path', () => {
    for (const path of [
      '/account',
      '/account/orders',
      '/cart',
      '/checkout',
      '/admin/products',
      '/api/cart',
      '/product/',
      '/product/../account',
      '/product/UPPER',
      '/s/not-a-uuid',
      'products',
      '',
    ]) {
      expect(isRevalidatablePath(path), path).toBe(false)
    }
  })
})

describe('revalidateCachePaths', () => {
  it('purges only the allowed paths and echoes them', () => {
    const out = revalidateCachePaths(['/', '/account', '/products', '/'])
    expect(out).toEqual(['/', '/products'])
    expect(revalidatePath).toHaveBeenCalledTimes(2)
    expect(revalidatePath).toHaveBeenCalledWith('/')
    expect(revalidatePath).toHaveBeenCalledWith('/products')
  })
})
