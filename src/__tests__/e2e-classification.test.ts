import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NEEDS_DATABASE_SPECS, NO_DATABASE_SPECS } from '../../e2e/database-need'

/**
 * EVERY BROWSER SPEC IS EITHER RUN ON EVERY PUSH OR NAMED AS WAITING.
 *
 * The split in e2e/database-need.ts turns fifteen specs that CI never ran into
 * fifteen that run with no database. The risk it introduces is the one it
 * cures: a spec that appears in neither list is a spec nothing runs, and it
 * would be invisible - the no-database job would pass without it and the
 * database job would keep skipping.
 *
 * So this is the counter, in the same shape as audits-are-wired.test.ts: run,
 * or named as waiting with the reason, and there is no third state.
 */
const specs = readdirSync(resolve(process.cwd(), 'e2e'))
  .filter((file) => file.endsWith('.spec.ts'))
  .sort()

const waiting = Object.keys(NEEDS_DATABASE_SPECS)

describe('every e2e spec is classified', () => {
  it('found the specs, so an empty directory cannot pass this test', () => {
    expect(specs.length).toBeGreaterThan(20)
  })

  it.each(specs)('%s is either run without a database or named as waiting', (spec) => {
    const runs = (NO_DATABASE_SPECS as readonly string[]).includes(spec)
    expect(
      runs || waiting.includes(spec),
      `${spec} is in neither list, so nothing runs it. Add it to NO_DATABASE_SPECS, or to NEEDS_DATABASE_SPECS with the reason it cannot run without one.`,
    ).toBe(true)
  })

  it('never puts a spec in both lists', () => {
    const both = (NO_DATABASE_SPECS as readonly string[]).filter((s) => waiting.includes(s))
    expect(both).toEqual([])
  })

  it('names no spec that has been deleted or renamed', () => {
    const listed = [...NO_DATABASE_SPECS, ...waiting]
    expect(listed.filter((s) => !specs.includes(s))).toEqual([])
  })

  it('gives every waiting spec a reason, not just a name', () => {
    for (const [spec, reason] of Object.entries(NEEDS_DATABASE_SPECS)) {
      expect(reason.length, `${spec} needs a reason`).toBeGreaterThan(15)
    }
  })
})
