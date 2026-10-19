#!/usr/bin/env node
/**
 * Monthly Sentry Error Review
 *
 * Fetches top 20 error patterns from Sentry, closes resolved ones,
 * prioritizes remaining, and generates a comprehensive review report.
 *
 * Requirements:
 * - SENTRY_AUTH_TOKEN: API token from https://sentry.io/settings/account/api/auth-tokens/
 * - SENTRY_ORG: Organization slug (e.g., 'kenyonexpress')
 * - SENTRY_PROJECT: Project slug (e.g., 'kenyonexpress-web')
 *
 * Usage:
 * node scripts/sentry-monthly-review.mjs [--dry-run] [--limit 20] [--days 30]
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(import.meta.url), '..')

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN
const SENTRY_ORG = process.env.SENTRY_ORG || 'kenyonexpress'
const SENTRY_PROJECT = process.env.SENTRY_PROJECT || 'kenyonexpress-web'
const SENTRY_HOST = process.env.SENTRY_HOST || 'https://sentry.io'

const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const limit = Number.parseInt(args.find((a) => a.startsWith('--limit='))?.split('=')[1] || '20', 10)
const days = Number.parseInt(args.find((a) => a.startsWith('--days='))?.split('=')[1] || '30', 10)

const historyFile = resolve(__dirname, '../docs/SENTRY-REVIEW-HISTORY.json')
const reportFile = resolve(__dirname, '../docs/SENTRY-MONTHLY-REVIEW.md')

/**
 * Fetch issues from Sentry API
 */
