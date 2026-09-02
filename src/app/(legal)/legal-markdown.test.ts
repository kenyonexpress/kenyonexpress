import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

const DOCS = {
  terms: join(ROOT, 'docs/TERMS-OF-SERVICE.md'),
  privacy: join(ROOT, 'docs/PRIVACY-POLICY.md'),
  accessibility: join(ROOT, 'docs/ACCESSIBILITY.md'),
  returns: join(ROOT, 'docs/RETURNS-POLICY.md'),
} as const

describe('published legal markdown copies', () => {
  it('all four files exist', () => {
    for (const path of Object.values(DOCS)) {
      expect(existsSync(path), path).toBe(true)
    }
  })

  it('terms name Israeli commerce law and Cardcom T&C', () => {
    const text = readFileSync(DOCS.terms, 'utf8')
    expect(text).toContain('חוק הגנת הצרכן')
    expect(text).toContain('תנאי השימוש של Cardcom')
    expect(text).not.toMatch(/escrow|נאמנות/)
  })

  it('privacy names GDPR and the export/delete endpoints', () => {
    const text = readFileSync(DOCS.privacy, 'utf8')
    expect(text).toContain('GDPR')
    expect(text).toContain('חוק הגנת הפרטיות')
    expect(text).toContain('/api/account/data-export')
    expect(text).toContain('/api/account/data-delete')
    expect(text).toContain('אין PAN')
  })

  it('accessibility names IS 5568', () => {
    const text = readFileSync(DOCS.accessibility, 'utf8')
    expect(text).toContain('5568')
  })

  it('returns names Consumer Protection Law, 14 days, and voucher rules', () => {
    const text = readFileSync(DOCS.returns, 'utf8')
    expect(text).toContain('חוק הגנת הצרכן')
    expect(text).toContain('14 יום')
    expect(text).toContain('issued')
  })
})
