import { index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { authUsers, orderStatus } from './commerce'

// Column shape must stay identical to the orders projection in commerce.ts.
// The user_id and created_at indexes ship in migrations/pending/159_orders_indexes.sql.

export const orders = pgTable(
  'orders',
  {
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
  },
  (table) => [
    index('orders_user_id_idx').on(table.userId),
    index('orders_created_at_idx').on(table.createdAt),
  ],
)

export type Order = typeof orders.$inferSelect
export type NewOrder = typeof orders.$inferInsert
