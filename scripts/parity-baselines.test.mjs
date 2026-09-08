import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { regressionNote } from './parity-log.mjs'

/**
 * The second question, asked beside a verdict that cannot change.
 *
 * At 380 and 768 the 11% gate is unreachable against this reference and always
 * will be: it dropped 57 scripts and 37 fonts, refs/live-assets captured zero
 * of either, and the origin answers 403. A row that reads **FAIL** on every run
 * for a reason nobody can fix teaches a reader to skip the column, so the
 * baseline asks whether today is worse than the best that reference has ever
 * allowed.
 */
const data = JSON.parse(
  readFileSync(resolve(process.cwd(), 'scripts/parity-baselines.json'), 'utf8'),
)

describe('the baseline file', () => {
  it('records the widths that are measured', () => {
    expect(Object.keys(data.pages.home).sort()).toEqual(['1440', '380', '768'])
  })

  it('says why the ceiling is unreachable, so the numbers are not read as targets', () => {
    expect(data['why-unreachable']).toMatch(/403/)
    expect(data['why-unreachable']).toMatch(/ZERO/)
  })

  it('keeps a tolerance wide enough for build noise and narrow enough to catch a regression', () => {
    expect(data.tolerance).toBeGreaterThan(0.1)
    expect(data.tolerance).toBeLessThan(2)
  })
})

describe('regressionNote', () => {
  it('is silent at the measured value', () => {
    expect(regressionNote('home', 1440, 8.29)).toBe('')
    expect(regressionNote('home', 380, 30.26)).toBe('')
  })

  it('is silent for an improvement', () => {
    expect(regressionNote('home', 380, 12.0)).toBe('')
  })

  it('is silent inside the tolerance, because builds wobble', () => {
    expect(regressionNote('home', 1440, 8.29 + data.tolerance)).toBe('')
  })

  // The case it exists for: still over 11%, so the verdict column says FAIL as
  // it always has, but this run is worse than the reference has ever allowed.
  it('speaks when a width degrades past the tolerance', () => {
    const note = regressionNote('home', 380, 30.26 + data.tolerance + 0.01)
    expect(note).toContain('WORSE')
    expect(note).toContain('30.26')
  })

  it('names the page and width, so a report row is actionable on its own', () => {
    expect(regressionNote('home', 768, 40)).toContain('home/768')
  })

  // No baseline is not a pass: it must say nothing rather than imply health.
  it('is silent for a page or width it has never measured', () => {
    expect(regressionNote('checkout', 1440, 99)).toBe('')
    expect(regressionNote('home', 1000, 99)).toBe('')
  })
})
