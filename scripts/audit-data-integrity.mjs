// One-off data integrity audit: counts + image/supplier location check.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function count(table) {
  const { count: c, error } = await admin.from(table).select('*', { count: 'exact', head: true })
  return error ? `ERR: ${error.message}` : c
}

const tables = ['products', 'categories', 'suppliers', 'vendors', 'product_images', 'product_variants']
for (const t of tables) {
  console.log(`${t}: ${await count(t)}`)
}

const { data: prods } = await admin
  .from('products')
  .select('id, slug, name_he, type, supplier_id, images, status, deleted_at')
  .order('created_at')
console.log('\nproducts total rows:', prods?.length)
const withImages = prods.filter((p) => Array.isArray(p.images) && p.images.length > 0)
console.log('products with non-empty images jsonb:', withImages.length)
console.log('products with supplier_id NOT NULL:', prods.filter((p) => p.supplier_id).length)
console.log('product types:', Object.entries(prods.reduce((a, p) => ((a[p.type] = (a[p.type] || 0) + 1), a), {})))
console.log('statuses:', Object.entries(prods.reduce((a, p) => ((a[p.status] = (a[p.status] || 0) + 1), a), {})))
console.log('\nsample images values:')
for (const p of withImages.slice(0, 3)) {
  console.log(` ${p.slug}:`, JSON.stringify(p.images).slice(0, 220))
}
const noImages = prods.filter((p) => !Array.isArray(p.images) || p.images.length === 0)
console.log('\nproducts with EMPTY images:', noImages.length, noImages.map((p) => p.slug).slice(0, 40))

const { data: vendors } = await admin.from('vendors').select('id, name').limit(10)
console.log('\nvendors sample:', vendors)

// storage buckets
const { data: buckets } = await admin.storage.listBuckets()
console.log('\nbuckets:', buckets?.map((b) => `${b.id}(public=${b.public})`))
const { data: objs } = await admin.storage.from('product-images').list('', { limit: 10 })
console.log('product-images bucket root:', objs?.map((o) => o.name))
