import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stripComments } from '../src/lib/source-scan/strip-comments.mjs'

/**
 * The runner behind the no-database CI lane.
 *
 * Two properties, both learned by watching it: it must never report success
 * with an empty spec list, and it must exit with Playwright's own code rather
 * than letting execFileSync throw a spawn object over the test output.
 *
 * The spec list itself lives in e2e/database-need.ts and is guarded by
 * e2e-classification.test.ts; this file is about the runner.
 */
const source = readFileSync(resolve(process.cwd(), 'scripts/e2e-no-database.mjs'), 'utf8')
const code = stripComments(source)

describe('e2e-no-database runner', () => {
  it('reads the spec list from database-need.ts rather than keeping a second copy', () => {
    expect(code).toContain('e2e/database-need.ts')
    const specNames = code.match(/'[a-z0-9-]+\.spec\.ts'/g) ?? []
    expect(specNames, 'spec filenames should not be hard-coded here').toEqual([])
  })

  // RUN, not read. An empty list would launch zero tests and exit 0, which is
  // the failure shape this whole lane exists to remove, so it is worth the
  // subprocess. A fixture tree with an empty NO_DATABASE_SPECS is enough - the
  // script never reaches Playwright.
  it('refuses to report success on an empty spec list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'e2e-nodb-'))
    try {
      mkdirSync(join(dir, 'e2e'), { recursive: true })
      writeFileSync(
        join(dir, 'e2e/database-need.ts'),
        'export const NO_DATABASE_SPECS = [] as const\nexport const NEEDS_DATABASE_SPECS = {}\n',
      )
      let status = 0
      let stderr = ''
      try {
        execFileSync(process.execPath, [resolve(process.cwd(), 'scripts/e2e-no-database.mjs')], {
          cwd: dir,
          stdio: 'pipe',
        })
      } catch (error) {
        status = error.status ?? -1
        stderr = String(error.stderr ?? '')
      }
      expect(status).toBe(2)
      expect(stderr).toContain('Refusing to report success')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // Shape, not behaviour, and named as such: proving the exit code would mean
  // running the real suite twice, and the branch is three lines.
  it('is written to exit with the child code rather than throw the spawn result', () => {
    expect(code).toMatch(/error\?\.status/)
    expect(code).toMatch(/process\.exit\(code\)/)
  })

  it('pins the browser project, so a local config cannot widen the lane silently', () => {
    expect(code).toContain("'--project=chromium'")
  })
})
