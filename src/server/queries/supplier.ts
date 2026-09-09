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

/**
 * =============================================================================
 * WHY THESE READS PAGE, AND WHY THEY REPORT WHEN THEY COULD NOT FINISH
 * =============================================================================
 *
 * Every money figure a supplier sees is a FOLD OVER THE ROWS THESE FUNCTIONS
 * RETURN. `aggregateDashboard`, `summarizeSettlement`, `sumPayoutBreakdown` and
 * the payouts CSV all sum an array; none of them issues its own query. So the
 * `.limit()` on the read was not a display cap, it was the horizon of every
 * total below it:
 *
 *   getSupplierSales   limit(200) -> supplierDueAgorot, the RECEIVABLE the
 *                                   payouts page labels "מגיע לספק", stops
 *                                   growing at the 200th order line
 *   getSupplierRedemptions limit(100) -> couponRedemptionsTotal, labelled
 *                                   "סריקות מוצלחות", is pinned at 100 forever,
 *                                   and tillCollectedAgorot with it
 *
 * This is the same defect SECTIONS 25 found in the review rating average: an
 * aggregate computed over a truncated read keeps the shape of a real number,
 * carries no sign that it is partial, and is wrong in the direction nobody
 * checks. A supplier reading a receivable that silently stopped growing has no
 * way to notice.
 *
 * MEASURED, NOT ASSUMED: production today holds 0 vouchers and 3 order_items
 * across 12 suppliers, so neither cap is biting yet. This is a horizon, not an
 * active misreport, and it is fixed now because the monthly chart and the
 * redemption CSV added in this section would have inherited it silently.
 *
 * THE CEILING IS REPORTED RATHER THAN SILENT. Paging without a bound is a way
 * to hold a request open forever, so there is still a maximum -- but when it is
 * reached the caller is TOLD, and the pages render a banner instead of printing
 * a total that looks whole. A read that measures and does not say it was cut
 * short is exactly what is being removed here; replacing one silent cap with a
 * larger silent cap would be the same bug with a bigger number.
 */
const PAGE_SIZE = 1000
const READ_CEILING = 10_000

/**
 * PostgREST's schema-cache miss, and Postgres' undefined_table.
 *
 * `225_supplier_contact_requests.sql` is in `migrations/pending/` and is not
 * applied, so the contact-request read below must treat "the table is not there"
 * as an empty list rather than as an error worth logging on every page view.
 */
const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])

/** Rows plus the two facts a total needs before it can be printed as one. */
export type SupplierRead<Row> = {
  rows: Row[]
  /** The ceiling was reached; more rows may exist and are not in `rows`. */
  truncated: boolean
  /** The query errored. `rows` is empty because nothing was read, NOT because nothing exists. */
  failed: boolean
}

type PageResult = { data: unknown[] | null; error: { message: string } | null }

/**
 * Read every page up to READ_CEILING.
 *
 * `truncated` is set when the ceiling is consumed exactly, which over-reports by
 * one case: a supplier with precisely READ_CEILING rows is told there may be
 * more when there are not. That direction is deliberate. The alternative is a
 * probe read past the ceiling to disambiguate, and being wrongly warned that a
 * total may be incomplete costs a sentence, while wrongly being told it is
 * complete costs the thing this whole comment exists to prevent.
 */
async function readAllPages<Row>(
  page: (from: number, to: number) => PromiseLike<PageResult>,
  onError: (message: string) => void,
): Promise<SupplierRead<Row>> {
  const rows: Row[] = []

  for (let from = 0; from < READ_CEILING; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, READ_CEILING) - 1
    const { data, error } = await page(from, to)
    if (error) {
      onError(error.message)
      // A read that failed is not a supplier with no sales. The caller gets
      // `failed` so it can say so, rather than rendering ₪0 with confidence.
      return { rows: [], truncated: false, failed: true }
    }
    const batch = (data ?? []) as Row[]
    rows.push(...batch)
    if (batch.length < to - from + 1) return { rows, truncated: false, failed: false }
  }

  return { rows, truncated: true, failed: false }
}

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

