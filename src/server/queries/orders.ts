import { orFail } from '@/lib/catalogue-read'
import {
  moneyColumnProbe,
  orderMoneySelect,
  readOrderMoney,
  resolveOrderGeneration,
} from '@/lib/commerce/order-money-columns'
import { type Agorot, agorot } from '@/lib/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { voucherQrDataUrl } from '@/lib/vouchers/qr-image'
import {
  SETTLEMENT_STATES,
  type SettlementState,
  deriveOrderStatus,
} from '@/server/domain/orders/state-machine'

export interface OrderSummary {
  id: string
  status: string
  settlementStatus: SettlementState
  createdAt: string
  paidAt: string | null
  /** Paid-on-site total in integer agorot. */
  totalAgorot: Agorot
  itemCount: number
  hasVouchers: boolean
}

export interface OrderVoucher {
  code: string
  status: string
  expiresAt: string | null
  /** Still to collect at the counter, integer agorot. */
  collectAmountAgorot: Agorot | null
  faceValueAgorot: Agorot | null
  qrDataUrl: string | null
  usedAt: string | null
}

export interface OrderLineSupplier {
  id: string
  name: string
  address: string | null
  city: string | null
  phone: string | null
}

export interface OrderLine {
  id: string
  productId: string | null
  productName: string
  productSlug: string | null
  productImage: string | null
  productType: 'coupon' | 'physical'
  quantity: number
  unitPriceAgorot: Agorot
  totalAgorot: Agorot
  paidOnSiteAgorot: Agorot
  balanceDueAgorot: Agorot
  settlementStatus: SettlementState
  itemStatus: string
  supplier: OrderLineSupplier | null
  vouchers: OrderVoucher[]
}

export interface OrderDetail {
  id: string
  status: string
  settlementStatus: SettlementState
  createdAt: string
  paidAt: string | null
  subtotalAgorot: Agorot
  totalAgorot: Agorot
  walletAppliedAgorot: Agorot
  addressId: string | null
  lines: OrderLine[]
  /**
   * The issued tax document, or null while it is still queued.
   *
   * Read through the service client, like everything else on this page, and not
   * because it is convenient: `invoices` has RLS on with zero policies (107),
   * so a request-bound client gets `200 []` rather than an error - the exact
   * silent-empty failure [54] measured on `settlement_events`. The ownership
   * check is the `user_id` filter on the order above, which has already run.
   */
  invoice: OrderInvoice | null
}

export interface OrderInvoice {
  documentNumber: string | null
  issuedAt: string | null
}

function asSettlementState(value: string | null | undefined): SettlementState {
  // Rows written before the escrow model was removed can still carry
  // escrow_held / escrow_released / platform_settled. All three meant "the
  // money question for this line is closed", which is split_executed now.
  const legacy: Record<string, SettlementState> = {
    escrow_held: 'split_executed',
    escrow_released: 'split_executed',
    platform_settled: 'split_executed',
  }
  const mapped = legacy[value ?? '']
  if (mapped) return mapped
  return SETTLEMENT_STATES.includes(value as SettlementState)
    ? (value as SettlementState)
    : 'pending'
}

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

/** Customer order history, newest first. */
export async function getMyOrders(): Promise<OrderSummary[]> {
  const userId = await requireUserId()
  if (!userId) return []

  const admin = createAdminClient()
  // Which money columns exist is resolved rather than named. Getting it wrong
  // takes the WHOLE select down with 42703, `orders` comes back null, and every
  // customer's order list renders as "you have no orders" instead of as an
  // error. It has been wrong in both directions; see order-money-columns.ts.
  const generation = await resolveOrderGeneration(moneyColumnProbe(admin as never))
  // The select string is built at runtime, so the client cannot infer the row
  // shape from it. The cast is confined to this one read.
  // `orFail`, not `const { data }`. The comment above names the failure and the
  // code used to fall straight into it: the probe fixes the COLUMN NAME cause
  // of a null `rows`, and does nothing about a timeout, a dropped connection or
  // a policy change, each of which renders the same "you have no orders" to a
  // customer who has paid, with nothing in any log.
  const rows = orFail(
    await admin
      .from('orders')
      .select(
        `id, status, created_at, paid_at, ${orderMoneySelect(generation)}, order_items(quantity, product_type, settlement_status)`,
      )
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    'orders.list_read_failed',
    { userId },
  )

  type OrderListRow = Record<string, unknown> & {
    id: string
    status: OrderSummary['status']
    created_at: string
    paid_at: string | null
    order_items:
      | { quantity: number | null; product_type: string; settlement_status: string }[]
      | null
  }
  const orders = rows as unknown as OrderListRow[] | null

  return (orders ?? []).map((order) => {
    const items = order.order_items ?? []
    return {
      id: order.id,
      status: order.status,
      settlementStatus: deriveOrderStatus(items.map((i) => asSettlementState(i.settlement_status))),
      createdAt: order.created_at,
      paidAt: order.paid_at,
      totalAgorot: agorot(readOrderMoney(generation, order).totalAgorot),
      itemCount: items.reduce((sum, i) => sum + (i.quantity ?? 0), 0),
      hasVouchers: items.some((i) => i.product_type === 'coupon'),
    }
  })
}

