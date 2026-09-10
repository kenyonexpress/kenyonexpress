import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE TAG THAT LETS THE ACCESSIBILITY SWEEP RUN IN CI, AND THE COST OF
 * FORGETTING IT.
 *
 * `docs/ACCESSIBILITY-GATE.md` records the finding this exists for: `e2e/a11y.spec.ts`
 * scans 19 routes in two viewports with axe-core, and it has never run in CI.
 * Both jobs that would run it skip themselves and report success, and the reason
 * is not neglect - the E2E job seeds fixtures, and the only database CI can
 * reach is production.
 *
 * `ci.yml` says the same thing from the other side: a11y was left out of the
 * read-only preview job "DESPITE being mostly read-only, because each carries a
 * seeded-checkout test that writes a cart".
 *
 * So three tests in that file now carry `{ tag: '@writes' }` and the CI job runs
 * `--grep-invert=@writes`. THE TAG IS LOAD-BEARING: an untagged test that seeds a
 * cart would have CI writing rows into the production database on every pull
 * request, silently, because a guest cart insert succeeds and looks like nothing.
 *
 * This is a Vitest test rather than a Playwright one for the same reason the skip
 * link gate is: it has to run in the `Unit tests` job, which is one of the four
 * checks branch protection actually requires.
 */

const SPEC = resolve(process.cwd(), 'e2e/a11y.spec.ts')

/**
 * Comments are stripped first, and that is not tidiness: the block comment that
 * explains the tag NAMES the cart helper, so a scan of the raw text reported the
 * test above it as an untagged writer. A gate that fails on prose is a gate
 * people learn to override.
 */
const source = readFileSync(SPEC, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

/** Helpers that write a row through the app. Cart seeding is the only one here. */
const WRITERS = ['addOpenProductToCart', 'addToCart(']

/**
 * Blocks, split on the top-level `test(` / `test.describe(` calls. Crude by
 * intent: the header of each block is what carries the tag, and over-including
 * the following lines can only make this stricter.
 */
function blocks(text: string): { header: string; body: string }[] {
  const starts: number[] = []
  const pattern = /^test(?:\.describe)?\(/gm
  for (const match of text.matchAll(pattern)) starts.push(match.index ?? 0)

  return starts.map((start, index) => {
    const end = index + 1 < starts.length ? starts[index + 1] : text.length
    const chunk = text.slice(start, end)
    const firstBrace = chunk.indexOf('{')
    return {
      header: chunk.slice(0, firstBrace > 0 ? firstBrace + 120 : 200),
      body: chunk,
    }
  })
}

describe('the accessibility sweep and the tag that keeps CI read-only', () => {
  const parsed = blocks(source)

  it('finds the tests, so a rewrite cannot empty this gate', () => {
    expect(parsed.length).toBeGreaterThanOrEqual(8)
  })

  it('tags every test that seeds a cart', () => {
    const untagged = parsed
      .filter((block) => WRITERS.some((writer) => block.body.includes(writer)))
      .filter((block) => !block.header.includes("tag: '@writes'"))
      .map((block) => block.header.split('\n')[0])

    expect(
      untagged,
      "tests that write a cart and carry no { tag: '@writes' } -- the CI a11y job runs --grep-invert=@writes, so an untagged one writes rows into production",
    ).toEqual([])
  })

  it('still has tests left to run once the writers are excluded', () => {
    // The other half of the same guarantee: if every test were tagged, the CI
    // job would pass having scanned nothing, which is the exact failure the
    // gate document is about.
    const readOnly = parsed.filter((block) => !block.header.includes("tag: '@writes'"))
    expect(readOnly.length).toBeGreaterThanOrEqual(5)
  })

  it('is wired into a CI job that does not depend on the missing secret', () => {
    const ci = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

    // The job block, bounded properly: everything from `  a11y:` up to the next
    // top-level key or comment. Slicing to the next job name instead swallowed
    // the comment that explains why the OTHER jobs are gated on
    // `CI_SUPABASE_URL`, and the assertion below then failed on prose.
    const lines = ci.split('\n')
    const start = lines.findIndex((line) => line === '  a11y:')
    expect(start, 'no a11y job in ci.yml').toBeGreaterThan(-1)
    let end = start + 1
    while (end < lines.length && !/^ {2}\S/.test(lines[end] ?? '')) end++
    const job = lines.slice(start, end).join('\n')

    expect(job).toContain('--grep-invert=@writes')
    expect(job).toContain('e2e/a11y.spec.ts')
    // The whole point is that it runs. A job gated on a secret this repository
    // does not have would be the third one that skips and reports success.
    expect(job).not.toContain('secrets.')
    // A JOB-LEVEL `if:`, at four spaces. `if: always()` on the report upload is
    // a step condition and is what makes a failing scan still publish its report.
    expect(job.split('\n').filter((line) => /^ {4}if:/.test(line))).toEqual([])
  })
})