async function fetchSentryIssues() {
  if (!SENTRY_AUTH_TOKEN) {
    console.error('❌ SENTRY_AUTH_TOKEN not set. Cannot fetch issues.')
    console.error('   Get token from: https://sentry.io/settings/account/api/auth-tokens/')
    process.exit(1)
  }

  const baseUrl = `${SENTRY_HOST}/api/0/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/`
  const params = new URLSearchParams({
    query: `is:unresolved age:-${days}d`,
    limit: Math.min(limit, 100), // Sentry API limits to 100
    sort: '-frequency',
  })

  const response = await fetch(`${baseUrl}?${params}`, {
    headers: {
      Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    if (response.status === 401) {
      console.error('❌ Invalid Sentry auth token. Check SENTRY_AUTH_TOKEN.')
      process.exit(1)
    }
    throw new Error(`Sentry API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Close resolved issues
 */
async function closeResolvedIssues(issues) {
  const resolved = issues.filter((i) => i.status === 'resolved')

  if (resolved.length === 0) {
    console.log('✅ No resolved issues to close')
    return []
  }

  if (isDryRun) {
    console.log(`🔍 [DRY RUN] Would close ${resolved.length} resolved issues:`)
    for (const i of resolved) {
      console.log(`   - ${i.shortID}: ${i.title}`)
    }
    return resolved
  }

  const closed = []
  for (const issue of resolved) {
    try {
      const response = await fetch(`${SENTRY_HOST}/api/0/issues/${issue.id}/`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'ignored' }),
      })

      if (response.ok) {
        closed.push(issue)
        console.log(`✅ Ignored: ${issue.shortID}`)
      }
    } catch (err) {
      console.error(`⚠️ Failed to close ${issue.shortID}:`, err.message)
    }
  }

  return closed
}

/**
 * Categorize and prioritize issues
 */
function prioritizeIssues(issues) {
  const categories = {
    payment: [],
    performance: [],
    security: [],
    data: [],
    ui: [],
    api: [],
    other: [],
  }

  for (const issue of issues) {
    const title = issue.title.toLowerCase()
    const tags = (issue.tags || []).map((t) => t.key)

    if (
      title.includes('payment') ||
      tags.includes('payment') ||
      issue.tags?.some((t) => t.key === 'area' && t.value === 'payments')
    ) {
      categories.payment.push(issue)
    } else if (
      title.includes('timeout') ||
      title.includes('latency') ||
      tags.includes('performance')
    ) {
      categories.performance.push(issue)
    } else if (title.includes('sql') || title.includes('database') || tags.includes('database')) {
      categories.data.push(issue)
    } else if (
      title.includes('unauthorized') ||
      title.includes('forbidden') ||
      tags.includes('security')
    ) {
      categories.security.push(issue)
    } else if (title.includes('render') || title.includes('ui') || title.includes('component')) {
      categories.ui.push(issue)
    } else if (title.includes('api') || title.includes('endpoint') || title.includes('route')) {
      categories.api.push(issue)
    } else {
      categories.other.push(issue)
    }
  }

  // Sort each category by frequency
  for (const cat of Object.values(categories)) {
    cat.sort((a, b) => (b.stats?.[0]?.[1] || 0) - (a.stats?.[0]?.[1] || 0))
  }

  return categories
}

/**
 * Generate markdown report
 */
function generateReport(issues, categorized, closed) {
  const timestamp = new Date().toISOString()
  const month = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })

  let md = `# Sentry Monthly Review — ${month}\n\n`
  md += `Generated: ${timestamp}\n`
  md += `Reviewed: Last ${days} days\n\n`

  md += '## Summary\n\n'
  md += `- **Total Issues:** ${issues.length}\n`
  md += `- **Resolved/Closed:** ${closed.length}\n`
  md += `- **Remaining:** ${issues.filter((i) => i.status === 'unresolved').length}\n\n`

  md += '## Issues by Category\n\n'
  for (const [category, cats] of Object.entries(categorized)) {
    if (cats.length === 0) continue

    md += `### ${category.charAt(0).toUpperCase() + category.slice(1)} (${cats.length})\n\n`
    for (const issue of cats) {
      const freq = issue.stats?.[0]?.[1] || 0
      const level = issue.level || 'error'
      const emoji = { fatal: '🔴', error: '🟠', warning: '🟡', info: '🔵' }[level] || '⚪'

      md += `#### ${emoji} ${issue.shortID}: ${issue.title}\n\n`
      md += `- **Events:** ${freq}\n`
      md += `- **Users Affected:** ${issue.userCount || 0}\n`
      md += `- **Last Seen:** ${new Date(issue.lastSeen).toLocaleDateString()}\n`
      md += `- **First Seen:** ${new Date(issue.firstSeen).toLocaleDateString()}\n`
      md += `- **Status:** ${issue.status}\n`
      if (issue.assignedTo) {
        md += `- **Assigned:** ${issue.assignedTo.name}\n`
      }
      md += `- **Link:** [View in Sentry](${SENTRY_HOST}/organizations/${SENTRY_ORG}/issues/${issue.id}/)\n\n`
    }
  }

  md += '## Recommendations\n\n'
  const highPriority = [
    ...categorized.payment.slice(0, 3),
    ...categorized.security.slice(0, 3),
    ...categorized.data.slice(0, 3),
  ].filter(Boolean)

  if (highPriority.length > 0) {
    md += '### Immediate Action (High Priority)\n\n'
    for (const issue of highPriority.slice(0, 5)) {
      md += `- [ ] **${issue.shortID}**: ${issue.title} (${issue.stats?.[0]?.[1] || 0} events)\n`
    }
    md += '\n'
  }

  const mediumPriority = [
    ...categorized.api.slice(0, 3),
    ...categorized.performance.slice(0, 3),
  ].filter(Boolean)

  if (mediumPriority.length > 0) {
    md += '### This Week (Medium Priority)\n\n'
    for (const issue of mediumPriority.slice(0, 5)) {
      md += `- [ ] **${issue.shortID}**: ${issue.title} (${issue.stats?.[0]?.[1] || 0} events)\n`
    }
    md += '\n'
  }

  md += '## Action Items\n\n'
  md += '- [ ] Review and assign high-priority issues\n'
  md += '- [ ] Close duplicate issues\n'
  md += '- [ ] Update issue severity where appropriate\n'
  md += '- [ ] Create GitHub issues for critical problems\n'
  md += '- [ ] Schedule fix for next sprint\n\n'

  md += '---\n\n'
  md += '**Next Review:** First day of next month\n'
  md += '**Automation:** Run via `pnpm sentry:review`\n'

  return md
}

/**
 * Load historical reviews
 */
function loadHistory() {
  if (!existsSync(historyFile)) return { reviews: [] }
  try {
    return JSON.parse(readFileSync(historyFile, 'utf8'))
  } catch {
    return { reviews: [] }
  }
}

/**
 * Save review to history
 */
function saveReview(issues, closed) {
  const history = loadHistory()
  const review = {
    date: new Date().toISOString(),
    totalIssues: issues.length,
    closedIssues: closed.length,
    topIssues: issues.slice(0, 5).map((i) => ({
      id: i.id,
      shortID: i.shortID,
      title: i.title,
      events: i.stats?.[0]?.[1] || 0,
    })),
  }

  history.reviews.push(review)
  // Keep last 12 reviews
  if (history.reviews.length > 12) {
    history.reviews = history.reviews.slice(-12)
  }

  writeFileSync(historyFile, JSON.stringify(history, null, 2))
}

/**
 * Main flow
 */
async function main() {
  try {
    console.log('🔍 Sentry Monthly Review')
    console.log(`   Organization: ${SENTRY_ORG}`)
    console.log(`   Project: ${SENTRY_PROJECT}`)
    console.log(`   Period: Last ${days} days`)
    console.log(`   Limit: ${limit} issues\n`)

    if (isDryRun) {
      console.log('⚠️  DRY RUN MODE - No changes will be made\n')
    }

    console.log('⏳ Fetching issues...')
    const issues = await fetchSentryIssues()

    console.log(`✅ Found ${issues.length} unresolved issues`)

    console.log('⏳ Closing resolved issues...')
    const closed = await closeResolvedIssues(issues)

    const remaining = issues.filter((i) => i.status !== 'resolved')

    console.log('⏳ Categorizing issues...')
    const categorized = prioritizeIssues(remaining)

    console.log('⏳ Generating report...')
    const report = generateReport(issues, categorized, closed)

    if (!isDryRun) {
      writeFileSync(reportFile, report)
      saveReview(issues, closed)
      console.log(`✅ Report saved: ${reportFile}`)
      console.log(`✅ History updated: ${historyFile}`)
    } else {
      console.log('🔍 [DRY RUN] Report would be saved to:', reportFile)
    }

    console.log('\n📊 Summary:')
    console.log(`   Total: ${issues.length}`)
    console.log(`   Closed: ${closed.length}`)
    console.log(`   Remaining: ${remaining.length}`)
    console.log('   By category:')
    for (const [cat, items] of Object.entries(categorized)) {
      if (items.length > 0) {
        console.log(`     - ${cat}: ${items.length}`)
      }
    }
  } catch (err) {
    console.error('❌ Error:', err.message)
    process.exit(1)
  }
}

main()
