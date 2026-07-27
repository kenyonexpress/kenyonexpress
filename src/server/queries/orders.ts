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
      totalIls: Number(order.total_ils ?? 0),
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
    itemIds.length > 0
      ? admin
          .from('coupon_codes')
          .select(
            'code, status, expires_at, collect_amount_ils, face_value_ils, qr_token, used_at, order_item_id',
          )
          .in('order_item_id', itemIds)
      : Promise.resolve({
          data: [] as {
            code: string
            status: string
            expires_at: string | null
            collect_amount_ils: number | null
            face_value_ils: number | null
            qr_token: string | null
            used_at: string | null
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
      if (coupon.qr_token) {
        try {
          qrDataUrl = await QRCode.toDataURL(coupon.qr_token, { margin: 1, width: 240 })
        } catch {
          qrDataUrl = null
        }
      }
      vouchers.push({
        code: coupon.code,
        status: coupon.status,
        expiresAt: coupon.expires_at,
        collectAmountIls:
          coupon.collect_amount_ils === null ? null : Number(coupon.collect_amount_ils),
        faceValueIls: coupon.face_value_ils === null ? null : Number(coupon.face_value_ils),
        qrDataUrl,
        usedAt: coupon.used_at,
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
    subtotalIls: Number(order.subtotal_ils ?? 0),
    totalIls: Number(order.total_ils ?? 0),
    walletAppliedIls: Number(order.cashback_applied_ils ?? 0),
    addressId: order.address_id,
    lines,
  }
}
