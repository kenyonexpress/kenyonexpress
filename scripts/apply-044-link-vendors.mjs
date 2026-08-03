import { readFileSync } from 'node:fs'
// Applies the DML of supabase/migrations/044_link_products_to_vendors.sql
// through PostgREST (service role). Mirrors the SQL exactly.
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

// 1. mirror vendors into suppliers (same UUIDs)
const { data: vendors, error: vErr } = await admin
  .from('vendors')
  .select('id, business_name, contact_email, contact_phone, commission_rate')
  .is('deleted_at', null)
if (vErr) throw new Error(vErr.message)

const mirrored = vendors.map((v) => ({
  id: v.id,
  name: v.business_name,
  contact_email: v.contact_email,
  contact_phone: v.contact_phone,
  commission_percent: v.commission_rate ?? 10,
  notes: 'שוקף מ-public.vendors (044); ישות קנונית עד איחוד 036',
}))
const { error: upErr } = await admin
  .from('suppliers')
  .upsert(mirrored, { onConflict: 'id', ignoreDuplicates: true })
if (upErr) throw new Error(`suppliers mirror failed: ${upErr.message}`)
console.log('vendors mirrored into suppliers:', mirrored.length)

// 2. category -> vendor mapping (same as the SQL CASE)
const byName = Object.fromEntries(vendors.map((v) => [v.business_name, v.id]))
const CATEGORY_TO_VENDOR = {
  electronics: byName['אלקטרו פלוס'],
  'phones-computers': byName['טק וורלד'],
  'restaurants-cafes': byName['טעמים גורמה'],
  professionals: byName['טעמים גורמה'],
  'beauty-health': byName['ביוטי לאב'],
  vacation: byName['ספורט מקס'],
}
const FALLBACK = byName['סטייל הבית']

const { data: prods, error: pErr } = await admin
  .from('products')
  .select('id, slug, supplier_id, categories(slug)')
  .order('slug')
if (pErr) throw new Error(pErr.message)

let relinked = 0
for (const p of prods) {
  const target = CATEGORY_TO_VENDOR[p.categories?.slug] ?? FALLBACK
  if (!target || p.supplier_id === target) continue
  const { error } = await admin.from('products').update({ supplier_id: target }).eq('id', p.id)
  if (error) throw new Error(`link ${p.slug} failed: ${error.message}`)
  relinked += 1
}
console.log('products relinked:', relinked, 'of', prods.length)

// 3. drop the interim 043 demo suppliers if unreferenced
const DEMO_IDS = [
  'f47ac10b-58cc-4372-a567-0e02b2c3d101',
  'f47ac10b-58cc-4372-a567-0e02b2c3d102',
  'f47ac10b-58cc-4372-a567-0e02b2c3d103',
]
const { count: stillLinked } = await admin
  .from('products')
  .select('*', { count: 'exact', head: true })
  .in('supplier_id', DEMO_IDS)
if (stillLinked === 0) {
  const { error } = await admin.from('suppliers').delete().in('id', DEMO_IDS)
  if (error) throw new Error(`demo supplier cleanup failed: ${error.message}`)
  console.log('interim 043 demo suppliers removed')
} else {
  console.log('demo suppliers kept, still referenced by', stillLinked, 'products')
}
