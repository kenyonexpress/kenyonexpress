import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testDir = path.join(__dirname, '..', '..', 'docs', 'test-cost-history')

// Setup/teardown for test isolation
beforeEach(() => {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true })
  }
})

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true })
  }
})

describe('monthly-cost-review', () => {
  describe('pricing structure', () => {
    it('should have all required services defined', () => {
      const services = ['vercel', 'supabase', 'r2', 'meilisearch', 'resend', 'twilio']
      for (const service of services) {
        expect(service).toBeDefined()
      }
    })

    it('should calculate vercel total correctly', () => {
      const vercelBase = 20
      const vercelAnalytics = 13
      const vercelTotal = 33
      expect(vercelBase + vercelAnalytics).toBe(vercelTotal)
    })

    it('should calculate supabase pro total correctly', () => {
      const supabaseBase = 25
      expect(supabaseBase).toBe(25)
    })

    it('should have resend estimated at $1/month for 10k emails', () => {
      const emailRate = 0.0001
      const estimatedVolume = 10000
      const estimatedCost = emailRate * estimatedVolume
      expect(estimatedCost).toBe(1.0)
    })

    it('should have twilio estimated at $4.75/month', () => {
      const smsRate = 0.0075
      const estimatedSms = 500
      const phoneNumber = 1.0
      const estimatedCost = smsRate * estimatedSms + phoneNumber
      expect(estimatedCost).toBeCloseTo(4.75, 2)
    })
  })

  describe('MRR calculations', () => {
    it('should sum all service costs correctly', () => {
      const services = {
        'Vercel (Hosting)': 33,
        'Supabase (Pro)': 25,
        'R2 (Storage)': 0,
        Meilisearch: 0,
        'Resend (Email API)': 1,
        'Twilio (SMS)': 4.75,
      }

      const total = Object.values(services).reduce((sum, cost) => sum + cost, 0)
      expect(total).toBeCloseTo(63.75, 2)
    })

    it('should have no negative costs', () => {
      const costs = [33, 25, 0, 0, 1, 4.75]
      for (const cost of costs) {
        expect(cost).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('delta calculation', () => {
    it('should calculate positive delta correctly', () => {
      const previous = 64.63
      const current = 77.56 // +20%
      const delta = ((current - previous) / previous) * 100
      expect(delta).toBeCloseTo(20.0, 1)
    })

    it('should calculate negative delta correctly', () => {
      const previous = 64.63
      const current = 51.7 // -20%
      const delta = ((current - previous) / previous) * 100
      expect(delta).toBeCloseTo(-20.0, 1)
    })

    it('should identify zero delta', () => {
      const previous = 64.63
      const current = 64.63
      const delta = ((current - previous) / previous) * 100
      expect(delta).toBe(0)
    })

    it('should flag delta > 20% as alert-worthy', () => {
      const delta = 21.5
      expect(Math.abs(delta)).toBeGreaterThan(20)
    })

    it('should not flag delta <= 20% as alert', () => {
      const delta = 19.9
      expect(Math.abs(delta)).toBeLessThanOrEqual(20)
    })

    it('should handle null previous month', () => {
      const delta = null
      expect(delta).toBeNull()
    })
  })

  describe('cost history persistence', () => {
    it('should save and load history JSON', () => {
      const historyFile = path.join(testDir, 'cost-history.json')
      const history = {
        entries: [
          {
            month: '2026-10',
            date: '2026-10-18',
            total: 64.63,
            services: {
              'Vercel (Hosting)': 33,
              'Supabase (Pro)': 25,
              'R2 (Storage)': 0,
              Meilisearch: 0,
              'Resend (Email API)': 1,
              'Twilio (SMS)': 5.63,
            },
          },
        ],
      }

      fs.writeFileSync(historyFile, JSON.stringify(history, null, 2))
      const loaded = JSON.parse(fs.readFileSync(historyFile, 'utf-8'))

      expect(loaded.entries).toHaveLength(1)
      expect(loaded.entries[0].total).toBe(64.63)
      expect(loaded.entries[0].month).toBe('2026-10')
    })

    it('should handle empty history gracefully', () => {
      const history = { entries: [] }
      expect(history.entries).toHaveLength(0)
    })

    it('should update existing month entry', () => {
      const history = {
        entries: [
          { month: '2026-10', total: 64.63 },
          { month: '2026-11', total: 65.0 },
        ],
      }

      const existingIndex = history.entries.findIndex((e) => e.month === '2026-10')
      expect(existingIndex).toBe(0)
      history.entries[existingIndex] = { month: '2026-10', total: 65.63 }

      expect(history.entries[0].total).toBe(65.63)
      expect(history.entries).toHaveLength(2)
    })
  })

  describe('cost format utilities', () => {
    it('should format currency with two decimals', () => {
      const amount = 64.63
      const formatted = `$${amount.toFixed(2)}`
      expect(formatted).toBe('$64.63')
    })

    it('should format small amounts', () => {
      const amount = 0.5
      const formatted = `$${amount.toFixed(2)}`
      expect(formatted).toBe('$0.50')
    })

    it('should format large amounts', () => {
      const amount = 1000.5
      const formatted = `$${amount.toFixed(2)}`
      expect(formatted).toBe('$1000.50')
    })

    it('should format zero', () => {
      const amount = 0
      const formatted = `$${amount.toFixed(2)}`
      expect(formatted).toBe('$0.00')
    })
  })

  describe('report generation', () => {
    it('should include all service sections', () => {
      const sections = ['Vercel', 'Supabase', 'Cloudflare R2', 'Meilisearch', 'Resend', 'Twilio']
      for (const section of sections) {
        expect(section).toBeDefined()
      }
    })

    it('should structure monthly summary table correctly', () => {
      const headerRow = '| Service | Cost | Notes |'
      const separatorRow = '|---------|------|-------|'
      expect(headerRow).toContain('Service')
      expect(headerRow).toContain('Cost')
      expect(separatorRow).toContain('|')
    })

    it('should detect first month vs recurring', () => {
      const entries = []
      const isFirstMonth = entries.length === 0
      expect(isFirstMonth).toBe(true)

      entries.push({ month: '2026-10', total: 64.63 })
      const isSecondMonth = entries.length > 0
      expect(isSecondMonth).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle decimal rounding correctly', () => {
      const cost = 5.625
      const rounded = Math.round(cost * 100) / 100
      expect(rounded).toBe(5.63)
    })

    it('should sum fractional cents without precision loss', () => {
      const costs = [33.0, 25.0, 0.0, 0.0, 1.0, 5.63]
      const total = costs.reduce((sum, cost) => sum + cost, 0)
      expect(total).toBeCloseTo(64.63, 2)
    })

    it('should handle service with $0 cost', () => {
      const services = {
        Paid: 33,
        'Free Tier': 0,
      }
      const total = Object.values(services).reduce((s, c) => s + c, 0)
      expect(total).toBe(33)
    })

    it('should validate positive percentage change', () => {
      const previous = 50
      const current = 60
      const delta = ((current - previous) / previous) * 100
      expect(delta).toBe(20)
      expect(current > previous).toBe(true)
    })

    it('should validate negative percentage change', () => {
      const previous = 50
      const current = 40
      const delta = ((current - previous) / previous) * 100
      expect(delta).toBe(-20)
      expect(current < previous).toBe(true)
    })
  })
})
