import { createAdminClient } from '@/lib/supabase/admin'
import type { SupplierRedemptionRow, SupplierSaleLine } from '@/lib/supplier/dashboard'

/**
 * Supplier-scoped reads. Membership is verified by requireSupplierMember before
 * these run; the admin client filters strictly by that supplierId so a missing
 * RLS policy cannot leak another tenant's rows.
 */

type OrderItemRow = {
  id: string
  order_id: string
  quantity: number
  platform_percent: number | null
  face_value_agorot: number | null
  paid_on_site_agorot: number | null
  commission_agorot: number | null
  supplier_immediate_agorot: number | null
  escrow_held_agorot: number | null
  escrow_release_agorot: number | null
  settlement_status: string | null
  products: { name_he: string | null; type: string | null } | null
  orders: { paid_at: string | null; status: string | null } | null
}

type VoucherRow = {
  id: string
  code: string
  status: string
  remaining_amount_due_agorot: number
  coupon_price_agorot: number
  platform_percent: number
  redeemed_at: string | null
  products: { name_he: string | null } | null
}

function productType(raw: string | null | undefined): SupplierSaleLine['productType'] {
  if (raw === 'coupon' || raw === 'physical') return raw
  return 'other'
}

export async function getSupplierSales(supplierId: string): Promise<SupplierSaleLine[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('order_items')
    .select(
      `
      id,
      order_id,
      quantity,
      platform_percent,
      face_value_agorot,
      paid_on_site_agorot,
      commission_agorot,
      supplier_immediate_agorot,
      escrow_held_agorot,
      escrow_release_agorot,
      settlement_status,
      products(name_he, type),
      orders!inner(paid_at, status)
    `,
    )
    .eq('supplier_id', supplierId)
    .not('orders.paid_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('[supplier] getSupplierSales', error.message)
    return []
  }

  return ((data ?? []) as unknown as OrderItemRow[]).map((row) => {
    const immediate = row.supplier_immediate_agorot ?? 0
    const held = row.escrow_held_agorot ?? 0
    return {
      orderItemId: row.id,
      orderId: row.order_id,
      productName: row.products?.name_he ?? 'מוצר',
      productType: productType(row.products?.type),
      quantity: row.quantity,
      platformPercent: row.platform_percent,
      faceValueAgorot: row.face_value_agorot ?? 0,
      paidOnSiteAgorot: row.paid_on_site_agorot ?? 0,
      platformFeeAgorot: row.commission_agorot ?? 0,
      supplierImmediateAgorot: immediate,
      escrowHeldAgorot: held,
      escrowReleaseAgorot: row.escrow_release_agorot ?? 0,
      supplierDueAgorot: immediate + held,
      settlementStatus: row.settlement_status,
      paidAt: row.orders?.paid_at ?? null,
    }
  })
}

export async function getSupplierRedemptions(supplierId: string): Promise<SupplierRedemptionRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('vouchers')
    .select(
      `
      id,
      code,
      status,
      remaining_amount_due_agorot,
      coupon_price_agorot,
      platform_percent,
      redeemed_at,
      products(name_he)
    `,
    )
    .eq('supplier_id', supplierId)
    .eq('status', 'redeemed')
    .order('redeemed_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[supplier] getSupplierRedemptions', error.message)
    return []
  }

  return ((data ?? []) as unknown as VoucherRow[]).map((row) => ({
    voucherId: row.id,
    code: row.code,
    productName: row.products?.name_he ?? 'קופון',
    customerName: null,
    remainingAmountDueAgorot: row.remaining_amount_due_agorot,
    couponPriceAgorot: row.coupon_price_agorot,
    platformPercent: row.platform_percent,
    redeemedAt: row.redeemed_at,
    status: row.status,
  }))
}
