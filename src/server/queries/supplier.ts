import { parseIls } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type SupplierRedemptionRow,
  type SupplierSaleLine,
  supplierDueAgorot,
} from '@/lib/supplier/dashboard'
import { type SupplierOrderLine, lineFrom } from '@/lib/supplier/orders'
import type { SupplierProductRow } from '@/lib/supplier/products'

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
    // The admin client bypasses RLS, so the soft-delete predicate that
    // `order_items`' SELECT policy would have applied has to be stated here.
    // getSupplierProducts already does this; this read did not, and a
    // soft-deleted line is a line an admin removed from the money path.
    .is('deleted_at', null)
    .not('orders.paid_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    log.error('supplier.sales_query_failed', { reason: error.message })
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
      // The immediate split ONLY. This used to be `immediate + held`, which is
      // the escrow model Ofir reversed on 2026-07-28 and migration 085 removed
      // from the database: a coupon's whole prepayment is the platform's at the
      // moment of payment, the supplier receives nothing from us on it, and
      // there is no hold to release. Adding `held` told a supplier they were
      // owed money that was never going to arrive.
      //
      // It is delegated rather than reimplemented because it WAS reimplemented,
      // and the two copies disagreed: `lib/supplier/dashboard.ts` has ignored
      // the escrow columns since 085 and its aggregate is what the portal
      // actually prints, so this field was a shadowed second answer waiting for
      // the first caller to read it. Measured against production: two legacy
      // escrow_holds rows are still `held`, both against coupon codes, so this
      // was not hypothetical.
      supplierDueAgorot: supplierDueAgorot({ supplierImmediateAgorot: immediate }),
      settlementStatus: row.settlement_status,
      paidAt: row.orders?.paid_at ?? null,
    }
  })
}

type SupplierOrderItemRow = {
  id: string
  order_id: string
  quantity: number
  product_type: string | null
  item_status: string | null
  settlement_status: string | null
  platform_percent: number | null
  face_value_agorot: number | null
  commission_agorot: number | null
  supplier_immediate_agorot: number | null
  balance_due_agorot: number | null
  products: { name_he: string | null; type: string | null } | null
  orders: { id: string; status: string | null; paid_at: string | null } | null
}

/**
 * The supplier's physical order queue, grouped into orders.
 *
 * VISIBLE ORDERS are paid ones only, matching the `orders` SELECT policy in
 * ARCHITECTURE-SUPPLIER-PORTAL.md section 3.2: `paid`, `partially_fulfilled`,
 * `fulfilled`. Cancelled and refunded orders are money disputes, and v1 keeps
 * them out of the queue rather than showing a shop a package it must not send.
 * Individual lines cancelled inside a still-live order do come through, because
 * the rest of that order is still work.
 *
 * TENANT SCOPE is `supplier_id`, which is this schema's tenant key -- there is
 * no `tenant_id` column anywhere in it. The id is not a parameter a caller may
 * invent: every call site takes it from `requireSupplierMember`, which reads an
 * active `supplier_members` row for `auth.uid()`. The `.eq('supplier_id', ...)`
 * below is the second of the two locks, and it is not redundant: this runs on
 * the admin client, which bypasses RLS outright, so it is the only lock that is
 * actually holding here.
 */
export async function getSupplierOrders(supplierId: string): Promise<{
  lines: SupplierOrderLine[]
  meta: Map<string, { orderStatus: string; paidAt: string | null }>
}> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('order_items')
    .select(
      `
      id,
      order_id,
      quantity,
      product_type,
      item_status,
      settlement_status,
      platform_percent,
      face_value_agorot,
      commission_agorot,
      supplier_immediate_agorot,
      balance_due_agorot,
      products(name_he, type),
      orders!inner(id, status, paid_at)
    `,
    )
    .eq('supplier_id', supplierId)
    .is('deleted_at', null)
    .in('orders.status', ['paid', 'partially_fulfilled', 'fulfilled'])
    .not('orders.paid_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) {
    log.error('supplier.orders_query_failed', { reason: error.message })
    return { lines: [], meta: new Map() }
  }

  const rows = (data ?? []) as unknown as SupplierOrderItemRow[]
  const meta = new Map<string, { orderStatus: string; paidAt: string | null }>()
  const lines = rows.map((row) => {
    if (row.orders && !meta.has(row.order_id)) {
      meta.set(row.order_id, {
        orderStatus: row.orders.status ?? 'paid',
        paidAt: row.orders.paid_at ?? null,
      })
    }

    return lineFrom({
      orderItemId: row.id,
      orderId: row.order_id,
      productName: row.products?.name_he ?? 'מוצר',
      // `order_items.product_type` is the snapshot; `products.type` is what the
      // catalogue says today. Section 0.3 says past lines keep their snapshot,
      // so the live join is a fallback for pre-snapshot rows and never an
      // override.
      productType: productType(row.product_type ?? row.products?.type),
      quantity: row.quantity,
      itemStatus: row.item_status ?? 'pending',
      settlementStatus: row.settlement_status,
      platformPercent: row.platform_percent,
      faceValueAgorot: row.face_value_agorot,
      commissionAgorot: row.commission_agorot,
      supplierImmediateAgorot: row.supplier_immediate_agorot,
      balanceDueAgorot: row.balance_due_agorot,
    })
  })

  return { lines, meta }
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
    log.error('supplier.redemptions_query_failed', { reason: error.message })
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

type SupplierProductDbRow = {
  id: string
  slug: string
  name_he: string
  type: string | null
  status: string
  approval_status: string
  full_price: number | null
  kenyon_price: number | null
  coupon_price_ils: number | null
  platform_percent: number | null
  images: unknown
}

/**
 * The supplier's own catalogue.
 *
 * Prices on `products` are still numeric shekels in production -- the agorot
 * rename lives in 142_money_integer_fix_in_place.sql and has not been applied -- so
 * they are converted at this boundary with `parseIls` and nothing downstream
 * ever sees a float. When that migration lands, this function is the single
 * place that changes.
 *
 * Face value differs by kind: a coupon is worth `full_price` and sells for
 * `coupon_price_ils`; a physical item is worth what it sells for, preferring
 * `kenyon_price` over `full_price` because that is the number the storefront
 * charges.
 *
 * Soft-deleted rows are excluded here explicitly rather than trusted to RLS:
 * this read goes through the admin client, which bypasses RLS entirely.
 */
export async function getSupplierProducts(supplierId: string): Promise<SupplierProductRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('products')
    .select(
      `
      id,
      slug,
      name_he,
      type,
      status,
      approval_status,
      full_price,
      kenyon_price,
      coupon_price_ils,
      platform_percent,
      images
    `,
    )
    .eq('supplier_id', supplierId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    log.error('supplier.products_query_failed', { reason: error.message })
    return []
  }

  return ((data ?? []) as unknown as SupplierProductDbRow[]).map((row) => {
    const kind = productType(row.type)
    const faceIls = kind === 'coupon' ? row.full_price : (row.kenyon_price ?? row.full_price)

    return {
      id: row.id,
      slug: row.slug,
      nameHe: row.name_he,
      type: kind,
      status: row.status,
      approvalStatus: row.approval_status,
      faceValueAgorot: parseIls(faceIls ?? 0),
      couponPriceAgorot: kind === 'coupon' ? parseIls(row.coupon_price_ils ?? 0) : null,
      platformPercent: row.platform_percent,
      imageUrl:
        Array.isArray(row.images) && typeof row.images[0] === 'string' ? row.images[0] : null,
    }
  })
}
