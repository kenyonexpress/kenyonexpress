import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE READINESS SUMMARY MUST KEEP MATCHING ITS OWN TABLE.
 *
 * `docs/LAUNCH-READINESS-2026-09-08.md` was amended in six separate passes -
 * four steps moved from done to warning, one moved the other way, two risks were
 * rewritten and two MANUAL items were added. A summary assembled from eight
 * corrections drifts from the table under it, and the summary is the part people
 * read.
 *
 * This recomputes the counts from the tables and holds the prose to them. It is
 * the same guard as `src/lib/cache-policy.test.ts`, for the same reason: a
 * document nobody checks becomes a document that is believed and wrong.
 */

const DOC = readFileSync(resolve(process.cwd(), 'docs/LAUNCH-READINESS-2026-09-08.md'), 'utf8')

/** Rows of the step table: `| 05 HOME | verdict | evidence |`. */
const stepRows = [...DOC.matchAll(/^\| (\d{2}) [A-Z]+ \| ([^|]*)\|/gm)]

const done = stepRows.filter((row) => row[2]?.includes('✅')).length
const warn = stepRows.filter((row) => row[2]?.includes('⚠️')).length

describe('the step table', () => {
  it('covers STEP 05 through STEP 19, once each', () => {
    const numbers = stepRows.map((row) => row[1])
    expect(numbers).toEqual([
      '05',
      '06',
      '07',
      '08',
      '09',
      '10',
      '11',
      '12',
      '13',
      '14',
      '15',
      '16',
      '17',
      '18',
      '19',
    ])
  })

  it('gives every step exactly one verdict marker', () => {
    expect(done + warn).toBe(stepRows.length)
  })

  it('matches the counts the summary states', () => {
    // If a step verdict changes, this fails and the summary gets rewritten
    // rather than quietly contradicting the table three screens below it.
    expect(DOC).toContain(`✅        11         ${done}`)
    expect(DOC).toContain(`⚠️         4         ${warn}`)
  })
})

describe('the MANUAL section', () => {
  const manual = DOC.slice(DOC.indexOf('## 4. MANUAL'), DOC.indexOf('## 5.'))
  const rows = [...manual.matchAll(/^\| (\d+) \|/gm)]

  it('numbers its items without a gap or a repeat', () => {
    const numbers = rows.map((row) => Number(row[1])).sort((a, b) => a - b)
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1))
  })

  it('matches the count the summary states', () => {
    expect(DOC).toContain(`MANUAL items               8        ${rows.length}`)
  })
})

describe('the verdict', () => {
  it('is still NOT READY and names two decisions, not one', () => {
    // Pass 7 found the branch question and called it bookkeeping. Pass 22
    // measured it causing three live failures, so it is a blocker in its own
    // right and the one-line verdict has to carry both.
    expect(DOC).toContain('NOT READY')
    expect(DOC).toContain('which host serves production, and which branch is the mainline')
  })

  it('keeps the correction to its own opening claim', () => {
    // "the blocker is not the code" was true about launch and too generous
    // about the code. Deleting the correction would restore the flattering half.
    expect(DOC).toContain('The code was not as finished as the ticks')
  })
})
