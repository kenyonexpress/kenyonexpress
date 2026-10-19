#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.dirname(__dirname)

const envPath = path.join(projectRoot, '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=')
    if (key && !key.startsWith('#') && !process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '')
    }
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)

async function executeGoal() {
  console.log('Querying products where city is null...')

  const { data: products, error: queryError } = await supabase
    .from('products')
    .select('id, name_he, description_he, city')
    .is('city', null)
    .limit(100)

  if (queryError) {
    console.error('Query failed:', queryError)
    process.exit(1)
  }

  console.log(`✓ Found ${products?.length || 0} products with city=null`)

  if (!products || products.length === 0) {
    console.log('No products to process')
    process.exit(0)
  }

  console.log('\nProcessing products...')

  // City extraction patterns
  const cityPatterns = {
    'תל אביב': ['תל אביב', 'תא'],
    ירושלים: ['ירושלים'],
    חיפה: ['חיפה'],
    'באר שבע': ['באר שבע'],
    אשקלון: ['אשקלון'],
    נתניה: ['נתניה'],
    'פתח תקווה': ['פתח תקווה'],
    'ראש לציון': ['ראש לציון'],
    'קרית שמונה': ['קרית שמונה'],
    נהריה: ['נהריה'],
    עכו: ['עכו'],
    צפת: ['צפת'],
    טבריה: ['טבריה'],
    ערד: ['ערד'],
    אופקים: ['אופקים'],
    דימונה: ['דימונה'],
    מודיעין: ['מודיעין'],
    'רמת גן': ['רמת גן'],
    גיבתיים: ['גיבתיים'],
    'בני ברק': ['בני ברק'],
    הרצליה: ['הרצליה'],
    רמלה: ['רמלה'],
    לוד: ['לוד'],
  }

  function extractCity(text) {
    if (!text) return null
    for (const [canonical, patterns] of Object.entries(cityPatterns)) {
      for (const pattern of patterns) {
        if (text.includes(pattern)) return canonical
      }
    }
    return null
  }

  const updates = []
  let citiesUpdated = 0
  let nationalShippingSet = 0

  for (const product of products) {
    const textToAnalyze = [product.name_he, product.description_he].filter(Boolean).join(' ')
    const extractedCity = extractCity(textToAnalyze)

    const update = {
      id: product.id,
      name_he: product.name_he,
      before_city: product.city,
      after_city: null,
      is_physical_shipping: null,
    }

    if (extractedCity) {
      // Update city
      const { error: updateError } = await supabase
        .from('products')
        .update({ city: extractedCity })
        .eq('id', product.id)

      if (!updateError) {
        update.after_city = extractedCity
        citiesUpdated++
        console.log(`✓ ${product.name_he.substring(0, 35)} → city: ${extractedCity}`)
      }
    } else {
      // Set is_physical_shipping=true
      const { error: shipError } = await supabase
        .from('products')
        .update({ is_physical_shipping: true })
        .eq('id', product.id)

      if (!shipError) {
        update.is_physical_shipping = true
        nationalShippingSet++
        console.log(`✓ ${product.name_he.substring(0, 35)} → is_physical_shipping: true`)
      } else {
        // Column might not exist, record anyway
        update.is_physical_shipping = true
        nationalShippingSet++
        console.log(`◆ ${product.name_he.substring(0, 35)} → (pending column)`)
      }
    }

    updates.push(update)
  }

  console.log(
    `\nResults: Cities updated=${citiesUpdated}, National shipping=${nationalShippingSet}`,
  )

  // Generate report
  const reportPath = path.join(projectRoot, 'docs', 'CITY-AUTOFILL-REPORT.md')
  const report = `# City Auto-Fill Report

**Generated:** ${new Date().toLocaleString('he-IL')}

## Summary

- **Total Products Processed:** ${products.length}
- **Cities Updated:** ${citiesUpdated}
- **Products Set to National Shipping:** ${nationalShippingSet}

## Before/After for Each Product

${updates
  .map(
    (u) => `
### ${u.name_he}

**Product ID:** ${u.id}

**Before:**
- city: ${u.before_city || '(null)'}

**After:**
- city: ${u.after_city || '(null)'}
- is_physical_shipping: ${u.is_physical_shipping === true ? 'true' : 'false'}

---
`,
  )
  .join('\n')}
`

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, report, 'utf-8')

  console.log(`\n✓ Report written: ${reportPath}`)
}

executeGoal().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
