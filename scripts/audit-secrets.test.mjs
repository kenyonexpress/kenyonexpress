import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * THE SECRETS AUDIT, AND THE TWO WAYS IT COULD BE USELESS.
 *
 * A scanner fails in exactly two directions. It can flag things that are fine,
 * until people mute it - this repository produced that five times in one day,
 * including a migration linter that failed on its own prose. Or it can pass
 * because it looked at nothing, which is every other defect this maintenance
 * loop has turned up.
 *
 * These tests pin both ends: no false positives on the tree as it stands, and a
 * floor under the number of files scanned.
 */

const SCRIPT = resolve(process.cwd(), 'scripts/audit-secrets.mjs')

function run() {
  try {
    return { code: 0, out: execFileSync('node', [SCRIPT], { encoding: 'utf8' }) }
  } catch (error) {
    return { code: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

describe('the secrets audit', () => {
  const result = run()

  it('reports no NEW findings on the current tree', () => {
    expect(result.out).toContain('no new findings')
    expect(result.code).toBe(0)
  })

  it('scanned a real number of files, not zero', () => {
    // "clean" from a scan of nothing is the failure mode this loop keeps
    // finding elsewhere; the script refuses to report below 500 files.
    const match = result.out.match(/\((\d+) tracked files/)
    expect(Number(match?.[1] ?? 0)).toBeGreaterThan(1500)
  })

  it('still reports the known finding rather than hiding it', () => {
    // Suppression that goes quiet is indistinguishable from a fix.
    expect(result.out).toContain('KNOWN')
    expect(result.out).toContain('.env.local')
  })

  it('does not exempt files by name where length can decide instead', () => {
    // Three test files matched on fixtures - a private key whose body is `MIIE`
    // and two 21-character sb_secret_ placeholders. Exempting those FILES would
    // have blinded the scanner to a real key pasted into a test, which is the
    // likelier accident.
    const src = readFileSync(SCRIPT, 'utf8')
    expect(src).not.toContain("'src/lib/env-probe.test.ts'")
    expect(src).not.toContain("'src/lib/wallet/config.test.ts'")
    expect(src).not.toContain("'src/lib/wallet/notify.test.ts'")
  })
})

describe('the audit is wired to something that runs', () => {
  it('is a step in the gates job, which is the one that actually executes', () => {
    // Three gates existed in no workflow before 2026-09-08. A ratchet nothing
    // pulls is a number in a file.
    const workflow = readFileSync(resolve(process.cwd(), '.github/workflows/ci.yml'), 'utf8')
    const code = workflow
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n')
    expect(code).toContain('node scripts/audit-secrets.mjs')
  })
})
