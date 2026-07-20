import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgPolicy,
  pgSchema,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// products, orders, and order_items are commerce-owned query projections over
// legacy tables. Drizzle Kit loads commerce-managed.ts, which exports only the
// two new ledger tables and cannot drop columns owned by earlier migrations.

export const productType = pgEnum('product_type', ['coupon', 'physical', 'service'])
export const orderStatus = pgEnum('order_status', [
  'pending',
  'paid',
  'partially_fulfilled',
  'fulfilled',
  'cancelled',
  'refunded',
])
export const orderItemStatus = pgEnum('order_item_status', [
  'pending',
  'issued',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
])
export const commissionLedgerEvent = pgEnum('commission_ledger_event', ['accrual', 'reversal'])
export const commissionLedgerStatus = pgEnum('commission_ledger_status', [
  'pending',
  'earned',
  'reversed',
])

const auth = pgSchema('auth')

export const authUsers = auth.table('users', {
  id: uuid('id').primaryKey(),
})

export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().defaultRandom(),
})

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    type: productType('type').notNull(),
    priceIls: numeric('price_ils', { precision: 10, scale: 2 }).notNull(),
    platformPercent: numeric('platform_percent', { precision: 5, scale: 2 })
      .notNull()
      .default('10'),
    cashbackPercent: numeric('cashback_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    couponExpiryDays: integer('coupon_expiry_days').notNull(),
  },
  (table) => [
    check('products_platform_percent_range', sql`${table.platformPercent} BETWEEN 0 AND 100`),
    check('products_cashback_percent_range', sql`${table.cashbackPercent} BETWEEN 0 AND 100`),
    check('products_coupon_expiry_days_positive', sql`${table.couponExpiryDays} >= 0`),
  ],
)

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'restrict' }),
  status: orderStatus('status').notNull().default('pending'),
  subtotalAgorot: integer('subtotal_agorot').notNull(),
  discountAgorot: integer('discount_agorot').notNull().default(0),
  walletAppliedAgorot: integer('wallet_applied_agorot').notNull().default(0),
  customerPaysNowAgorot: integer('customer_pays_now_agorot').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    productType: productType('product_type').notNull(),
    quantity: integer('quantity').notNull(),
    unitPriceAgorot: integer('unit_price_agorot').notNull(),
    faceValueAgorot: integer('face_value_agorot').notNull(),
    customerPaysNowAgorot: integer('customer_pays_now_agorot').notNull(),
    platformPercent: numeric('platform_percent', { precision: 5, scale: 2 }).notNull(),
    platformFeeAgorot: integer('platform_fee_agorot').notNull(),
    supplierDueAgorot: integer('supplier_due_agorot').notNull(),
    cashbackPercent: numeric('cashback_percent', { precision: 5, scale: 2 }).notNull(),
    cashbackAmountAgorot: integer('cashback_amount_agorot').notNull(),
    itemStatus: orderItemStatus('item_status').notNull().default('pending'),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('order_items_order_id_idx').on(table.orderId),
    index('order_items_supplier_id_idx').on(table.supplierId),
    check('order_items_quantity_positive', sql`${table.quantity} > 0`),
    check('order_items_unit_price_nonnegative', sql`${table.unitPriceAgorot} >= 0`),
    check('order_items_face_value_nonnegative', sql`${table.faceValueAgorot} >= 0`),
    check('order_items_customer_pays_now_nonnegative', sql`${table.customerPaysNowAgorot} >= 0`),
    check('order_items_platform_fee_nonnegative', sql`${table.platformFeeAgorot} >= 0`),
    check('order_items_supplier_due_nonnegative', sql`${table.supplierDueAgorot} >= 0`),
    check('order_items_cashback_amount_nonnegative', sql`${table.cashbackAmountAgorot} >= 0`),
  ],
)

