import { agorot } from '@/lib/money'
import { getOrderDetail } from '@/server/queries/orders'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as cartActions from './cart'
import { reorderFromOrder } from './reorder'

vi.mock('@/server/queries/orders')
vi.mock('./cart')

describe('reorderFromOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns error when order is not found', async () => {
    vi.mocked(getOrderDetail).mockResolvedValue(null)

    const result = await reorderFromOrder('unknown-id')

    expect(result.success).toBe(false)
    expect(result.addedCount).toBe(0)
    expect(result.failedCount).toBe(0)
    expect(result.errors).toContain('ההזמנה לא נמצאה')
  })

  it('adds all order items to cart', async () => {
    vi.mocked(getOrderDetail).mockResolvedValue({
      id: 'order-123',
      status: 'paid',
      settlementStatus: 'split_executed',
      createdAt: '2026-10-15T10:00:00Z',
      paidAt: '2026-10-15T10:05:00Z',
      subtotalAgorot: agorot(50000),
      totalAgorot: agorot(50000),
      walletAppliedAgorot: agorot(0),
      addressId: 'addr-123',
      lines: [
        {
          id: 'line-1',
          productId: 'prod-1',
          productName: 'Product 1',
          productSlug: 'product-1',
          productImage: 'image.jpg',
          productType: 'physical',
          quantity: 2,
          unitPriceAgorot: agorot(10000),
          totalAgorot: agorot(20000),
          paidOnSiteAgorot: agorot(20000),
          balanceDueAgorot: agorot(0),
          settlementStatus: 'split_executed',
          itemStatus: 'delivered',
          supplier: null,
          vouchers: [],
        },
        {
          id: 'line-2',
          productId: 'prod-2',
          productName: 'Product 2',
          productSlug: 'product-2',
          productImage: 'image2.jpg',
          productType: 'physical',
          quantity: 1,
          unitPriceAgorot: agorot(30000),
          totalAgorot: agorot(30000),
          paidOnSiteAgorot: agorot(30000),
          balanceDueAgorot: agorot(0),
          settlementStatus: 'split_executed',
          itemStatus: 'delivered',
          supplier: null,
          vouchers: [],
        },
      ],
      invoice: null,
    })

    vi.mocked(cartActions.addToCart).mockResolvedValue({
      ok: true,
      cart: {} as any,
    })

    const result = await reorderFromOrder('order-123')

    expect(result.success).toBe(true)
    expect(result.addedCount).toBe(2)
    expect(result.failedCount).toBe(0)
    expect(cartActions.addToCart).toHaveBeenCalledWith('prod-1', null, 2)
    expect(cartActions.addToCart).toHaveBeenCalledWith('prod-2', null, 1)
  })

  it('handles missing product IDs gracefully', async () => {
    vi.mocked(getOrderDetail).mockResolvedValue({
      id: 'order-123',
      status: 'paid',
      settlementStatus: 'split_executed',
      createdAt: '2026-10-15T10:00:00Z',
      paidAt: '2026-10-15T10:05:00Z',
      subtotalAgorot: agorot(50000),
      totalAgorot: agorot(50000),
      walletAppliedAgorot: agorot(0),
      addressId: 'addr-123',
      lines: [
        {
          id: 'line-1',
          productId: null,
          productName: 'Deleted Product',
          productSlug: null,
          productImage: null,
          productType: 'physical',
          quantity: 1,
          unitPriceAgorot: agorot(50000),
          totalAgorot: agorot(50000),
          paidOnSiteAgorot: agorot(50000),
          balanceDueAgorot: agorot(0),
          settlementStatus: 'split_executed',
          itemStatus: 'delivered',
          supplier: null,
          vouchers: [],
        },
      ],
      invoice: null,
    })

    const result = await reorderFromOrder('order-123')

    expect(result.success).toBe(false)
    expect(result.addedCount).toBe(0)
    expect(result.failedCount).toBe(1)
    expect(result.errors).toContain('Deleted Product: המוצר אינו זמין')
  })

  it('continues adding items even if one fails', async () => {
    vi.mocked(getOrderDetail).mockResolvedValue({
      id: 'order-123',
      status: 'paid',
      settlementStatus: 'split_executed',
      createdAt: '2026-10-15T10:00:00Z',
      paidAt: '2026-10-15T10:05:00Z',
      subtotalAgorot: agorot(50000),
      totalAgorot: agorot(50000),
      walletAppliedAgorot: agorot(0),
      addressId: 'addr-123',
      lines: [
        {
          id: 'line-1',
          productId: 'prod-1',
          productName: 'Product 1',
          productSlug: 'product-1',
          productImage: 'image.jpg',
          productType: 'physical',
          quantity: 1,
          unitPriceAgorot: agorot(25000),
          totalAgorot: agorot(25000),
          paidOnSiteAgorot: agorot(25000),
          balanceDueAgorot: agorot(0),
          settlementStatus: 'split_executed',
          itemStatus: 'delivered',
          supplier: null,
          vouchers: [],
        },
        {
          id: 'line-2',
          productId: null,
          productName: 'Deleted Product',
          productSlug: null,
          productImage: null,
          productType: 'physical',
          quantity: 1,
          unitPriceAgorot: agorot(25000),
          totalAgorot: agorot(25000),
          paidOnSiteAgorot: agorot(25000),
          balanceDueAgorot: agorot(0),
          settlementStatus: 'split_executed',
          itemStatus: 'delivered',
          supplier: null,
          vouchers: [],
        },
      ],
      invoice: null,
    })

    vi.mocked(cartActions.addToCart).mockResolvedValue({
      ok: true,
      cart: {} as any,
    })

    const result = await reorderFromOrder('order-123')

    expect(result.success).toBe(true)
    expect(result.addedCount).toBe(1)
    expect(result.failedCount).toBe(1)
    expect(cartActions.addToCart).toHaveBeenCalledWith('prod-1', null, 1)
  })

  it('limits error messages to 3', async () => {
    vi.mocked(getOrderDetail).mockResolvedValue({
      id: 'order-123',
      status: 'paid',
      settlementStatus: 'split_executed',
      createdAt: '2026-10-15T10:00:00Z',
      paidAt: '2026-10-15T10:05:00Z',
      subtotalAgorot: agorot(0),
      totalAgorot: agorot(0),
      walletAppliedAgorot: agorot(0),
      addressId: null,
      lines: Array.from({ length: 5 }, (_, i) => ({
        id: `line-${i}`,
        productId: null,
        productName: `Product ${i}`,
        productSlug: null,
        productImage: null,
        productType: 'physical' as const,
        quantity: 1,
        unitPriceAgorot: agorot(10000),
        totalAgorot: agorot(10000),
        paidOnSiteAgorot: agorot(10000),
        balanceDueAgorot: agorot(0),
        settlementStatus: 'split_executed' as const,
        itemStatus: 'delivered',
        supplier: null,
        vouchers: [],
      })),
      invoice: null,
    })

    const result = await reorderFromOrder('order-123')

    expect(result.errors.length).toBeLessThanOrEqual(3)
  })
})
