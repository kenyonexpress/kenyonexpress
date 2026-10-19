import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * TWENTY MAINTENANCE PASSES DEFERRED REAL WORK ON A MISIDENTIFICATION.
 *
 * `kenyon-loop.sh` launches `claude --dangerously-skip-permissions --continue
 * -p "<queue line>"`, so the agent process IS the one we run inside and its
 * command line is our own prompt by construction. A `ps` line whose `-p`
 * matches is therefore not evidence of a second agent - it is the expected
 * appearance of ourselves. Established 2026-09-08 by walking the PPID chain:
 * the "parallel agent" was this session's parent. The build that had been
 * deferred all that time took four minutes and exited 0.
 *
 * These docs then carried the phantom as a written reason for not measuring
 * things. This pins the correction: the blockers named in them have to be the
 * real ones, because a wrong blocker is worse than an open item - an open item
 * gets picked up, and a blocked one does not.
 */
const ROOT = resolve(__dirname, '..', '..')
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8')

const PHANTOM =
  /(a|the) parallel agent is holding|blocked by a parallel agent|second agent holds uncommitted/i

describe('no document blames a phantom concurrent agent', () => {
  it('the performance report does not', () => {
    // It may still DISCUSS the misidentification - that is the correction. What
    // it must not do is state it as a live reason for not measuring.
    expect(read('docs', 'PERF-REPORT.md')).not.toMatch(PHANTOM)
  })

  it('the current readiness assessment does not', () => {
    expect(read('docs', 'LAUNCH-READINESS-2026-09-08.md')).not.toMatch(PHANTOM)
  })
})

describe('the open items name blockers that are actually true', () => {
  const perf = read('docs', 'PERF-REPORT.md')

  it('attributes the unmeasured /cart CLS to the stale key, not to concurrency', () => {
    expect(perf).toMatch(/SUPABASE_SECRET_KEY/)
    expect(perf).toMatch(/MANUAL item 5/)
  })

  it('refuses to read an empty cart measuring 0 as clearing the 0.357', () => {
    // The cart cannot be populated without the secret key, so 0.0000 is a
    // number for a different page. Recording it as a pass is the error this
    // document was already corrected for once.
    expect(perf).toMatch(/does not clear the 0\.357/)
  })
})

describe('the ops runbook teaches the check that was missing', () => {
  const runbook = read('docs', 'RUNBOOK-OPS.md')

  it('says a matching prompt is not evidence of a second agent', () => {
    expect(runbook).toContain('$PPID')
  })

  it('warns that the loop line inflates a naive process count', () => {
    expect(runbook).toContain("grep -c 'claude --dangerously'")
  })
})