export const commissionLedger = pgTable(
  'commission_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    productType: productType('product_type').notNull(),
    event: commissionLedgerEvent('event').notNull(),
    status: commissionLedgerStatus('status').notNull().default('pending'),
    customerPaysNowAgorot: integer('customer_pays_now_agorot').notNull(),
    platformPercentBps: integer('platform_percent_bps').notNull(),
    platformFeeAgorot: integer('platform_fee_agorot').notNull(),
    supplierDueAgorot: integer('supplier_due_agorot').notNull(),
    cashbackPercentBps: integer('cashback_percent_bps').notNull(),
    cashbackAmountAgorot: integer('cashback_amount_agorot').notNull(),
    reversalOfId: uuid('reversal_of_id'),
    idempotencyKey: text('idempotency_key')
      .notNull()
      .unique('commission_ledger_idempotency_key_key'),
    earnedAt: timestamp('earned_at', { withTimezone: true }),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.reversalOfId],
      foreignColumns: [table.id],
      name: 'commission_ledger_reversal_of_id_fkey',
    }).onDelete('restrict'),
    index('commission_ledger_supplier_status_idx').on(
      table.supplierId,
      table.status,
      table.createdAt.desc(),
    ),
    index('commission_ledger_order_item_idx').on(table.orderItemId, table.createdAt),
    index('commission_ledger_order_idx').on(table.orderId, table.createdAt),
    check(
      'commission_ledger_customer_pays_now_nonnegative',
      sql`${table.customerPaysNowAgorot} >= 0`,
    ),
    check(
      'commission_ledger_platform_percent_bps_range',
      sql`${table.platformPercentBps} BETWEEN 0 AND 10000`,
    ),
    check(
      'commission_ledger_cashback_percent_bps_range',
      sql`${table.cashbackPercentBps} BETWEEN 0 AND 10000`,
    ),
    check('commission_ledger_platform_fee_nonnegative', sql`${table.platformFeeAgorot} >= 0`),
    check('commission_ledger_supplier_due_nonnegative', sql`${table.supplierDueAgorot} >= 0`),
    check('commission_ledger_cashback_amount_nonnegative', sql`${table.cashbackAmountAgorot} >= 0`),
    check(
      'commission_ledger_reversal_shape',
      sql`(
        (${table.event} = 'accrual' AND ${table.reversalOfId} IS NULL)
        OR
        (${table.event} = 'reversal' AND ${table.reversalOfId} IS NOT NULL)
      )`,
    ),
    pgPolicy('commission_ledger: user read own', {
      for: 'select',
      to: 'authenticated',
      using: sql`${table.orderId} IN (
        SELECT id FROM public.orders WHERE user_id = auth.uid()
      )`,
    }),
    pgPolicy('commission_ledger: supplier read own', {
      for: 'select',
      to: 'authenticated',
      using: sql`public.is_supplier_member(${table.supplierId})`,
    }),
    pgPolicy('commission_ledger: admin read', {
      for: 'select',
      to: 'authenticated',
      using: sql`public.is_admin()`,
    }),
  ],
).enableRLS()

export const cashbackReversalDebts = pgTable(
  'cashback_reversal_debts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'restrict' }),
    orderItemId: uuid('order_item_id')
      .notNull()
      .unique('cashback_reversal_debts_order_item_id_key')
      .references(() => orderItems.id, { onDelete: 'restrict' }),
    amountAgorot: integer('amount_agorot').notNull(),
    status: text('status').notNull().default('outstanding'),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cashback_reversal_debts_user_status_idx').on(
      table.userId,
      table.status,
      table.createdAt.desc(),
    ),
    check('cashback_reversal_debts_amount_positive', sql`${table.amountAgorot} > 0`),
    check(
      'cashback_reversal_debts_status_check',
      sql`${table.status} IN ('outstanding', 'settled')`,
    ),
    pgPolicy('cashback_debts: user read own', {
      for: 'select',
      to: 'authenticated',
      using: sql`${table.userId} = auth.uid()`,
    }),
    pgPolicy('cashback_debts: admin read', {
      for: 'select',
      to: 'authenticated',
      using: sql`public.is_admin()`,
    }),
  ],
).enableRLS()

export type CommerceProduct = typeof products.$inferSelect
export type CommerceOrder = typeof orders.$inferSelect
export type CommerceOrderItem = typeof orderItems.$inferSelect
export type CommissionLedgerEntry = typeof commissionLedger.$inferSelect
export type CashbackReversalDebt = typeof cashbackReversalDebts.$inferSelect
