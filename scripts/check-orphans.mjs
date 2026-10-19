#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Read .env.local
const envFile = readFileSync('.env.local', 'utf-8')
const env = {}
for (const line of envFile.split('\n')) {
  const [key, ...valueParts] = line.split('=')
  if (key && valueParts.length) {
    env[key.trim()] = valueParts.join('=').replace(/^["']|["']$/g, '')
  }
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY)

async function checkOrphans() {
  console.log('Checking for orphan rows...\n')

  // Check order_items with deleted products
  const { data: orphanOrderItems, error: e1 } = await supabase
    .from('order_items')
    .select('id, product_id')
    .not('product_id', 'is', null)
    .limit(1000)

  if (e1) {
    console.warn('Error checking order_items:', e1.message)
  } else {
    const productIds = [...new Set(orphanOrderItems.map((i) => i.product_id))]
    const { data: existingProducts } = await supabase
      .from('products')
      .select('id')
      .in('id', productIds)

    const existingIds = new Set(existingProducts.map((p) => p.id))
    const orphans = orphanOrderItems.filter((i) => !existingIds.has(i.product_id))
    console.log(`Order items with deleted products: ${orphans.length}/${orphanOrderItems.length}`)
    if (orphans.length > 0) {
      console.log(
        'Sample orphan IDs:',
        orphans.slice(0, 5).map((o) => o.id),
      )
    }
  }

  // Check cart_items with non-existent products
  const { data: cartItems, error: e2 } = await supabase
    .from('cart_items')
    .select('id, product_id')
    .not('product_id', 'is', null)
    .limit(1000)

  if (e2) {
    console.warn('Error checking cart_items:', e2.message)
  } else if (cartItems.length > 0) {
    const productIds = [...new Set(cartItems.map((i) => i.product_id))]
    const { data: existingProducts } = await supabase
      .from('products')
      .select('id')
      .in('id', productIds)

    const existingIds = new Set(existingProducts.map((p) => p.id))
    const orphans = cartItems.filter((i) => !existingIds.has(i.product_id))
    console.log(`Cart items with non-existent products: ${orphans.length}/${cartItems.length}`)
    if (orphans.length > 0) {
      console.log(
        'Sample orphan IDs:',
        orphans.slice(0, 5).map((o) => o.id),
      )
    }
  }

  // Check vouchers with deleted order_items
  const { data: vouchers, error: e3 } = await supabase
    .from('vouchers')
    .select('id, order_item_id')
    .not('order_item_id', 'is', null)
    .limit(1000)

  if (e3) {
    console.warn('Error checking vouchers:', e3.message)
  } else if (vouchers.length > 0) {
    const orderItemIds = [...new Set(vouchers.map((v) => v.order_item_id))]
    const { data: existingOrderItems } = await supabase
      .from('order_items')
      .select('id')
      .in('id', orderItemIds)

    const existingIds = new Set(existingOrderItems.map((o) => o.id))
    const orphans = vouchers.filter((v) => !existingIds.has(v.order_item_id))
    console.log(`Vouchers with deleted order_items: ${orphans.length}/${vouchers.length}`)
    if (orphans.length > 0) {
      console.log(
        'Sample orphan IDs:',
        orphans.slice(0, 5).map((o) => o.id),
      )
    }
  }

  console.log('\nOrphan check complete.')
}

checkOrphans().catch((err) => {
  console.warn('Orphan check failed:', err)
  process.exit(1)
})
