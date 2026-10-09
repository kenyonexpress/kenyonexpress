import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GATE_CEILING, appendParityRefusal, appendParityRow } from './parity-log.mjs'

// appendParityRow resolves docs/UI-PARITY-REPORT.md against process.cwd(), and
// that is deliberate: there is no path parameter to point a run at some other
// file and leave the real report empty. So the test moves the cwd rather than
// the target, and puts it back.
let cwd
let dir

beforeEach(() => {
  cwd = process.cwd()
  dir = mkdtempSync(join(tmpdir(), 'parity-log-'))
  mkdirSync(join(dir, 'docs'))
  process.chdir(dir)
})

afterEach(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

const report = () => readFileSync(join(dir, 'docs/UI-PARITY-REPORT.md'), 'utf8')
const rows = () =>
  report()
    .split('\n')
    .filter((l) => l.startsWith('| 2026-'))

describe('appendParityRow', () => {
  it('writes the header when the report does not exist yet', () => {
    appendParityRow({ page: 'home', width: 380, pct: 9.5, when: '2026-09-09 04:00', commit: 'abc' })
    expect(report()).toContain('| when (UTC) | page | width | diff | verdict | commit | notes |')
  })

  it('scores at or below the ceiling as PASS and above it as FAIL', () => {
    appendParityRow({
      page: 'home',
      width: 380,
      pct: GATE_CEILING,
      when: '2026-09-09 04:00',
      commit: 'abc',
    })
    appendParityRow({
      page: 'home',
      width: 380,
      pct: GATE_CEILING + 0.01,
      when: '2026-09-09 04:01',
      commit: 'abc',
    })
    const [pass, fail] = rows()
    expect(pass).toContain('| PASS |')
    expect(fail).toContain('| **FAIL** |')
  })
})

describe('appendParityRefusal', () => {
  it('records the run instead of leaving a gap in the table', () => {
    appendParityRefusal({
      page: 'cart',
      width: 1440,
      reason: 'live side is our-build',
      when: '2026-09-09 04:02',
      commit: 'abc',
    })
    expect(rows()).toHaveLength(1)
    expect(rows()[0]).toContain('| cart | 1440 | n/a | REFUSED |')
    expect(rows()[0]).toContain('live side is our-build')
  })

  it('does not invent a percentage, and is neither PASS nor FAIL', () => {
    appendParityRefusal({
      page: 'home',
      width: 380,
      reason: 'reference rendered unstyled',
      when: '2026-09-09 04:03',
      commit: 'abc',
    })
    const row = rows()[0]
    expect(row).not.toMatch(/\d+\.\d\d%/)
    expect(row).not.toContain('PASS')
    expect(row).not.toContain('FAIL')
  })

  it('writes the header first when it is the very first run', () => {
    appendParityRefusal({
      page: 'home',
      width: 768,
      reason: 'live side is unknown',
      when: '2026-09-09 04:04',
      commit: 'abc',
    })
    expect(report()).toContain('| when (UTC) | page | width | diff | verdict | commit | notes |')
    expect(report()).toContain('REFUSED')
  })

  it('carries the commit, the same as a measured row', () => {
    appendParityRefusal({
      page: 'product',
      width: 1440,
      reason: 'live side is our-build',
      when: '2026-09-09 04:05',
      commit: 'deadbee-dirty',
    })
    expect(rows()[0]).toContain('`deadbee-dirty`')
  })
})
