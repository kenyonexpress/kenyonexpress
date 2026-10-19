import { describe, expect, it } from 'vitest'
import { DEFAULT_BRANCH_ONLY, classify, defaultBranch } from './audit-default-branch-config.mjs'

/**
 * Two fixes made by this loop were inert, and both for this reason.
 *
 * Pass 41 raised Dependabot's open-pull-requests-limit because six open npm PRs
 * had starved the weekly run. Dependabot reads the default branch; main still
 * says 5. Pass 55 wired five never-run audits into the nightly. The nightly is
 * a schedule: trigger, so it checks out main, which has five run steps to this
 * branch's nine - the fix for "an audit nothing runs" was itself unrun.
 *
 * Each edit was correct in the file, passed review, passed CI, and was visibly
 * present in the branch. The failure is entirely in which COPY the platform
 * reads, and no test that opens the file can see it.
 */
describe('classify', () => {
  it('calls identical copies the same', () => {
    expect(classify(true, 'a', 'a')).toBe('same')
  })

  it('calls a differing copy drift, which is the finding', () => {
    expect(classify(true, 'a', 'b')).toBe('differs')
  })

  it('separates "not on the default branch" from "not here"', () => {
    // A file only this branch has never takes effect; a file only the default
    // branch has is running something nobody here can read. Different problems.
    expect(classify(true, null, 'a')).toBe('absent-on-default')
    expect(classify(false, 'a', null)).toBe('absent-here')
  })

  it('does not report drift for a path neither side has', () => {
    expect(classify(false, null, null)).toBe('absent-both')
  })
})

describe('the watched list', () => {
  it('gives a reason for every path', () => {
    // A path with no reason is one somebody added to a list, and the next
    // reader cannot tell whether it belongs.
    for (const entry of DEFAULT_BRANCH_ONLY) {
      expect(entry.why, `${entry.path} has no reason`).toBeTruthy()
      expect(entry.why.length).toBeGreaterThan(20)
    }
  })

  it('covers the three files measured as drifting on 2026-09-08', () => {
    const paths = DEFAULT_BRANCH_ONLY.map((e) => e.path)
    expect(paths).toContain('.github/dependabot.yml')
    expect(paths).toContain('scripts/cron-jobs.json')
    expect(paths).toContain('scripts/nightly-health.sh')
  })

  it('covers the script the scheduler executes, not only the data it reads', () => {
    // cron-jobs.json was the original finding and it is only half: the shell
    // script that consumes it runs from the default branch too.
    expect(DEFAULT_BRANCH_ONLY.map((e) => e.path)).toContain('scripts/run-cron-jobs.sh')
  })
})

describe('defaultBranch', () => {
  it('asks git rather than hardcoding, and falls back to main', () => {
    const branch = defaultBranch()
    expect(typeof branch).toBe('string')
    expect(branch.length).toBeGreaterThan(0)
    expect(branch).not.toContain('refs/')
  })
})
