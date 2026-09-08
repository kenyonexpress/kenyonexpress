import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE ONLY SKIPPED TESTS IN THIS REPOSITORY ARE THE DATABASE AUTHORIZATION
 * TESTS, AND NOTHING SAID SO.
 *
 * Measured 2026-09-08 on a full run:
 *
 *   rls-role-boundaries.test.ts   13 of 13 skipped
 *   anon-catalog.test.ts           8 of 9  skipped
 *   wallet-rls.test.ts             4 of 5  skipped
 *   everything else                0
 *
 * Twenty-five skips, all of them RLS. Every pass of the maintenance loop
 * reported "4450 passing, 25 skipped" as though the 25 were incidental. They
 * are STEP 17's "OWASP: RLS bypass" requirement, and they had no automated
 * coverage anywhere - not locally, and NOT IN CI: the unit-test job passed no
 * Supabase environment at all, so `describe.skipIf(!configured)` was true there
 * too. STATE.md recorded on 2026-09-03 that anon-catalog "runs in CI"; it never
 * did.
 *
 * Skipping is the right behaviour - a security test that cannot reach the
 * database must skip rather than pass falsely. What was missing is anything
 * that notices the skip is permanent.
 */

const DB_TESTS = resolve(process.cwd(), 'src/db/__tests__')
const WORKFLOW = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')

/** The suites that gate themselves on database credentials. */
const GATED = ['rls-role-boundaries.test.ts', 'anon-catalog.test.ts', 'wallet-rls.test.ts']

describe('the RLS suites', () => {
  it('are still present and still the gated ones', () => {
    const onDisk = readdirSync(DB_TESTS).filter((f) => f.endsWith('.test.ts'))
    for (const name of GATED) expect(onDisk).toContain(name)
  })

  it.each(GATED)('%s reads the env names the workflow provides', (name) => {
    const src = readFileSync(join(DB_TESTS, name), 'utf8')
    // Both halves matter: the fallback to NEXT_PUBLIC_* is what lets a local
    // .env run them, and the bare names are what CI sets.
    expect(src).toContain('process.env.SUPABASE_URL')
    expect(src).toContain('process.env.SUPABASE_ANON_KEY')
  })

  it.each(GATED)('%s skips rather than passing when it cannot reach the database', (name) => {
    const src = readFileSync(join(DB_TESTS, name), 'utf8')
    expect(src).toMatch(/skipIf\(!\w+\)|describe\.skip/)
  })
})

describe('the CI unit-test job can un-skip them', () => {
  /**
   * The `test:` job block, sliced to the next top-level job key, with YAML
   * comments removed.
   *
   * Comments are stripped because the block DOCUMENTS `secrets.CI_SUPABASE_*`
   * in order to explain why it deliberately does not use it. The first version
   * of this test read the raw text and failed on its own explanation - the same
   * mistake migration-lint made, and the same one that produced a sixteen-item
   * cache table out of six comments. A `#` line configures nothing.
   */
  const testJob = (() => {
    const start = WORKFLOW.indexOf('\n  test:\n')
    expect(start, 'the CI job named `test` is gone').toBeGreaterThan(-1)
    const rest = WORKFLOW.slice(start + 1)
    const next = rest.search(/\n {2}[a-z][\w-]*:\n/)
    const block = next === -1 ? rest : rest.slice(0, next)
    return block
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n')
  })()

  it('passes SUPABASE_URL and SUPABASE_ANON_KEY through', () => {
    // Without these the suites skip in CI exactly as they do offline, and the
    // green tick means only that they did not run.
    expect(testJob).toContain('SUPABASE_URL:')
    expect(testJob).toContain('SUPABASE_ANON_KEY:')
  })

  it('uses repository variables, not secrets', () => {
    // The anon key is compiled into the client bundle of every page, so it is
    // already public and a `secrets` entry would imply a confidentiality this
    // value does not have.
    expect(testJob).toMatch(/vars\.RLS_SUPABASE_URL/)
    expect(testJob).toMatch(/vars\.RLS_SUPABASE_ANON_KEY/)
  })

  it('does not borrow the build job PUBLIC_SUPABASE_* pair', () => {
    // Those point at the Supabase DEMO project. Asserting RLS against a
    // different schema would be worse than skipping.
    expect(testJob).not.toContain('vars.PUBLIC_SUPABASE_URL')
    expect(testJob).not.toContain('vars.PUBLIC_SUPABASE_ANON_KEY')
  })

  it('leaves the E2E seeding gate alone', () => {
    // secrets.CI_SUPABASE_* stays unset on purpose: setting it un-skips the E2E
    // job, whose first step seeds fixtures into the only database there is.
    expect(testJob).not.toContain('secrets.CI_SUPABASE')
  })
})
