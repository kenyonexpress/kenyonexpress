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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Hebrew cities comprehensive list
const CITY_PATTERNS = {
  'תל אביב': ['תל אביב', 'תא'],
  'ירושלים': ['ירושלים', 'ירושליים'],
  'חיפה': ['חיפה'],
  'באר שבע': ['באר שבע'],
  'אשקלון': ['אשקלון'],
  'נתניה': ['נתניה'],
  'פתח תקווה': ['פתח תקווה'],
  'ראש לציון': ['ראש לציון', 'ראשון לציון'],
  'קרית שמונה': ['קרית שמונה'],
  'נהריה': ['נהריה'],
  'עכו': ['עכו'],
  'צפת': ['צפת'],
  'טבריה': ['טבריה'],
  'ערד': ['ערד'],
  'אופקים': ['אופקים'],
  'דימונה': ['דימונה'],
}

// Parse product text with Haiku-level reasoning
function extractCity(text) {
  if (!text) return null

  // Check each city's patterns
  for (const [canonical, patterns] of Object.entries(CITY_PATTERNS)) {
    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        return canonical
      }
    }
  }

  return null
}

async function main() {
  console.log('Fetching products with null city...')

  const { data: products, error } = await supabase
    .from('products')
    .select('id, name_he, description_he, city')
    .is('city', null)
    .limit(100)

  if (error) {
    console.error('Query error:', error)
    process.exit(1)
  }

  if (!products || products.length === 0) {
    console.log('No products found with null city')
    process.exit(0)
  }

  console.log(`Found ${products.length} products with null city`)

  const report = {
    timestamp: new Date().toISOString(),
    totalProducts: products.length,
    citiesExtracted: 0,
    productsNeedingPhysicalShipping: 0,
    updates: [],
  }

  // Process each product
  for (const product of products) {
    const textToAnalyze = [product.name_he, product.description_he].filter(Boolean).join(' ')
    const extractedCity = extractCity(textToAnalyze)

    const before = {
      id: product.id,
      name_he: product.name_he,
      city: product.city,
    }

    const after = { ...before }

    if (extractedCity) {
      // Update city
      const { error: updateError } = await supabase
        .from('products')
        .update({ city: extractedCity })
        .eq('id', product.id)

      if (updateError) {
        console.error(`Error updating product ${product.id}:`, updateError)
      } else {
        after.city = extractedCity
        report.citiesExtracted++
        console.log(`✓ ${product.name_he} → ${extractedCity}`)
      }
    } else {
      // Try to set is_physical_shipping=true (may fail if column doesn't exist)
      try {
        const { error: shipError } = await supabase
          .from('products')
          .update({ is_physical_shipping: true })
          .eq('id', product.id)

        if (shipError) {
          console.log(`⚠ ${product.name_he} → pending (column might not exist)`)
        } else {
          console.log(`⚠ ${product.name_he} → is_physical_shipping=true`)
        }
      } catch (_e) {
        console.log(`⚠ ${product.name_he} → pending (column not available)`)
      }
      report.productsNeedingPhysicalShipping++
    }

    report.updates.push({
      productId: product.id,
      before,
      after,
      cityExtracted: extractedCity,
    })
  }

  // Write report
  const reportPath = path.join(projectRoot, 'docs', 'CITY-AUTOFILL-REPORT.md')
  const reportContent = generateReport(report)

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, reportContent, 'utf-8')

  console.log(`\n✓ Report: ${reportPath}`)
  console.log(`✓ Cities updated: ${report.citiesExtracted}`)
  console.log(`✓ Products marked for national shipping: ${report.productsNeedingPhysicalShipping}`)
}

function generateReport(report) {
  let md = `# City Auto-Fill Report

**Generated:** ${new Date(report.timestamp).toLocaleString('he-IL')}

## Summary

- **Total Products Processed:** ${report.totalProducts}
- **Cities Extracted and Updated:** ${report.citiesExtracted}
- **Products Set to National Shipping:** ${report.productsNeedingPhysicalShipping}

## Before/After Details

`

  for (const update of report.updates) {
    md += `### Product ID: ${update.productId}

**Product Name:** ${update.before.name_he}

**Before:**
- City: ${update.before.city || '(null)'}

**After:**
- City: ${update.after.city || '(null)'}

${update.cityExtracted ? `**Result:** ✓ City extracted: ${update.cityExtracted}` : '**Result:** ⚠ No city found; marked for national shipping'}

---

`
  }

  return md
}

main().catch((err) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
