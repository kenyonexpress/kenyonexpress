// Applies the DML of supabase/migrations/043_seed_suppliers_link_products.sql
// through PostgREST (service role). Mirrors the SQL exactly; the migration
// file itself becomes a no-op once this has run.
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

const SUPPLIERS = [
  {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d101',
    name: 'אלקטרו סחר בע"מ',
    contact_email: 'orders@electro-sachar.co.il',
    contact_phone: '03-5551001',
    commission_percent: 10,
    notes: 'ספק דמו: אלקטרוניקה ומוצרי חשמל',
  },
  {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d102',
    name: 'חופשות ישראל בע"מ',
    contact_email: 'bookings@hufshot-israel.co.il',
    contact_phone: '04-5552002',
    commission_percent: 12,
    notes: 'ספק דמו: נופש, צימרים וספא',
  },
  {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d103',
    name: 'בית ומשפחה שיווק בע"מ',
    contact_email: 'sales@bait-mishpacha.co.il',
    contact_phone: '02-5553003',
    commission_percent: 8,
    notes: 'ספק דמו: מוצרי בית, ילדים ושירותים',
  },
]

// 1. suppliers (ON CONFLICT (id) DO NOTHING)
const { error: supErr } = await admin
  .from('suppliers')
  .upsert(SUPPLIERS, { onConflict: 'id', ignoreDuplicates: true })
if (supErr) throw new Error(`suppliers upsert failed: ${supErr.message}`)
console.log('suppliers seeded:', SUPPLIERS.length)

// 2. round-robin linkage by slug, only where supplier_id IS NULL
const { data: unlinked, error: unlErr } = await admin
  .from('products')
  .select('id, slug')
  .is('supplier_id', null)
  .order('slug')
if (unlErr) throw new Error(unlErr.message)
console.log('products without supplier:', unlinked.length)

for (const [i, p] of unlinked.entries()) {
  const supplierId = SUPPLIERS[i % 3].id
  const { error } = await admin.from('products').update({ supplier_id: supplierId }).eq('id', p.id)
  if (error) throw new Error(`link ${p.slug} failed: ${error.message}`)
}
console.log('linked products:', unlinked.length)

// 3. project products.images jsonb into product_images (guarded by product_id+url)
const { data: prods, error: prodErr } = await admin.from('products').select('id, name_he, images')
if (prodErr) throw new Error(prodErr.message)
const { data: existing } = await admin.from('product_images').select('product_id, url')
const seen = new Set((existing ?? []).map((r) => `${r.product_id}|${r.url}`))

const rows = []
for (const p of prods) {
  if (!Array.isArray(p.images)) continue
  p.images.forEach((url, idx) => {
    if (typeof url === 'string' && !seen.has(`${p.id}|${url}`)) {
      rows.push({ product_id: p.id, url, alt_he: p.name_he, sort_order: idx })
    }
  })
}
if (rows.length > 0) {
  const { error } = await admin.from('product_images').insert(rows)
  if (error) throw new Error(`product_images insert failed: ${error.message}`)
}
console.log('product_images inserted:', rows.length)