/** Full order detail incl. voucher codes (with QR) and supplier per line. */
export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const userId = await requireUserId()
  if (!userId) return null

  const admin = createAdminClient()
  const generation = await resolveOrderGeneration(moneyColumnProbe(admin as never))
  const orderRow = orFail(
    await admin
      .from('orders')
      .select(
        `id, user_id, status, created_at, paid_at, ${orderMoneySelect(generation)}, address_id`,
      )
      .eq('id', orderId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle(),
    'orders.detail_read_failed',
    { orderId, userId },
  )
  const order = orderRow as unknown as
    | (Record<string, unknown> & {
        id: string
        status: OrderDetail['status']
        created_at: string
        paid_at: string | null
        address_id: string | null
      })
    | null
  if (!order) return null
  const money = readOrderMoney(generation, order)

  // The worst of the three to discard: the order row carries the total, so a
  // failed items read rendered a complete-looking order with NO lines in it.
  const items = orFail(
    await admin
      .from('order_items')
      .select(
        'id, product_id, product_type, supplier_id, quantity, unit_price_agorot, total_price_agorot, paid_on_site_agorot, balance_due_agorot, settlement_status, item_status',
      )
      .eq('order_id', order.id),
    'orders.items_read_failed',
    { orderId: order.id },
  )

  const productIds = [
    ...new Set((items ?? []).map((i) => i.product_id).filter((v): v is string => Boolean(v))),
  ]
  const supplierIds = [
    ...new Set((items ?? []).map((i) => i.supplier_id).filter((v): v is string => Boolean(v))),
  ]
  const itemIds = (items ?? []).map((i) => i.id)

  const [productsResult, suppliersResult, couponsResult] = await Promise.all([
    productIds.length > 0
      ? admin.from('products').select('id, name_he, slug, images').in('id', productIds)
      : Promise.resolve({
          data: [] as { id: string; name_he: string; slug: string | null; images: unknown }[],
          error: null,
        }),
    supplierIds.length > 0
      ? admin
          .from('suppliers')
          .select('id, name, address, city, contact_phone')
          .in('id', supplierIds)
      : Promise.resolve({
          data: [] as {
            id: string
            name: string
            address: string | null
            city: string | null
            contact_phone: string | null
          }[],
          error: null,
        }),
    // `vouchers`, not `coupon_codes`. The latter is the pre-voucher instance
    // table and nothing has written it since finalize.ts moved to issueVoucher,
    // so an order detail page showed no coupon for any coupon actually bought.
    itemIds.length > 0
      ? admin
          .from('vouchers')
          .select(
            'code, status, expires_at, remaining_amount_due_agorot, face_value_agorot, qr_payload, redeemed_at, order_item_id',
          )
          .in('order_item_id', itemIds)
          .order('issued_at', { ascending: true })
      : Promise.resolve({
          data: [] as {
            code: string
            status: string
            expires_at: string | null
            remaining_amount_due_agorot: number | null
            face_value_agorot: number | null
            qr_payload: string | null
            redeemed_at: string | null
            order_item_id: string | null
          }[],
          error: null,
        }),
  ])

  const products = orFail(productsResult, 'orders.detail_products_read_failed', { orderId })
  const suppliers = orFail(suppliersResult, 'orders.detail_suppliers_read_failed', { orderId })
  // The one whose absence is indistinguishable from "this coupon was never
  // issued". It is the page the customer opens AT THE COUNTER, and a discarded
  // error rendered a coupon line with no code and no QR on an order that had
  // been paid for - the same defect the /scan lookup carried, through a
  // different door.
  const coupons = orFail(couponsResult, 'orders.detail_vouchers_read_failed', { orderId })

  const productMap = new Map((products ?? []).map((p) => [p.id, p]))
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s]))

  const lines: OrderLine[] = []
  for (const item of items ?? []) {
    const product = item.product_id ? productMap.get(item.product_id) : undefined
    const supplier = item.supplier_id ? supplierMap.get(item.supplier_id) : undefined
    const itemCoupons = (coupons ?? []).filter((c) => c.order_item_id === item.id)

    const vouchers: OrderVoucher[] = []
    for (const coupon of itemCoupons) {
      // A QR that will not render must not take the order page down; the short
      // code below it is enough to redeem at a counter.
      const qrDataUrl = await voucherQrDataUrl(coupon.qr_payload, { width: 240 })
      vouchers.push({
        code: coupon.code,
        status: coupon.status,
        expiresAt: coupon.expires_at,
        collectAmountAgorot:
          coupon.remaining_amount_due_agorot === null
            ? null
            : agorot(coupon.remaining_amount_due_agorot),
        faceValueAgorot:
          coupon.face_value_agorot === null ? null : agorot(coupon.face_value_agorot),
        qrDataUrl,
        usedAt: coupon.redeemed_at,
      })
    }

    const images = product?.images
    const firstImage =
      Array.isArray(images) && typeof images[0] === 'string' ? (images[0] as string) : null

    lines.push({
      id: item.id,
      productId: item.product_id,
      productName: product?.name_he ?? 'מוצר',
      productSlug: product?.slug ?? null,
      productImage: firstImage,
      productType: item.product_type === 'coupon' ? 'coupon' : 'physical',
      quantity: item.quantity,
      // Integer agorot is the only money unit in the database since 059; the
      // shekel columns it renamed away are not read anywhere.
      unitPriceAgorot: agorot(item.unit_price_agorot ?? 0),
      totalAgorot: agorot(item.total_price_agorot ?? 0),
      paidOnSiteAgorot: agorot(item.paid_on_site_agorot ?? 0),
      balanceDueAgorot: agorot(item.balance_due_agorot ?? 0),
      settlementStatus: asSettlementState(item.settlement_status),
      itemStatus: item.item_status,
      supplier: supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            address: supplier.address,
            city: supplier.city,
            phone: supplier.contact_phone,
          }
        : null,
      vouchers,
    })
  }

  return {
    id: order.id,
    status: order.status,
    settlementStatus: deriveOrderStatus(lines.map((l) => l.settlementStatus)),
    createdAt: order.created_at,
    paidAt: order.paid_at,
    subtotalAgorot: agorot(money.subtotalAgorot),
    totalAgorot: agorot(money.totalAgorot),
    walletAppliedAgorot: agorot(money.walletAppliedAgorot),
    addressId: order.address_id,
    lines,
    invoice: await getOrderInvoiceSummary(admin, order.id),
  }
}

