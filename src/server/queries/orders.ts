import {
  moneyColumnProbe,
  orderMoneySelect,
  readOrderMoney,
  resolveOrderGeneration,
} from '@/lib/commerce/order-money-columns'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  SETTLEMENT_STATES,
  type SettlementState,
  deriveOrderStatus,
} from '@/server/domain/orders/state-machine'
import QRCode from 'qrcode'

export interface OrderSummary {
  id: string
  status: string
  settlementStatus: SettlementState
  createdAt: string
  paidAt: string | null
  totalIls: number
  itemCount: number
  hasVouchers: boolean
}

export interface OrderVoucher {
  code: string
  status: string
  expiresAt: string | null
  collectAmountIls: number | null
  faceValueIls: number | null
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
  unitPriceIls: number
  totalIls: number
  paidOnSiteIls: number
  balanceDueIls: number
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
  subtotalIls: number
  totalIls: number
  walletAppliedIls: number
  addressId: string | null
  lines: OrderLine[]
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
  const { data: rows } = await admin
    .from('orders')
    .select(
      `id, status, created_at, paid_at, ${orderMoneySelect(generation)}, order_items(quantity, product_type, settlement_status)`,
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

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
      totalIls: readOrderMoney(generation, order).totalAgorot / 100,
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
  const { data: orderRow } = await admin
    .from('orders')
    .select(`id, user_id, status, created_at, paid_at, ${orderMoneySelect(generation)}, address_id`)
    .eq('id', orderId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
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

  const { data: items } = await admin
    .from('order_items')
    .select(
      'id, product_id, product_type, supplier_id, quantity, unit_price_agorot, total_price_agorot, paid_on_site_agorot, balance_due_agorot, settlement_status, item_status',
    )
    .eq('order_id', order.id)

  const productIds = [
    ...new Set((items ?? []).map((i) => i.product_id).filter((v): v is string => Boolean(v))),
  ]
  const supplierIds = [
    ...new Set((items ?? []).map((i) => i.supplier_id).filter((v): v is string => Boolean(v))),
  ]
  const itemIds = (items ?? []).map((i) => i.id)

  const [{ data: products }, { data: suppliers }, { data: coupons }] = await Promise.all([
    productIds.length > 0
      ? admin.from('products').select('id, name_he, slug, images').in('id', productIds)
      : Promise.resolve({
          data: [] as { id: string; name_he: string; slug: string | null; images: unknown }[],
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
        }),
  ])

  const productMap = new Map((products ?? []).map((p) => [p.id, p]))
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s]))

  const lines: OrderLine[] = []
  for (const item of items ?? []) {
    const product = item.product_id ? productMap.get(item.product_id) : undefined
    const supplier = item.supplier_id ? supplierMap.get(item.supplier_id) : undefined
    const itemCoupons = (coupons ?? []).filter((c) => c.order_item_id === item.id)

    const vouchers: OrderVoucher[] = []
    for (const coupon of itemCoupons) {
      let qrDataUrl: string | null = null
      if (coupon.qr_payload) {
        try {
          qrDataUrl = await QRCode.toDataURL(coupon.qr_payload, { margin: 1, width: 240 })
        } catch {
          // A QR that will not render must not take the order page down; the
          // short code below it is enough to redeem at a counter.
          qrDataUrl = null
        }
      }
      vouchers.push({
        code: coupon.code,
        status: coupon.status,
        expiresAt: coupon.expires_at,
        collectAmountIls:
          coupon.remaining_amount_due_agorot === null
            ? null
            : coupon.remaining_amount_due_agorot / 100,
        faceValueIls: coupon.face_value_agorot === null ? null : coupon.face_value_agorot / 100,
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
      unitPriceIls: (item.unit_price_agorot ?? 0) / 100,
      totalIls: (item.total_price_agorot ?? 0) / 100,
      paidOnSiteIls: (item.paid_on_site_agorot ?? 0) / 100,
      balanceDueIls: (item.balance_due_agorot ?? 0) / 100,
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
    subtotalIls: money.subtotalAgorot / 100,
    totalIls: money.totalAgorot / 100,
    walletAppliedIls: money.walletAppliedAgorot / 100,
    addressId: order.address_id,
    lines,
  }
}
