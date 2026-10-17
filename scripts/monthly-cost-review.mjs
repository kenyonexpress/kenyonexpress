#!/usr/bin/env node
/**
 * Monthly Cost Review for KenyonExpress Infrastructure
 *
 * Reviews spending across:
 * - Vercel (hosting + analytics)
 * - Supabase (Pro plan with branching)
 * - R2 (Cloudflare storage)
 * - Meilisearch (search index)
 * - Resend (email API)
 * - Twilio (SMS)
 *
 * Tracks MRR (Monthly Recurring Revenue cost), alerts if delta > 20% from prior month
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docsDir = path.join(__dirname, '..', 'docs')
const costHistoryFile = path.join(docsDir, 'COST-HISTORY.json')

const TODAY = new Date().toISOString().split('T')[0]
const MONTH = TODAY.slice(0, 7) // YYYY-MM

// Known pricing as of 2026-10-18
const PRICING = {
  vercel: {
    hosting: 20, // Pro plan base
    analytics: 13, // Web Analytics add-on
    subtotal: 33,
    description: 'Pro plan (20) + Web Analytics (13)',
  },
  supabase: {
    pro_base: 25, // Pro plan base
    pitr_small: 0, // Currently disabled; would be 15 if enabled
    pitr_addon: 0, // Currently disabled; would be 100/mo for 7-day retention
    extra_storage: 0, // Included in Pro
    subtotal: 25,
    description: 'Pro plan base - PITR disabled (would add $115 if enabled)',
  },
  r2: {
    monthly: 0, // First 10GB free (per Cloudflare pricing)
    per_gb: 0.015, // Over 10GB
    description: 'Cloudflare R2 - $0.015/GB overage (currently under free tier)',
  },
  meilisearch: {
    cloud_starter: 0, // Assumed free tier or self-hosted
    description: 'Self-hosted or free tier (no verified monthly charge)',
  },
  resend: {
    per_thousand: 0.0001, // $0.0001 per email sent
    estimated_volume: 10000, // Estimated monthly emails
    subtotal: 1.0, // 10,000 emails = $1.00
    description: '10,000 emails/month × $0.0001 = $1.00',
  },
  twilio: {
    sms_inbound: 0.0075, // Per inbound SMS
    sms_outbound: 0.0075, // Per outbound SMS
    phone_number: 1.0, // Per phone number per month
    estimated_sms: 500, // Estimated monthly SMS
    subtotal: 5.63, // (500 × $0.0075) + $1.00 phone
    description: '~500 SMS × $0.0075 + $1.00 phone number = $5.63',
  },
}

// Calculate current month total
function calculateMRR() {
  const services = {
    'Vercel (Hosting)': PRICING.vercel.subtotal,
    'Supabase (Pro)': PRICING.supabase.subtotal,
    'R2 (Storage)': PRICING.r2.monthly,
    Meilisearch: PRICING.meilisearch.monthly || 0,
    'Resend (Email API)': PRICING.resend.subtotal,
    'Twilio (SMS)': PRICING.twilio.subtotal,
  }

  const total = Object.values(services).reduce((sum, cost) => sum + cost, 0)

  return {
    month: MONTH,
    date: TODAY,
    services,
    total,
    breakdown: {
      variable: 0, // R2 storage overage (if any)
      recurring: total,
    },
  }
}

function loadHistoryData() {
  if (fs.existsSync(costHistoryFile)) {
    try {
      const content = fs.readFileSync(costHistoryFile, 'utf-8')
      return JSON.parse(content)
    } catch (e) {
      console.warn(`Failed to parse cost history: ${e.message}`)
      return { entries: [] }
    }
  }
  return { entries: [] }
}

function saveHistoryData(history) {
  fs.writeFileSync(costHistoryFile, `${JSON.stringify(history, null, 2)}\n`)
}

function formatCurrencyUSD(amount) {
  return `$${amount.toFixed(2)}`
}

function calculateDelta(current, previous) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

function generateReport(current, history) {
  let report = `# Monthly Cost Review — ${TODAY}\n\n`

  report += `## Current Month (${MONTH}) MRR Summary\n\n`
  report += '| Service | Cost | Notes |\n'
  report += '|---------|------|-------|\n'

  for (const [service, cost] of Object.entries(current.services)) {
    report += `| ${service} | ${formatCurrencyUSD(cost)} | |\n`
  }

  report += `\n**Total MRR:** ${formatCurrencyUSD(current.total)}\n\n`

  // Service details
  report += '## Service Breakdown\n\n'

  report += '### Vercel\n'
  report += `- **Base (Pro):** ${formatCurrencyUSD(PRICING.vercel.hosting)}\n`
  report += `- **Web Analytics:** ${formatCurrencyUSD(PRICING.vercel.analytics)}\n`
  report += `- **Total:** ${formatCurrencyUSD(PRICING.vercel.subtotal)}\n\n`

  report += '### Supabase\n'
  report += '- **Plan:** Pro with branching enabled\n'
  report += `- **Base cost:** ${formatCurrencyUSD(PRICING.supabase.pro_base)}\n`
  report += `- **PITR Status:** DISABLED (would add ${formatCurrencyUSD(115)}/mo if enabled)\n`
  report += `- **Total:** ${formatCurrencyUSD(PRICING.supabase.subtotal)}\n\n`

  report += '### Cloudflare R2\n'
  report += '- **Status:** Using free tier (first 10GB included)\n'
  report += `- **Overage rate:** ${formatCurrencyUSD(PRICING.r2.per_gb)}/GB\n`
  report += `- **Total:** ${formatCurrencyUSD(PRICING.r2.monthly)}\n\n`

  report += '### Meilisearch\n'
  report += '- **Status:** Self-hosted or free tier\n'
  report += `- **Total:** ${formatCurrencyUSD(PRICING.meilisearch.monthly || 0)}\n\n`

  report += '### Resend (Email API)\n'
  report += `- **Rate:** ${formatCurrencyUSD(0.0001)}/email\n`
  report += `- **Estimated volume:** ${PRICING.resend.estimated_volume.toLocaleString()} emails/month\n`
  report += `- **Total:** ${formatCurrencyUSD(PRICING.resend.subtotal)}\n\n`

  report += '### Twilio (SMS)\n'
  report += `- **SMS rate (in/out):** ${formatCurrencyUSD(0.0075)}/SMS\n`
  report += `- **Phone number:** ${formatCurrencyUSD(PRICING.twilio.phone_number)}/month\n`
  report += `- **Estimated volume:** ${PRICING.twilio.estimated_sms.toLocaleString()} SMS/month\n`
  report += `- **Total:** ${formatCurrencyUSD(PRICING.twilio.subtotal)}\n\n`

  // Month-over-month comparison
  const lastEntry = history.entries[history.entries.length - 1]
  if (lastEntry) {
    const delta = calculateDelta(current.total, lastEntry.total)
    report += '## Month-over-Month Analysis\n\n'
    report += '| Metric | Previous | Current | Change |\n'
    report += '|--------|----------|---------|--------|\n'
    report += `| **Total MRR** | ${formatCurrencyUSD(lastEntry.total)} | ${formatCurrencyUSD(current.total)} | `

    if (delta > 0) {
      report += `⚠️ +${delta.toFixed(1)}%\n`
      if (Math.abs(delta) > 20) {
        report += '\n**ALERT:** MRR delta exceeds 20% threshold!\n'
      }
    } else if (delta < 0) {
      report += `✅ ${delta.toFixed(1)}%\n`
    } else {
      report += '➡️ No change\n'
    }
    report += '| | | | |\n'
  }

  // Historical trend
  if (history.entries.length > 1) {
    report += '\n## Historical Trend\n\n'
    report += '| Month | MRR | Change | |\n'
    report += '|-------|-----|--------|---|\n'

    const last6 = history.entries.slice(-6)
    for (let i = 0; i < last6.length; i++) {
      const entry = last6[i]
      const prev = i > 0 ? last6[i - 1] : null
      const delta = prev ? calculateDelta(entry.total, prev.total) : null
      report += `| ${entry.month} | ${formatCurrencyUSD(entry.total)} | `

      if (delta !== null) {
        if (delta > 0) {
          report += `+${delta.toFixed(1)}% | `
          report += Math.abs(delta) > 20 ? '⚠️' : ''
        } else if (delta < 0) {
          report += `${delta.toFixed(1)}% | `
        } else {
          report += '— | '
        }
      } else {
        report += '— | '
      }
      report += '|\n'
    }
  }

  // Recommendations
  report += '\n## Recommendations & Notes\n\n'
  report += '1. **Supabase PITR:** Consider enabling if disaster recovery is critical (~$115/mo)\n'
  report += '2. **R2 Storage:** Monitor overage costs as product catalog grows\n'
  report += '3. **Twilio/Resend:** Estimated volumes; collect actual usage metrics from APIs\n'
  report += '4. **Vercel:** Pro plan sufficient for current traffic; evaluate for scale-ups\n'
  report += '5. **Cost Monitoring:** Run this review monthly on the 18th to track trends\n\n'

  report += '## Next Steps\n\n'
  report += '- [ ] Verify actual API usage from Vercel, Resend, Twilio dashboards\n'
  report += '- [ ] Confirm R2 storage usage and overage charges\n'
  report += '- [ ] Monitor Supabase usage metrics (queries, storage growth)\n'
  report += '- [ ] Review Meilisearch plan if actively used\n'
  const nextMonth = new Date(new Date().setMonth(new Date().getMonth() + 1))
    .toISOString()
    .split('T')[0]
  report += `- [ ] Schedule next review for ${nextMonth}\n`

  return report
}

// Main execution
async function main() {
  console.log('📊 Monthly Cost Review for KenyonExpress')
  console.log(`📅 Month: ${MONTH}`)
  console.log(`📍 Date: ${TODAY}\n`)

  // Load history
  const history = loadHistoryData()

  // Calculate current month
  const current = calculateMRR()

  // Check for existing entry this month
  const existingIndex = history.entries.findIndex((e) => e.month === MONTH)
  if (existingIndex === -1) {
    history.entries.push(current)
  } else {
    // Update existing entry
    history.entries[existingIndex] = current
  }

  // Save updated history
  saveHistoryData(history)

  // Generate report
  const report = generateReport(current, history)

  // Write report
  const reportFile = path.join(docsDir, 'MONTHLY-COST-REVIEW.md')
  fs.writeFileSync(reportFile, report)

  console.log('✅ Cost Review Summary\n')
  console.log(`Total MRR: ${formatCurrencyUSD(current.total)}\n`)

  for (const [service, cost] of Object.entries(current.services)) {
    console.log(`  ${service.padEnd(25)} ${formatCurrencyUSD(cost).padStart(8)}`)
  }

  console.log('\n📈 Month-over-Month:')
  const lastEntry = history.entries[history.entries.length - 2]
  if (lastEntry) {
    const delta = calculateDelta(current.total, lastEntry.total)
    console.log(`  Previous month: ${formatCurrencyUSD(lastEntry.total)}`)
    console.log(`  Current month:  ${formatCurrencyUSD(current.total)}`)
    console.log(`  Delta:          ${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`)

    if (Math.abs(delta) > 20) {
      console.error('\n⚠️  ALERT: MRR delta exceeds 20% threshold!')
      process.exit(1)
    }
  } else {
    console.log('  (First month - no comparison data)')
  }

  console.log('\n📄 Full report: docs/MONTHLY-COST-REVIEW.md')
  console.log('📊 History data: docs/COST-HISTORY.json')
}

main().catch((err) => {
  console.error('❌ Error during cost review:', err)
  process.exit(1)
})