/**
 * The order's issued invoice, or null.
 *
 * The URL is deliberately NOT returned to the page. It points at the provider
 * (or at the R2 mirror), and handing it to the browser makes a tax document
 * readable by anyone who ever sees the link. The page links to
 * `/account/orders/<id>/invoice`, which re-checks ownership per request and
 * then redirects.
 */
async function getOrderInvoiceSummary(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<OrderInvoice | null> {
  const { data, error } = await admin
    .from('invoices')
    .select('document_number, issued_at')
    .eq('order_id', orderId)
    // Both sale documents, never the credit note: a refund has its own number
    // and must not be shown as the order's receipt. Filtering on
    // `tax_invoice_receipt` alone, as this did before 116, hid the document for
    // every coupon-only order - which is most of them.
    .in('document_type', ['tax_invoice_receipt', 'coupon_receipt'])
    .eq('status', 'issued')
    .maybeSingle()
  // A database without 107 has no invoices and no invoice link, which is what
  // this page did before the feature existed. THE ONE READ IN THIS FILE THAT
  // KEEPS SWALLOWING, deliberately: the error it is written for is 42P01 on a
  // table that does not exist yet, and an order page that 500s because the
  // invoice feature is unapplied would be a worse answer than no link.
  if (error || !data) return null
  const row = data as unknown as { document_number: string | null; issued_at: string | null }
  return { documentNumber: row.document_number, issuedAt: row.issued_at }
}
