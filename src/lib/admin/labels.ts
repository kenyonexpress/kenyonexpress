// Single Hebrew label map for every enum shown in the admin panel (ADM-16).
// Unknown values fall back to the raw value, never an error (contracts 5.3).

import type {
  AffiliateStatus,
  AuditAction,
  CouponStatus,
  EscrowStatus,
  OrderItemStatus,
  OrderStatus,
  PaymentKind,
  PaymentStatus,
  ProductApprovalStatus,
  ProductStatus,
  ProductType,
  ReferralStatus,
  SettlementStatus,
} from '@/types/database'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'ממתינה לתשלום',
  paid: 'שולמה',
  partially_fulfilled: 'סופקה חלקית',
  fulfilled: 'סופקה',
  cancelled: 'בוטלה',
  refunded: 'הוחזרה',
  // Added 2026-08-11 with the type regeneration. Migration 071 put this value
  // in the live enum and the checked-in types never carried it, so the map
  // compiled while a real order state had no Hebrew label at all.
  platform_settled: 'הפלטפורמה שולמה',
}

export const ORDER_ITEM_STATUS_LABELS: Record<OrderItemStatus, string> = {
  pending: 'ממתין',
  issued: 'הונפק',
  shipped: 'נשלח',
  delivered: 'נמסר',
  cancelled: 'בוטל',
  refunded: 'הוחזר',
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  initiated: 'נפתח',
  redirected: 'הופנה לסליקה',
  succeeded: 'הצליח',
  failed: 'נכשל',
  refunded: 'הוחזר',
  platform_settled: 'הפלטפורמה שולמה',
}

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  charge: 'חיוב',
  refund: 'החזר',
}

export const COUPON_STATUS_LABELS: Record<CouponStatus, string> = {
  issued: 'הונפק',
  used: 'מומש',
  expired: 'פג תוקף',
  refunded: 'הוחזר',
}

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'טיוטה',
  active: 'פעיל',
  paused: 'מושהה',
  sold_out: 'אזל',
  archived: 'בארכיון',
}

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  coupon: 'קופון',
  physical: 'מוצר פיזי',
  service: 'שירות',
}

export const APPROVAL_STATUS_LABELS: Record<ProductApprovalStatus, string> = {
  draft: 'טיוטה',
  pending: 'ממתין לאישור',
  approved: 'מאושר',
  rejected: 'נדחה',
}

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  pending: 'ממתין',
  paid: 'שולם',
  split_executed: 'פוצל לספק',
  platform_settled: 'נסלק לפלטפורמה',
  escrow_held: 'בנאמנות',
  escrow_released: 'שוחרר מנאמנות',
  redeemed: 'מומש',
  refunded: 'הוחזר',
  cancelled: 'בוטל',
}

export const ESCROW_STATUS_LABELS: Record<EscrowStatus, string> = {
  held: 'מוחזק',
  released: 'שוחרר',
  refunded: 'הוחזר',
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  created: 'יצירה',
  updated: 'עדכון',
  deleted: 'מחיקה',
  restored: 'שחזור',
  login: 'כניסה',
  logout: 'יציאה',
  permission_change: 'שינוי הרשאות',
  status_change: 'שינוי סטטוס',
  manual_override: 'התערבות ידנית',
}

export const AFFILIATE_STATUS_LABELS: Record<AffiliateStatus, string> = {
  pending_review: 'ממתין לבדיקה',
  approved: 'מאושר',
  rejected: 'נדחה',
  suspended: 'מושעה',
}

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  pending: 'ממתין',
  completed: 'הושלם',
  rejected: 'נדחה',
  // Migration 097 added this for referrals held back for fraud review. Same
  // story as platform_settled above: live in the database, absent from the
  // checked-in types, so the admin had no word for it.
  flagged: 'סומן לבדיקה',
}

export const PENDING_QUEUE_LABELS: Record<string, string> = {
  product_approvals: 'מוצרים לאישור',
  stuck_payments: 'תשלומים תקועים',
  expired_pending_orders: 'הזמנות שפג תוקפן',
  affiliate_applications: 'בקשות שותפים',
}

// Generic accessor: unknown enum value renders raw, never throws.
export function labelFor<K extends string>(
  map: Partial<Record<K, string>>,
  value: K | null | undefined,
): string {
  if (value == null) return ''
  return map[value] ?? value
}
