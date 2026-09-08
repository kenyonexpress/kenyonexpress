import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

/**
 * The audit is exercised by RUNNING it against fixture trees, not by reading
 * its source. What is being defended is that "cannot check" exits non-zero:
 * this repo's recurring defect is a mechanism that reports success while doing
 * nothing, and an inputs audit that exits 0 when the inputs are gone would be
 * one more of them.
 *
 * The reproducible path is exercised for real by the nightly against the actual
 * refs/, which is the only place a full asset crawl exists. It is not faked
 * here - a fixture that regenerates a page from a stub would test the fixture.
 */
const SCRIPT = resolve(process.cwd(), 'scripts/audit-parity-inputs.mjs')

const SNAPSHOTS = [
  'ke_live_cart.html',
  'ke_live_category.html',
  'ke_live_checkout.html',
  'ke_live_home.html',
  'ke_live_product.html',
  'ke_live_products.html',
  'ke_live_search.html',
]

let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'parity-audit-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** @returns {{ code: number, stderr: string }} */
function run() {
  try {
    execFileSync(process.execPath, [SCRIPT], { cwd: dir, stdio: 'pipe' })
    return { code: 0, stderr: '' }
  } catch (error) {
    return { code: error.status ?? -1, stderr: String(error.stderr ?? '') }
  }
}

function writeSnapshots(bytes) {
  mkdirSync(join(dir, 'refs'), { recursive: true })
  for (const name of SNAPSHOTS) writeFileSync(join(dir, 'refs', name), 'x'.repeat(bytes))
}

describe('audit-parity-inputs', () => {
  it('refuses with 2 when there is no refs/ at all', () => {
    const { code, stderr } = run()
    expect(code).toBe(2)
    expect(stderr).toContain('CANNOT CHECK')
  })

  it('names every snapshot it could not find, not just the first', () => {
    const { stderr } = run()
    for (const name of SNAPSHOTS) expect(stderr).toContain(name)
  })

  // A truncated snapshot is the quiet version of a missing one: the localizer
  // would still run and still write pages, and they would be wrong.
  it('treats a stub-sized snapshot as unusable', () => {
    writeSnapshots(10)
    mkdirSync(join(dir, 'refs', 'live-assets'), { recursive: true })
    const { code, stderr } = run()
    expect(code).toBe(2)
    expect(stderr).toContain('below')
  })

  it('refuses when the asset crawl is absent, even with every snapshot present', () => {
    writeSnapshots(60_000)
    const { code, stderr } = run()
    expect(code).toBe(2)
    expect(stderr).toContain('live-assets')
  })

  it('never exits 0 on any incomplete tree', () => {
    for (const setup of [() => {}, () => writeSnapshots(10), () => writeSnapshots(60_000)]) {
      rmSync(dir, { recursive: true, force: true })
      dir = mkdtempSync(join(tmpdir(), 'parity-audit-'))
      setup()
      expect(run().code).not.toBe(0)
    }
  })
})
