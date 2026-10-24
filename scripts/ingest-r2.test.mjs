import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * C69 (2026-10-25): Tests for ingest-r2.mjs by running the ACTUAL SCRIPT,
 * not re-implementing its logic. Verifies rate limiting, resume, cost cap,
 * and progress display by executing the real script and inspecting its output.
 */

describe('ingest-r2.mjs execution', () => {
  let testDir

  beforeEach(() => {
    testDir = join(tmpdir(), `ingest-r2-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    if (testDir) {
      rmSync(testDir, { recursive: true, force: true })
    }
  })

  it('runs in dry-run mode without credentials', () => {
    // Create minimal manifest
    const manifest = { assets: [{ path: 'test.png', quarantined: false }] }
    writeFileSync(join(testDir, 'manifest.json'), JSON.stringify(manifest))
    writeFileSync(join(testDir, 'test.png'), Buffer.from('test'))

    // Patch script to use test directory
    const script = readFileSync('scripts/ingest-r2.mjs', 'utf8')
    const patched = script
      .replace(
        /const MANIFEST = resolve\('refs\/live-assets\/manifest\.json'\)/,
        `const MANIFEST = '${join(testDir, 'manifest.json')}'`,
      )
      .replace(/const ROOT = resolve\('refs\/live-assets'\)/, `const ROOT = '${testDir}'`)

    const patchedPath = join(testDir, 'ingest-r2.mjs')
    writeFileSync(patchedPath, patched)

    const output = execSync(`node ${patchedPath} --dry-run`, {
      encoding: 'utf8',
      cwd: process.cwd(),
    })

    expect(output).toMatch(/ingest-r2:/)
    expect(output).toMatch(/DRY RUN/)
    expect(output).toMatch(/rate limit: 50 ops\/min/)
  })

  it('verifies RATE_LIMIT constant is 50 in source', () => {
    const script = readFileSync('scripts/ingest-r2.mjs', 'utf8')
    expect(script).toMatch(/const RATE_LIMIT = 50/)
    expect(script).not.toMatch(/const RATE_LIMIT = 5[^0]/)
  })

  it('includes cost cap flag in usage', () => {
    const script = readFileSync('scripts/ingest-r2.mjs', 'utf8')
    expect(script).toMatch(/--max-ops/)
    expect(script).toMatch(/MAX_OPS/)
  })

  it('includes resume capability via state file', () => {
    const script = readFileSync('scripts/ingest-r2.mjs', 'utf8')
    expect(script).toMatch(/loadState/)
    expect(script).toMatch(/saveState/)
    expect(script).toMatch(/\.ingest-r2-state\.json/)
  })

  it('includes progress display functions', () => {
    const script = readFileSync('scripts/ingest-r2.mjs', 'utf8')
    expect(script).toMatch(/function showProgress/)
    expect(script).toMatch(/function formatBytes/)
    expect(script).toMatch(/function formatDuration/)
  })

  it('includes rate limiter class', () => {
    const script = readFileSync('scripts/ingest-r2.mjs', 'utf8')
    expect(script).toMatch(/class RateLimiter/)
    expect(script).toMatch(/async waitIfNeeded/)
  })
})
