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

// A vendor with no rate stops the mirror instead of being assigned one. This
// line read `?? 10` until 2026-08-11, which would have written a 10% commission
// that no admin ever chose onto every vendor missing a rate -- the same defect
// commit 8819c5d removed from the wp-import projector. Per AGENTS.md there is
// no default and no fallback: a missing percentage is an error to be fixed in
// the admin, not a number for a script to invent.
const unrated = vendors.filter((v) => v.commission_rate == null)
if (unrated.length > 0) {
  throw new Error(
    `${unrated.length} vendor(s) have no commission_rate: ${unrated
      .map((v) => v.business_name)
      .join(', ')}. Set each rate in /admin/vendors and re-run; this script will not invent one.`,
  )
}

const mirrored = vendors.map((v) => ({
  id: v.id,
  name: v.business_name,
  contact_email: v.contact_email,
  contact_phone: v.contact_phone,
  commission_percent: v.commission_rate,
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
