import { sql } from 'drizzle-orm'
import { check, index, integer, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { orderItemStatus, productType, products, suppliers } from './commerce'
import { orders } from './orders'

// Column shape must stay identical to the order_items projection in commerce.ts.
// The created_at index ships in migrations/pending/005_orders.sql (order_items
// has no user_id column, so only created_at is indexed here).

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
    index('order_items_created_at_idx').on(table.createdAt),
    check('order_items_quantity_positive', sql`${table.quantity} > 0`),
    check('order_items_unit_price_nonnegative', sql`${table.unitPriceAgorot} >= 0`),
    check('order_items_face_value_nonnegative', sql`${table.faceValueAgorot} >= 0`),
    check('order_items_customer_pays_now_nonnegative', sql`${table.customerPaysNowAgorot} >= 0`),
    check('order_items_platform_fee_nonnegative', sql`${table.platformFeeAgorot} >= 0`),
    check('order_items_supplier_due_nonnegative', sql`${table.supplierDueAgorot} >= 0`),
    check('order_items_cashback_amount_nonnegative', sql`${table.cashbackAmountAgorot} >= 0`),
  ],
)

export type OrderItem = typeof orderItems.$inferSelect
export type NewOrderItem = typeof orderItems.$inferInsert
