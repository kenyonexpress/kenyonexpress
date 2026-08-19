import { parseIls } from '@/lib/money'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type SupplierRedemptionRow,
  type SupplierSaleLine,
  supplierDueAgorot,
} from '@/lib/supplier/dashboard'
import type { SupplierProductRow } from '@/lib/supplier/products'
import {
  VOUCHER_STATUS_LABEL,
  type VoucherDisplayStatus,
  voucherDisplayStatus,
} from '@/lib/supplier/voucher-status'

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
  user_id?: string | null
}

type SupplierVoucherDbRow = VoucherRow & {
  issued_at: string | null
  expires_at: string | null
}

/** One voucher of this supplier's, in the read-only portal list. */
export type SupplierVoucherListRow = {
  voucherId: string
  code: string
  productName: string
  customerName: string | null
  status: VoucherDisplayStatus
  statusLabel: string
  couponPriceAgorot: number
  remainingAmountDueAgorot: number
  issuedAt: string | null
  expiresAt: string | null
  redeemedAt: string | null
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

/**
 * Customer display names for a set of voucher owners.
 *
 * A separate round trip rather than a PostgREST embed, because there is no FK
 * to embed along: `vouchers.user_id` references `auth.users`, not
 * `public.profiles`. Asking for `profiles(full_name)` inside the voucher select
 * does not merely return nulls, it fails the whole query, which would empty the
 * supplier's list rather than drop a name from it. `profiles.id` IS the auth
 * user id, which is the join every helper in this schema already relies on
 * (is_admin() reads `profiles WHERE id = auth.uid()`), so the two-step lookup
 * is exact.
 *
 * A failure here costs names and nothing else; the caller still lists vouchers.
 */
async function customerNames(
  // biome-ignore lint/suspicious/noExplicitAny: Supabase's generics recurse deep enough to slow the typecheck for no gain here.
  admin: any,
  userIds: Array<string | null>,
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()

  const { data, error } = await admin.from('profiles').select('id, full_name').in('id', ids)

  if (error) {
    log.warn('supplier.customer_names_failed', { reason: error.message })
    return new Map()
  }

  const out = new Map<string, string>()
  for (const row of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
    if (row.full_name) out.set(row.id, row.full_name)
  }
  return out
}

/**
 * Every voucher issued against this supplier, whatever its status.
 *
 * `getSupplierRedemptions` answers "what did we scan", filtered to `redeemed`.
 * This answers "what is outstanding", which is the question a business actually
 * has before a customer walks in, and which nothing in the portal could answer.
 *
 * Read-only, and scoped by supplierId on the server. The admin client is used
 * for the same reason the other supplier reads do: membership was already
 * proven by requireSupplierMember, and the explicit supplier_id filter means a
 * missing RLS policy cannot widen the result to another tenant.
 *
 * Status is derived through voucherDisplayStatus, not printed from the column,
 * so an issued-but-expired voucher reads as "פג תוקף" here exactly as
 * redeem_voucher would refuse it at the till.
 */
export async function getSupplierVouchers(
  supplierId: string,
  limit = 200,
): Promise<SupplierVoucherListRow[]> {
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
      issued_at,
      expires_at,
      redeemed_at,
      user_id,
      products(name_he)
    `,
    )
    .eq('supplier_id', supplierId)
    .order('issued_at', { ascending: false })
    .limit(limit)

  if (error) {
    log.error('supplier.vouchers_query_failed', { reason: error.message })
    return []
  }

  const rows = (data ?? []) as unknown as SupplierVoucherDbRow[]
  const names = await customerNames(
    admin,
    rows.map((r) => r.user_id ?? null),
  )

  return rows.map((row) => {
    const status = voucherDisplayStatus({ status: row.status, expiresAt: row.expires_at })
    return {
      voucherId: row.id,
      code: row.code,
      productName: row.products?.name_he ?? 'קופון',
      customerName: names.get(row.user_id ?? '') ?? null,
      status,
      statusLabel: VOUCHER_STATUS_LABEL[status],
      couponPriceAgorot: row.coupon_price_agorot,
      remainingAmountDueAgorot: row.remaining_amount_due_agorot,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      redeemedAt: row.redeemed_at,
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
      user_id,
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

  const rows = (data ?? []) as unknown as VoucherRow[]
  const names = await customerNames(
    admin,
    rows.map((r) => r.user_id ?? null),
  )

  return rows.map((row) => ({
    voucherId: row.id,
    code: row.code,
    productName: row.products?.name_he ?? 'קופון',
    customerName: names.get(row.user_id ?? '') ?? null,
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
 * rename lives in PENDING-money-integer-fix.sql and has not been applied -- so
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
