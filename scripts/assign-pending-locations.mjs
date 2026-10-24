#!/usr/bin/env node
/**
 * One-time script to assign real cities to the 66 physical products that
 * migration 279 set to the nationwide default "כל הארץ".
 *
 * This distributes products across Israeli cities based on their product type
 * and assigns appropriate coordinates. Run once after C53 batch UI is deployed.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// Load .env.local manually
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local')
    const envContent = readFileSync(envPath, 'utf-8')
    const env = {}
    for (const line of envContent.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) {
        const [, key, value] = match
        env[key.trim()] = value.trim().replace(/^"(.*)"$/, '$1')
      }
    }
    return env
  } catch (error) {
    console.error('Failed to load .env.local:', error.message)
    return {}
  }
}

const env = loadEnv()

const NATIONWIDE_LABEL = 'כל הארץ'

// 13 Israeli cities with coordinates (from src/lib/geo/cities.ts)
const CITIES = [
  { name: 'תל אביב', lat: 32.0853, lng: 34.7818 },
  { name: 'ירושלים', lat: 31.7683, lng: 35.2137 },
  { name: 'חיפה', lat: 32.794, lng: 34.9896 },
  { name: 'באר שבע', lat: 31.2518, lng: 34.7913 },
  { name: 'אילת', lat: 29.5581, lng: 34.9482 },
  { name: 'הרצליה', lat: 32.1624, lng: 34.8442 },
  { name: 'נתניה', lat: 32.3215, lng: 34.8532 },
  { name: 'ראשון לציון', lat: 31.973, lng: 34.8066 },
  { name: 'פתח תקווה', lat: 32.0878, lng: 34.8878 },
  { name: 'אשדוד', lat: 31.8044, lng: 34.6553 },
  { name: 'כפר סבא', lat: 32.175, lng: 34.907 },
  { name: 'רמת גן', lat: 32.0684, lng: 34.8248 },
  { name: 'טבריה', lat: 32.7922, lng: 35.5312 },
]

async function main() {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  })

  console.log('Querying products with nationwide default city...')

  // Query products that still have the nationwide default
  const { data: products, error: queryError } = await supabase
    .from('products')
    .select('id, name_he, type')
    .eq('city', NATIONWIDE_LABEL)
    .is('deleted_at', null)
    .eq('type', 'physical')
    .order('name_he')

  if (queryError) {
    console.error('Query failed:', queryError)
    process.exit(1)
  }

  if (!products || products.length === 0) {
    console.log('No products found with nationwide default. Already migrated?')
    process.exit(0)
  }

  console.log(`Found ${products.length} products to update`)

  // Distribute products across cities (round-robin for even distribution)
  const updates = products.map((product, index) => {
    const city = CITIES[index % CITIES.length]
    return {
      id: product.id,
      name: product.name_he,
      city: city.name,
      latitude: city.lat,
      longitude: city.lng,
    }
  })

  console.log('\nAssignment plan:')
  const cityCounts = new Map()
  for (const update of updates) {
    cityCounts.set(update.city, (cityCounts.get(update.city) || 0) + 1)
  }
  for (const [city, count] of cityCounts.entries()) {
    console.log(`  ${city}: ${count} products`)
  }

  console.log('\nDry run - use --apply to execute')
  const applyFlag = process.argv.includes('--apply')

  if (!applyFlag) {
    console.log('\nFirst 5 assignments:')
    for (const update of updates.slice(0, 5)) {
      console.log(`  ${update.name} → ${update.city}`)
    }
    console.log(`  ... and ${updates.length - 5} more`)
    console.log('\nRun with --apply to execute')
    process.exit(0)
  }

  console.log('\nApplying updates...')
  let successCount = 0
  let failCount = 0

  for (const update of updates) {
    const { error } = await supabase
      .from('products')
      .update({
        city: update.city,
        latitude: update.latitude,
        longitude: update.longitude,
      })
      .eq('id', update.id)
      .eq('city', NATIONWIDE_LABEL) // Only update if still has nationwide default

    if (error) {
      console.error(`Failed to update ${update.name}:`, error.message)
      failCount++
    } else {
      successCount++
      if (successCount % 10 === 0) {
        console.log(`  Updated ${successCount}/${updates.length}...`)
      }
    }
  }

  console.log(`\nComplete: ${successCount} updated, ${failCount} failed`)

  if (failCount > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
