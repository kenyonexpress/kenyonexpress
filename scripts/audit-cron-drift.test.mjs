import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The drift auditor itself, tested where it can be: its parsing and its refusal
 * to report agreement it did not check.
 *
 * The comparison it performs needs `origin/<default>` in the local object
 * store, which a shallow CI checkout does not have. That is exactly why the
 * script exits 2 rather than 0 when it cannot read the other branch - an audit
 * that says "they agree" because it could not look is the failure this whole
 * maintenance loop keeps finding.
 */

const SCRIPT = resolve(process.cwd(), 'scripts/audit-cron-drift.mjs')
const SRC = readFileSync(SCRIPT, 'utf8')

describe('audit-cron-drift', () => {
  it('asks git for the default branch instead of hardcoding one', () => {
    // The mainline is an open question. A script that assumed `main` would
    // start lying on the day the answer changes.
    expect(SRC).toContain('refs/remotes/origin/HEAD')
  })

  it('exits 2, not 0, when it cannot read the other branch', () => {
    expect(SRC).toContain('process.exit(2)')
    expect(SRC).toContain('refusing to report agreement it did not check')
  })

  it('is deliberately not wired into CI', () => {
    // It would be red every run until the branch question is settled, which is
    // the same mistake as a required Lighthouse check.
    const workflows = execFileSync('git', ['ls-files', '.github/workflows'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
    for (const file of workflows) {
      expect(readFileSync(resolve(process.cwd(), file), 'utf8')).not.toContain('audit-cron-drift')
    }
  })

  it('reads the job list from the same file the runner does', () => {
    const runner = readFileSync(resolve(process.cwd(), 'scripts/run-cron-jobs.sh'), 'utf8')
    expect(runner).toContain('cron-jobs.json')
    expect(SRC).toContain('cron-jobs.json')
  })
})

/**
 * The condition the script exists to report, pinned as a fact rather than left
 * in prose. If either side changes, this fails and the finding gets re-read
 * instead of quietly aging.
 */
describe('the drift as measured on 2026-09-08', () => {
  const ours = JSON.parse(readFileSync(resolve(process.cwd(), 'scripts/cron-jobs.json'), 'utf8'))
  const names = (ours.jobs ?? ours).map((j) => j.name)

  it('this branch schedules retention and weekly-digest', () => {
    expect(names).toContain('retention')
    expect(names).toContain('weekly-digest')
  })

  it('this branch has no whatsapp job or route', () => {
    expect(names).not.toContain('whatsapp')
    const tracked = execFileSync('git', ['ls-files', 'src/app/api/cron'], { encoding: 'utf8' })
    expect(tracked).not.toContain('whatsapp')
  })
})