export async function getSupplierSales(
  supplierId: string,
): Promise<SupplierRead<SupplierSaleLine>> {
  const admin = createAdminClient()
  const read = await readAllPages<OrderItemRow>(
    (from, to) =>
      admin
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
        // `created_at` is not unique, and a paged read ordered by a non-unique
        // key can return the same row on two pages and skip another. `id` is
        // the tiebreaker that makes the page boundaries stable.
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to) as unknown as PromiseLike<PageResult>,
    (reason) => log.error('supplier.sales_query_failed', { reason }),
  )

  const rows = read.rows.map((row) => {
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
      // The status goes in because a refunded line is due nothing: the share
      // was clawed back in the journal and `supplier_immediate_agorot` is the
      // purchase-time snapshot, not a live receivable.
      supplierDueAgorot: supplierDueAgorot({
        supplierImmediateAgorot: immediate,
        settlementStatus: row.settlement_status,
      }),
      settlementStatus: row.settlement_status,
      paidAt: row.orders?.paid_at ?? null,
    }
  })

  return { rows, truncated: read.truncated, failed: read.failed }
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

export async function getSupplierRedemptions(
  supplierId: string,
): Promise<SupplierRead<SupplierRedemptionRow>> {
  const admin = createAdminClient()
  const read = await readAllPages<VoucherRow>(
    (from, to) =>
      admin
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
        // NULLS LAST is not cosmetic on a paged read. Postgres sorts NULLs
        // FIRST in a DESC order, so a redeemed voucher whose `redeemed_at`
        // never got written would sit at the head of page one -- ahead of every
        // real scan -- and on the old capped read it consumed the limit that
        // the recent redemptions were supposed to occupy. Production has no
        // such row today (checked: 0 redeemed vouchers with a null
        // `redeemed_at`), which is exactly why the ordering should be pinned
        // now rather than discovered later.
        .order('redeemed_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .range(from, to) as unknown as PromiseLike<PageResult>,
    (reason) => log.error('supplier.redemptions_query_failed', { reason }),
  )

  return {
    rows: read.rows.map((row) => ({
      voucherId: row.id,
      code: row.code,
      productName: row.products?.name_he ?? 'קופון',
      customerName: null,
      remainingAmountDueAgorot: row.remaining_amount_due_agorot,
      couponPriceAgorot: row.coupon_price_agorot,
      platformPercent: row.platform_percent,
      redeemedAt: row.redeemed_at,
      status: row.status,
    })),
    truncated: read.truncated,
    failed: read.failed,
  }
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

export type SupplierContactRequestRow = {
  id: string
  field: string
  currentValue: string | null
  requestedValue: string
  note: string | null
  status: string
  createdAt: string | null
  decidedAt: string | null
  decisionNote: string | null
}

/**
 * The shop's own contact-change requests, newest first.
 *
 * 225 IS PENDING, so this returns an empty list rather than throwing when the
 * table is not there. The settings page renders its form either way: a supplier
 * cannot file a request until the migration lands (the action says so in
 * Hebrew), and a history section that 500s the whole page because the table is
 * absent would take the form down with it.
 *
 * The `.eq('supplier_id', supplierId)` is the same lock every read above uses.
 * It is not redundant with 225's SELECT policy for the reason this module's
 * header gives: this is the admin client, and the policy is not holding here.
 */
export async function getSupplierContactRequests(
  supplierId: string,
): Promise<SupplierContactRequestRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_contact_requests' as never)
    .select(
      'id, field, current_value, requested_value, note, status, created_at, decided_at, decision_note',
    )
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    // Not applied yet is not a failure worth logging on every page view.
    if (!TABLE_ABSENT.has(error.code ?? '')) {
      log.error('supplier.contact_requests_query_failed', { reason: error.message })
    }
    return []
  }

  type Row = {
    id: string
    field: string
    current_value: string | null
    requested_value: string
    note: string | null
    status: string
    created_at: string | null
    decided_at: string | null
    decision_note: string | null
  }

  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    field: row.field,
    currentValue: row.current_value,
    requestedValue: row.requested_value,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
  }))
}
