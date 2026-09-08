import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GATE_CEILING, appendParityFailure, appendParityRow } from './parity-log.mjs'

/**
 * The report writer, tested where it writes: a temporary cwd, so a test can
 * never append a fabricated measurement to the real docs/UI-PARITY-REPORT.md.
 */
let dir = ''
let cwd = ''

beforeEach(() => {
  cwd = process.cwd()
  dir = mkdtempSync(join(tmpdir(), 'parity-log-'))
  // The writer creates the report from its header, but not the directory.
  mkdirSync(join(dir, 'docs'), { recursive: true })
  process.chdir(dir)
})

afterEach(() => {
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
  // biome-ignore lint/performance/noDelete: unsetting an env var - assignment stores the string "undefined"
  delete process.env.PARITY_NOTE
})

const report = () => readFileSync(join(dir, 'docs/UI-PARITY-REPORT.md'), 'utf8')

describe('appendParityRow', () => {
  it('scores at or below the ceiling as PASS, and above it as FAIL', () => {
    appendParityRow({ page: 'home', width: 1440, pct: GATE_CEILING })
    appendParityRow({ page: 'home', width: 380, pct: GATE_CEILING + 0.01 })
    const rows = report().trim().split('\n').slice(-2)
    expect(rows[0]).toContain('PASS')
    expect(rows[1]).toContain('**FAIL**')
  })

  // The column the header calls the place "the cause belongs" was unreachable:
  // `notes` had no caller, so every row ever written left it empty.
  it('fills the notes column from PARITY_NOTE', () => {
    process.env.PARITY_NOTE = 'next 16.3.4'
    appendParityRow({ page: 'home', width: 1440, pct: 8.29 })
    expect(report()).toContain('| next 16.3.4 |')
  })

  it('lets an explicit note win over the environment', () => {
    process.env.PARITY_NOTE = 'from the environment'
    appendParityRow({ page: 'home', width: 1440, pct: 8.29, notes: 'from the caller' })
    expect(report()).toContain('from the caller')
    expect(report()).not.toContain('from the environment')
  })

  // A pipe or a newline in a note silently breaks the table it is written into.
  it('cannot break the table with a pipe or a newline', () => {
    process.env.PARITY_NOTE = 'next 16.3.4 | rebuilt\nand restarted'
    appendParityRow({ page: 'home', width: 1440, pct: 8.29 })
    const row = report().trim().split('\n').at(-1) ?? ''
    expect(row.split('|')).toHaveLength(9)
    expect(row).toContain('next 16.3.4 / rebuilt and restarted')
  })

  // `process.env.X = undefined` stores the STRING "undefined" in node, so this
  // deletes instead - the state a machine that never set the variable is in.
  it('writes no note when none is set, rather than the string undefined', () => {
    // biome-ignore lint/performance/noDelete: unsetting an env var, which is the state under test
    delete process.env.PARITY_NOTE
    appendParityRow({ page: 'home', width: 1440, pct: 8.29 })
    expect(report()).not.toContain('undefined')
  })
})

describe('appendParityFailure', () => {
  it('records the run as UNMEASURED and invents no percentage', () => {
    appendParityFailure({ page: 'home', width: 380, reason: 'screenshot failed' })
    const row = report().trim().split('\n').at(-1) ?? ''
    expect(row).toContain('**UNMEASURED**')
    expect(row).toContain('n/a')
    expect(row).not.toMatch(/\d+\.\d+%/)
  })

  it('carries the note alongside the reason', () => {
    process.env.PARITY_NOTE = 'next 16.3.4'
    appendParityFailure({ page: 'home', width: 380, reason: 'screenshot failed' })
    expect(report()).toContain('screenshot failed -- next 16.3.4')
  })
})
