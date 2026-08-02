import { ilsColumnToAgorot } from '@/lib/account/format'
import { type Agorot, agorot } from '@/lib/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { type SettlementState, deriveOrderStatus } from '@/server/domain/orders/state-machine'
import { isVoucherRedeemable } from '@/server/queries/vouchers'
import QRCode from 'qrcode'

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
  id: string
  code: string
  status: string
  expiresAt: string | null
  paidOnSiteAgorot: Agorot
  remainingDueAgorot: Agorot
  faceValueAgorot: Agorot
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
}

function asSettlementState(value: string | null | undefined): SettlementState {
  const states: readonly string[] = [
    'pending',
    'paid',
    'split_executed',
    'escrow_held',
    'escrow_released',
    'redeemed',
    'refunded',
    'cancelled',
  ]
  return states.includes(value ?? '') ? (value as SettlementState) : 'pending'
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
  const { data: orders } = await admin
    .from('orders')
    .select(
      'id, status, created_at, paid_at, total_ils, order_items(quantity, product_type, settlement_status)',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  return (orders ?? []).map((order) => {
    const items = order.order_items ?? []
    return {
      id: order.id,
      status: order.status,
      settlementStatus: deriveOrderStatus(items.map((i) => asSettlementState(i.settlement_status))),
      createdAt: order.created_at,
      paidAt: order.paid_at,
      totalAgorot: ilsColumnToAgorot(order.total_ils ?? 0),
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
  const { data: order } = await admin
    .from('orders')
    .select(
      'id, user_id, status, created_at, paid_at, subtotal_ils, total_ils, cashback_applied_ils, address_id',
    )
    .eq('id', orderId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!order) return null

  const { data: items } = await admin
    .from('order_items')
    .select(
      'id, product_id, product_type, supplier_id, quantity, unit_price_ils, total_price_ils, paid_on_site_agorot, balance_due_agorot, settlement_status, item_status',
    )
    .eq('order_id', order.id)

  const productIds = [
    ...new Set((items ?? []).map((i) => i.product_id).filter((v): v is string => Boolean(v))),
  ]
  const supplierIds = [
    ...new Set((items ?? []).map((i) => i.supplier_id).filter((v): v is string => Boolean(v))),
  ]
  const itemIds = (items ?? []).map((i) => i.id)

  const [{ data: products }, { data: suppliers }, { data: voucherRows }] = await Promise.all([
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
    itemIds.length > 0
      ? admin
          .from('vouchers')
          .select(
            'id, code, status, expires_at, coupon_price_agorot, remaining_amount_due_agorot, face_value_agorot, qr_payload, redeemed_at, order_item_id',
          )
          .in('order_item_id', itemIds)
      : Promise.resolve({
          data: [] as {
            id: string
            code: string
            status: string
            expires_at: string
            coupon_price_agorot: number
            remaining_amount_due_agorot: number
            face_value_agorot: number
            qr_payload: string
            redeemed_at: string | null
            order_item_id: string
          }[],
        }),
  ])

  const productMap = new Map((products ?? []).map((p) => [p.id, p]))
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s]))

  const lines: OrderLine[] = []
  for (const item of items ?? []) {
    const product = item.product_id ? productMap.get(item.product_id) : undefined
    const supplier = item.supplier_id ? supplierMap.get(item.supplier_id) : undefined
    const itemVouchers = (voucherRows ?? []).filter((v) => v.order_item_id === item.id)

    const vouchers: OrderVoucher[] = []
    for (const voucher of itemVouchers) {
      let qrDataUrl: string | null = null
      const redeemable = isVoucherRedeemable(voucher)
      if (redeemable && voucher.qr_payload) {
        try {
          qrDataUrl = await QRCode.toDataURL(voucher.qr_payload, { margin: 1, width: 240 })
        } catch {
          qrDataUrl = null
        }
      }
      vouchers.push({
        id: voucher.id,
        code: voucher.code,
        status: voucher.status,
        expiresAt: voucher.expires_at,
        paidOnSiteAgorot: agorot(voucher.coupon_price_agorot),
        remainingDueAgorot: agorot(voucher.remaining_amount_due_agorot),
        faceValueAgorot: agorot(voucher.face_value_agorot),
        qrDataUrl,
        usedAt: voucher.redeemed_at,
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
      unitPriceAgorot: ilsColumnToAgorot(item.unit_price_ils ?? 0),
      totalAgorot: ilsColumnToAgorot(item.total_price_ils ?? 0),
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
    subtotalAgorot: ilsColumnToAgorot(order.subtotal_ils ?? 0),
    totalAgorot: ilsColumnToAgorot(order.total_ils ?? 0),
    walletAppliedAgorot: ilsColumnToAgorot(order.cashback_applied_ils ?? 0),
    addressId: order.address_id,
    lines,
  }
}
