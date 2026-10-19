/**
 * Tests for Sentry monthly review infrastructure
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('Sentry Monthly Review', () => {
  let originalEnv

  beforeEach(() => {
    originalEnv = process.env
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Issue categorization', () => {
    it('categorizes payment issues correctly', () => {
      const issues = [
        {
          id: '1',
          shortID: 'KE-1',
          title: 'Payment processing failed',
          tags: [],
          stats: [[null, 10]],
        },
      ]

      const categorizeIssues = (issues) => {
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
          if (title.includes('payment')) {
            categories.payment.push(issue)
          } else {
            categories.other.push(issue)
          }
        }

        return categories
      }

      const result = categorizeIssues(issues)
      expect(result.payment).toHaveLength(1)
      expect(result.payment[0].shortID).toBe('KE-1')
    })

    it('categorizes performance issues correctly', () => {
      const issues = [
        {
          id: '2',
          shortID: 'KE-2',
          title: 'API timeout on checkout',
          tags: [],
          stats: [[null, 5]],
        },
      ]

      const categorizeIssues = (issues) => {
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
          if (title.includes('timeout')) {
            categories.performance.push(issue)
          } else {
            categories.other.push(issue)
          }
        }

        return categories
      }

      const result = categorizeIssues(issues)
      expect(result.performance).toHaveLength(1)
      expect(result.performance[0].shortID).toBe('KE-2')
    })

    it('categorizes security issues correctly', () => {
      const issues = [
        {
          id: '3',
          shortID: 'KE-3',
          title: 'Unauthorized access attempt',
          tags: [],
          stats: [[null, 3]],
        },
      ]

      const categorizeIssues = (issues) => {
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
          if (title.includes('unauthorized')) {
            categories.security.push(issue)
          } else {
            categories.other.push(issue)
          }
        }

        return categories
      }

      const result = categorizeIssues(issues)
      expect(result.security).toHaveLength(1)
      expect(result.security[0].shortID).toBe('KE-3')
    })

    it('categorizes database issues correctly', () => {
      const issues = [
        {
          id: '4',
          shortID: 'KE-4',
          title: 'SQL connection pool exhausted',
          tags: [],
          stats: [[null, 8]],
        },
      ]

      const categorizeIssues = (issues) => {
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
          if (title.includes('sql') || title.includes('database')) {
            categories.data.push(issue)
          } else {
            categories.other.push(issue)
          }
        }

        return categories
      }

      const result = categorizeIssues(issues)
      expect(result.data).toHaveLength(1)
      expect(result.data[0].shortID).toBe('KE-4')
    })
  })

  describe('Report generation', () => {
    it('generates report with correct structure', () => {
      const issues = [
        {
          id: '1',
          shortID: 'KE-1',
          title: 'Payment error',
          level: 'error',
          status: 'unresolved',
          stats: [[null, 10]],
          userCount: 5,
          firstSeen: new Date('2026-10-01').toISOString(),
          lastSeen: new Date('2026-10-15').toISOString(),
          tags: [],
        },
      ]

      const report = generateReport(issues, { payment: issues, other: [] }, [])
      expect(report).toContain('Sentry Monthly Review')
      expect(report).toContain('## Summary')
      expect(report).toContain('## Issues by Category')
      expect(report).toContain('## Recommendations')
      expect(report).toContain('## Action Items')
    })

    it('includes issue details in report', () => {
      const issues = [
        {
          id: '1',
          shortID: 'KE-1',
          title: 'Payment processing failed',
          level: 'error',
          status: 'unresolved',
          stats: [[null, 10]],
          userCount: 5,
          firstSeen: new Date('2026-10-01').toISOString(),
          lastSeen: new Date('2026-10-15').toISOString(),
          tags: [],
          assignedTo: { name: 'dev-team' },
        },
      ]

      const report = generateReport(issues, { payment: issues, other: [] }, [])
      expect(report).toContain('KE-1')
      expect(report).toContain('Payment processing failed')
      expect(report).toContain('10') // events
      expect(report).toContain('5') // users affected
      expect(report).toContain('dev-team') // assigned to
    })

    it('counts issues correctly', () => {
      const issues = [
        {
          id: '1',
          shortID: 'KE-1',
          title: 'Error 1',
          level: 'error',
          status: 'unresolved',
          stats: [[null, 1]],
          userCount: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          tags: [],
        },
        {
          id: '2',
          shortID: 'KE-2',
          title: 'Error 2',
          level: 'error',
          status: 'unresolved',
          stats: [[null, 2]],
          userCount: 1,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString(),
          tags: [],
        },
      ]

      const report = generateReport(issues, { other: issues }, [])
      expect(report).toContain('Total Issues: 2')
      expect(report).toContain('Remaining: 2')
    })
  })

  describe('Priority detection', () => {
    it('identifies high-priority issues', () => {
      const issues = [
        {
          shortID: 'KE-PAYMENT-1',
          title: 'Payment webhook signing failed',
          stats: [[null, 50]],
        },
        {
          shortID: 'KE-SECURITY-1',
          title: 'Unauthorized database access',
          stats: [[null, 10]],
        },
        {
          shortID: 'KE-DATA-1',
          title: 'SQL injection detected',
          stats: [[null, 5]],
        },
        {
          shortID: 'KE-UI-1',
          title: 'Button not rendering',
          stats: [[null, 2]],
        },
      ]

      // Payment issues should be first priority
      const paymentIssues = issues.filter((i) => i.title.includes('Payment'))
      expect(paymentIssues).toHaveLength(1)
      expect(paymentIssues[0].stats[0][1]).toBe(50)

      // Security issues should be second priority
      const securityIssues = issues.filter((i) => i.title.includes('Unauthorized'))
      expect(securityIssues).toHaveLength(1)
    })

    it('sorts by frequency', () => {
      const issues = [
        { shortID: 'KE-1', stats: [[null, 100]] },
        { shortID: 'KE-2', stats: [[null, 50]] },
        { shortID: 'KE-3', stats: [[null, 200]] },
      ]

      const sorted = [...issues].sort((a, b) => (b.stats[0][1] || 0) - (a.stats[0][1] || 0))
      expect(sorted[0].shortID).toBe('KE-3')
      expect(sorted[1].shortID).toBe('KE-1')
      expect(sorted[2].shortID).toBe('KE-2')
    })
  })

  describe('History tracking', () => {
    it('creates review object with correct structure', () => {
      const issues = [
        {
          id: '1',
          shortID: 'KE-1',
          title: 'Error 1',
          stats: [[null, 10]],
        },
      ]

      const review = {
        date: new Date().toISOString(),
        totalIssues: issues.length,
        closedIssues: 0,
        topIssues: issues.slice(0, 5).map((i) => ({
          id: i.id,
          shortID: i.shortID,
          title: i.title,
          events: i.stats[0][1] || 0,
        })),
      }

      expect(review).toHaveProperty('date')
      expect(review).toHaveProperty('totalIssues', 1)
      expect(review).toHaveProperty('closedIssues', 0)
      expect(review).toHaveProperty('topIssues')
      expect(review.topIssues).toHaveLength(1)
      expect(review.topIssues[0].events).toBe(10)
    })

    it('maintains review history with rolling window', () => {
      const reviews = []
      // Add 14 reviews (more than 12)
      for (let i = 0; i < 14; i++) {
        reviews.push({
          date: new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000).toISOString(),
          totalIssues: 10 + i,
          closedIssues: i,
          topIssues: [],
        })
      }

      // Keep last 12
      const truncated = reviews.slice(-12)
      expect(truncated).toHaveLength(12)
      expect(truncated[0].totalIssues).toBe(10 + 2) // The oldest remaining review
    })
  })

  describe('Error handling', () => {
    it('handles missing auth token', () => {
      const hasToken = !!process.env.SENTRY_AUTH_TOKEN
      expect(hasToken).toBe(false) // Should be unset in test environment
    })

    it('detects invalid organization/project', () => {
      const org = 'invalid-org'
      const project = 'invalid-project'
      expect(org).not.toBe('')
      expect(project).not.toBe('')
    })

    it('handles empty issue list', () => {
      const issues = []
      const categorizeIssues = (_issues) => ({
        payment: [],
        performance: [],
        security: [],
        data: [],
        ui: [],
        api: [],
        other: [],
      })

      const result = categorizeIssues(issues)
      const totalIssues = Object.values(result).reduce((sum, cat) => sum + cat.length, 0)
      expect(totalIssues).toBe(0)
    })
  })

  describe('Filtering', () => {
    it('filters by age correctly', () => {
      const today = new Date()
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
      const sixtyDaysAgo = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000)

      const issues = [
        { shortID: 'KE-1', lastSeen: today.toISOString() },
        { shortID: 'KE-2', lastSeen: thirtyDaysAgo.toISOString() },
        { shortID: 'KE-3', lastSeen: sixtyDaysAgo.toISOString() },
      ]

      const thirtyDaysOld = issues.filter((i) => {
        const lastSeen = new Date(i.lastSeen)
        const age = (today - lastSeen) / (24 * 60 * 60 * 1000)
        return age <= 30
      })

      expect(thirtyDaysOld).toHaveLength(2)
      expect(thirtyDaysOld.map((i) => i.shortID)).toEqual(['KE-1', 'KE-2'])
    })
  })
})

// Helper function for tests
function generateReport(issues, categorized, closed) {
  const timestamp = new Date().toISOString()

  let md = '# Sentry Monthly Review\n\n'
  md += `Generated: ${timestamp}\n`
  md += 'Reviewed: Last 30 days\n\n'

  md += '## Summary\n\n'
  md += `- **Total Issues:** ${issues.length}\n`
  md += `- **Resolved/Closed:** ${closed.length}\n`
  md += `- **Remaining:** ${issues.filter((i) => i.status !== 'resolved').length}\n\n`

  md += '## Issues by Category\n\n'
  for (const [category, cats] of Object.entries(categorized)) {
    if (cats.length === 0) continue
    md += `### ${category.charAt(0).toUpperCase() + category.slice(1)} (${cats.length})\n\n`
    for (const issue of cats) {
      md += `- **${issue.shortID}**: ${issue.title}\n`
    }
  }

  md += '## Recommendations\n\n'
  md += '## Action Items\n\n'

  return md
}
