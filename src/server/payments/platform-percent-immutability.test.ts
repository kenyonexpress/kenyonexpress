import { createAdminClient } from '@/lib/supabase/admin'
import { describe, expect, it } from 'vitest'

/**
 * Verifies that migration 130's trigger prevents UPDATE of
 * platform_percent_snapshot on paid orders.
 *
 * This test requires migration 130 to be applied. If the column or trigger
 * does not exist, the test will fail with a clear database error (42703 or
 * 42P01), which is the correct outcome: the migration must be applied before
 * the immutability guarantee holds.
 */
const configured = Boolean(
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL,
)

describe.skipIf(!configured)('order_items.platform_percent_snapshot immutability', () => {
  it('blocks UPDATE of platform_percent_snapshot on a paid order', async () => {
    const admin = createAdminClient()

    // Create a test order
    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        status: 'paid',
        total_ils: 100,
        paid_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    expect(orderError).toBeNull()
    expect(order).toBeDefined()

    // Create a test order_item with a platform_percent_snapshot
    const { data: item, error: itemError } = await admin
      .from('order_items')
      .insert({
        order_id: order!.id,
        product_type: 'physical',
        quantity: 1,
        unit_price_ils: 100,
        total_price_ils: 100,
        commission_percent: 20,
        supplier_payout_ils: 80,
        platform_percent_snapshot: 20,
      })
      .select('id')
      .single()

    expect(itemError).toBeNull()
    expect(item).toBeDefined()

    // Attempt to UPDATE platform_percent_snapshot on the paid order
    const { error: updateError } = await admin
      .from('order_items')
      .update({ platform_percent_snapshot: 30 })
      .eq('id', item!.id)

    // The trigger should block the update
    expect(updateError).not.toBeNull()
    expect(updateError?.message).toContain('percent snapshots are frozen')

    // Clean up
    await admin.from('orders').delete().eq('id', order!.id)
  })

  it('allows UPDATE of platform_percent_snapshot on an unpaid order', async () => {
    const admin = createAdminClient()

    // Create a test order without paid_at
    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        user_id: '00000000-0000-0000-0000-000000000000',
        status: 'pending',
        total_ils: 100,
      })
      .select('id')
      .single()

    expect(orderError).toBeNull()
    expect(order).toBeDefined()

    // Create a test order_item
    const { data: item, error: itemError } = await admin
      .from('order_items')
      .insert({
        order_id: order!.id,
        product_type: 'physical',
        quantity: 1,
        unit_price_ils: 100,
        total_price_ils: 100,
        commission_percent: 20,
        supplier_payout_ils: 80,
        platform_percent_snapshot: 20,
      })
      .select('id')
      .single()

    expect(itemError).toBeNull()
    expect(item).toBeDefined()

    // Attempt to UPDATE platform_percent_snapshot on the unpaid order
    const { error: updateError } = await admin
      .from('order_items')
      .update({ platform_percent_snapshot: 30 })
      .eq('id', item!.id)

    // The trigger should allow the update (order is not paid)
    expect(updateError).toBeNull()

    // Verify the update succeeded
    const { data: updated } = await admin
      .from('order_items')
      .select('platform_percent_snapshot')
      .eq('id', item!.id)
      .single()

    expect(updated?.platform_percent_snapshot).toBe(30)

    // Clean up
    await admin.from('orders').delete().eq('id', order!.id)
  })
})
