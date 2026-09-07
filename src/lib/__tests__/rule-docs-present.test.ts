import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * W2-A entry docs. The audit loop mandate named BUSINESS-MODEL-RULES.md and
 * docs/PRODUCT-TYPES.md; both were renamed. A loop that opens ghosts cannot
 * prove the rules still hold. These paths are the ones that exist and bind.
 */
const RULE_DOCS = [
  'docs/BUSINESS-RULES.md',
  'docs/BUSINESS-MODEL.md',
  'docs/ARCHITECTURE-PRODUCT-TYPES.md',
  'docs/DB-SECURITY-MODEL.md',
] as const

describe('W2-A rule docs are present under their real names', () => {
  for (const rel of RULE_DOCS) {
    it(rel, () => {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true)
    })
  }

  it('does not leave the mandate ghost names as the only copies', () => {
    expect(existsSync(resolve(process.cwd(), 'BUSINESS-MODEL-RULES.md'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'docs/PRODUCT-TYPES.md'))).toBe(false)
  })
})
