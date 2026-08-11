import { readFileSync } from 'node:fs'
// Verification: every product has supplier_id NOT NULL + at least one image.
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: prods, error } = await admin
  .from('products')
  .select('id, slug, supplier_id, images, suppliers(name)')
  .order('slug')
if (error) throw new Error(error.message)

const { data: piRows, error: piErr } = await admin.from('product_images').select('product_id')
if (piErr) throw new Error(piErr.message)
const piByProduct = {}
for (const r of piRows) piByProduct[r.product_id] = (piByProduct[r.product_id] || 0) + 1
for (const p of prods) p.product_images = { length: piByProduct[p.id] || 0 }

const missingSupplier = prods.filter((p) => !p.supplier_id)
const missingImage = prods.filter(
  (p) => !Array.isArray(p.images) || p.images.length === 0 || p.product_images.length === 0,
)

console.log('total products:', prods.length)
console.log(
  'products with supplier_id NULL:',
  missingSupplier.length,
  missingSupplier.map((p) => p.slug),
)
console.log(
  'products without any image:',
  missingImage.length,
  missingImage.map((p) => p.slug),
)

const bySupplier = {}
for (const p of prods) {
  const key = p.suppliers?.name ?? 'NULL'
  bySupplier[key] = (bySupplier[key] || 0) + 1
}
console.log('distribution by supplier:', bySupplier)

const { count: piCount } = await admin
  .from('product_images')
  .select('*', { count: 'exact', head: true })
console.log('product_images rows:', piCount)

const { count: supCount } = await admin
  .from('suppliers')
  .select('*', { count: 'exact', head: true })
console.log('suppliers rows:', supCount)

console.log('\nsample joined rows:')
for (const p of prods.slice(0, 5)) {
  console.log(
    ` ${p.slug} -> supplier="${p.suppliers?.name}" images_jsonb=${p.images.length} product_images=${p.product_images.length}`,
  )
}

if (missingSupplier.length === 0 && missingImage.length === 0) {
  console.log('\nVERIFICATION PASSED')
} else {
  console.error('\nVERIFICATION FAILED')
  process.exit(1)
}
