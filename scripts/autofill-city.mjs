#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.dirname(__dirname)

// Load environment from .env.local
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

// Validate required environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'set' : 'missing')
  console.error('SUPABASE_SECRET_KEY:', supabaseKey ? 'set' : 'missing')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Extract city using pattern matching
// Works without API access
async function extractCityFromText(text) {
  if (!text) return null

  // Map of Hebrew city name patterns
  const cityPatterns = [
    { patterns: ['תל אביב', 'תא'], canonical: 'תל אביב' },
    { patterns: ['ירושלים', 'ירושליים'], canonical: 'ירושלים' },
    { patterns: ['חיפה'], canonical: 'חיפה' },
    { patterns: ['באר שבע'], canonical: 'באר שבע' },
    { patterns: ['אשקלון'], canonical: 'אשקלון' },
    { patterns: ['נתניה'], canonical: 'נתניה' },
    { patterns: ['פתח תקווה'], canonical: 'פתח תקווה' },
    { patterns: ['ראש לציון', 'ראשון לציון'], canonical: 'ראש לציון' },
    { patterns: ['קרית שמונה'], canonical: 'קרית שמונה' },
    { patterns: ['נהריה'], canonical: 'נהריה' },
    { patterns: ['עכו'], canonical: 'עכו' },
    { patterns: ['צפת'], canonical: 'צפת' },
    { patterns: ['טבריה'], canonical: 'טבריה' },
    { patterns: ['ערד'], canonical: 'ערד' },
    { patterns: ['אופקים'], canonical: 'אופקים' },
    { patterns: ['דימונה'], canonical: 'דימונה' },
    { patterns: ['מודיעין'], canonical: 'מודיעין' },
    { patterns: ['רמת גן'], canonical: 'רמת גן' },
    { patterns: ['גיבתיים'], canonical: 'גיבתיים' },
    { patterns: ['בני ברק'], canonical: 'בני ברק' },
    { patterns: ['הרצליה'], canonical: 'הרצליה' },
    { patterns: ['רמלה'], canonical: 'רמלה' },
    { patterns: ['לוד'], canonical: 'לוד' },
    { patterns: ['כרמיאל'], canonical: 'כרמיאל' },
    { patterns: ['קריית גת'], canonical: 'קריית גת' },
    { patterns: ['קרית מלאכי'], canonical: 'קרית מלאכי' },
    { patterns: ['קריית אתא'], canonical: 'קריית אתא' },
    { patterns: ['קריית ים'], canonical: 'קריית ים' },
  ]

  // Search for city patterns (case-insensitive)
  for (const cityEntry of cityPatterns) {
    for (const pattern of cityEntry.patterns) {
      if (text.includes(pattern)) {
        return cityEntry.canonical
      }
    }
  }

  return null
}

async function main() {
  console.log('Fetching products with null city...')
  console.log('NOTE: is_physical_shipping column from migration 244 is not yet applied.')
  console.log('This script will populate city fields and document products without city info.')

  // Query products where city is null
  // NOTE: Migration 244 adds is_physical_shipping column; until applied, we query by city alone
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name_he, description_he, city')
    .is('city', null)
    .limit(100)

  if (error) {
    console.error('Error fetching products:', error)
    process.exit(1)
  }

  if (!products || products.length === 0) {
    console.log('No products found matching criteria')
    process.exit(0)
  }

  console.log(`Found ${products.length} products to process`)

  const report = {
    timestamp: new Date().toISOString(),
    totalProducts: products.length,
    citiesExtracted: 0,
    citiesNotFound: 0,
    updates: [],
  }

  // Process each product
  for (const product of products) {
    const textToAnalyze = [product.name_he, product.description_he].filter(Boolean).join(' ')

    let extractedCity = null
    if (textToAnalyze) {
      extractedCity = await extractCityFromText(textToAnalyze)
    }

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
      }
    } else {
      // Note: is_physical_shipping cannot be set yet as migration 244 is not applied
      // This product will need manual review to either:
      // 1. Have city extracted manually and set
      // 2. Be marked as is_physical_shipping=true once migration 244 is applied
      report.citiesNotFound++
    }

    report.updates.push({
      productId: product.id,
      before,
      after,
      cityExtracted: extractedCity || null,
      action: extractedCity ? 'city_updated' : 'pending_review_no_city_in_text',
    })
  }

  // Write report
  const reportPath = path.join(projectRoot, 'docs', 'CITY-AUTOFILL-REPORT.md')
  const reportContent = generateReportMarkdown(report)

  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, reportContent, 'utf-8')

  console.log(`✓ Report written to ${reportPath}`)
  console.log(`✓ Cities extracted and updated: ${report.citiesExtracted}`)
  console.log(`✓ Products pending review (no city in text): ${report.citiesNotFound}`)
  console.log('')
  console.log('IMPORTANT: Migration 244 (is_physical_shipping) is not yet applied.')
  console.log('Products without extracted cities will need to be manually reviewed and either:')
  console.log('1. Have their city manually set')
  console.log('2. Be marked as is_physical_shipping=true once migration 244 is applied')
}

function generateReportMarkdown(report) {
  let md = `# City Auto-Fill Report

**Generated:** ${new Date(report.timestamp).toLocaleString('he-IL')}

## ⚠️ Important Note

**Migration 244 is not yet applied.** This migration adds the \`is_physical_shipping\` column to products.
Products without extracted cities cannot yet be marked as national shipping. They will require:
1. Manual city extraction and entry, or
2. Marking as \`is_physical_shipping=true\` once migration 244 is applied

## Summary

- **Total Products Processed:** ${report.totalProducts}
- **Cities Extracted and Updated:** ${report.citiesExtracted}
- **Products Pending Review (No City in Text):** ${report.citiesNotFound}

## Details

`

  for (const update of report.updates) {
    md += `### Product: ${update.productId}

**Name:** ${update.before.name_he}

**Before:**
- City: ${update.before.city || '(null)'}

**After:**
- City: ${update.after.city || '(null)'}

**Action:** ${update.action === 'city_updated' ? `✓ City extracted and updated: ${update.cityExtracted}` : '⚠️ No city found in text - pending manual review or migration 244 application'}

---

`
  }

  return md
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
