import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useProductPurchaseCount } from './useProductPurchaseCount'

// Mock the supabase client
const mockSubscribe = vi.fn()
const mockOn = vi.fn(
  (
    _event: string,
    _config: { event: string; schema: string; table: string; filter: string },
    _callback: () => void,
  ) => ({
    subscribe: mockSubscribe,
  }),
)
const mockChannel = vi.fn(() => ({
  on: mockOn,
}))
const mockRemoveChannel = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  })),
}))

describe('useProductPurchaseCount', () => {
  it('returns initial count', () => {
    const { result } = renderHook(() => useProductPurchaseCount('product-1', 10))
    expect(result.current).toBe(10)
  })

  // The client is imported inside the effect (C183), so every assertion on
  // the subscription waits for that import to resolve.
  it('subscribes to order_items channel for the product', async () => {
    renderHook(() => useProductPurchaseCount('product-1', 5))

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled())
    expect(mockChannel).toHaveBeenCalledWith('product-purchases:product-1')
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'order_items',
        filter: 'product_id=eq.product-1',
      },
      expect.any(Function),
    )
    expect(mockSubscribe).toHaveBeenCalled()
  })

  it('increments count on INSERT event', async () => {
    let insertCallback: (() => void) | undefined

    mockOn.mockImplementationOnce(
      (
        _event: string,
        _config: {
          event: string
          schema: string
          table: string
          filter: string
        },
        callback: () => void,
      ) => {
        insertCallback = callback
        return { subscribe: mockSubscribe }
      },
    )

    const { result } = renderHook(() => useProductPurchaseCount('product-1', 5))

    expect(result.current).toBe(5)

    await waitFor(() => expect(insertCallback).toBeDefined())
    act(() => insertCallback?.())
    expect(result.current).toBe(6)
  })

  it('cleans up subscription on unmount', async () => {
    mockSubscribe.mockClear()
    const { unmount } = renderHook(() => useProductPurchaseCount('product-1', 5))

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled())
    unmount()

    // Verify removeChannel was called (the channel instance is created internally)
    expect(mockRemoveChannel).toHaveBeenCalled()
  })
})
