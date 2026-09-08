import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { baselineFromBaseTree, leftOf, parseLedger, scanContent } from './hardcoded-gate-lib.mjs'

describe('scanContent', () => {
  it('counts hex colours and px lengths', () => {
    const hits = scanContent('const a = "#fed700"\nconst b = "16px"\n')
    expect(hits.map((h) => h.value)).toEqual(['#fed700', '16px'])
    expect(hits[1].line).toBe(2)
  })

  it('ignores values that only appear in a comment', () => {
    expect(scanContent('// #fed700 and 16px are documented here\n')).toHaveLength(0)
    expect(scanContent(' * #fed700\n')).toHaveLength(0)
    expect(scanContent('/* 16px */\n')).toHaveLength(0)
  })

  it('counts every occurrence on a line, not one per line', () => {
    expect(scanContent('padding:13px 18px;border-radius:10px')).toHaveLength(3)
  })
})

describe('leftOf', () => {
  it('reads the base off a two-dot and a three-dot range', () => {
    expect(leftOf('origin/main..HEAD')).toBe('origin/main')
    expect(leftOf('origin/main...HEAD')).toBe('origin/main')
  })

  it('falls back to the previous commit when there is no range', () => {
    expect(leftOf('HEAD')).toBe('HEAD~1')
  })
})

describe('parseLedger', () => {
  it('counts one row per hit, per file', () => {
    const counts = parseLedger(
      [
        '| File | Line | Value | Suggested token |',
        '| --- | --- | --- | --- |',
        '| src/a.ts | 1 | `#fed700` | --color-brand-primary |',
        '| src/a.ts | 2 | `16px` | (none) |',
        '| src/b.css | 9 | `2px` | (none) |',
      ].join('\n'),
    )
    expect(counts).toEqual({ 'src/a.ts': 2, 'src/b.css': 1 })
  })

  it('does not count the header or the separator as files', () => {
    expect(
      parseLedger('| File | Line | Value | Suggested token |\n| --- | --- | --- | --- |'),
    ).toEqual({})
  })
})

/**
 * THE CASE THIS EXISTS FOR, AND IT IS NOT HYPOTHETICAL.
 *
 * docs/hardcoded-audit.md is dated 2026-08-31 and carries no row for
 * src/lib/email/magic-link.ts, which was written afterwards. The gate therefore
 * scored a file that main already holds against a baseline of 0 and blocked
 * pull request #34 with `0 -> 23` -- while that branch had LOWERED the count
 * from main's 29 by replacing six literal colours with imported constants.
 *
 * These read real git objects rather than a fixture, because the property under
 * test is precisely that the base tree, not a written-down number, is what the
 * baseline comes from.
 */
describe('baselineFromBaseTree', () => {
  const trackedFile = 'scripts/audit-hardcoded.mjs'

  it('reports what a file held at the named commit', () => {
    const atHead = baselineFromBaseTree(trackedFile, 'HEAD')
    const committed = execFileSync('git', ['show', `HEAD:${trackedFile}`], { encoding: 'utf8' })
    expect(atHead).toBe(scanContent(committed).length)
  })

  it('answers null for a path the commit does not have, so a genuinely new file starts at 0', () => {
    expect(baselineFromBaseTree('src/this/does/not/exist.ts', 'HEAD')).toBeNull()
  })
})
