// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ARCHIVE_TITLE,
  LOG_HEADING,
  RESUME_PREFIX,
  applyStateLog,
  capLogEntries,
  isoLocal,
  logEntries,
  normaliseResult,
  prependSummary,
  splitLines,
  summaryBlock,
  trimToMax,
} from './state-log-lib.mjs'

/**
 * The item log is the only thing that writes STATE.md without a person or a
 * model deciding to, so these pin the shape the loop depends on: a three-line
 * block, line 1 as the resume pointer, the 300-line cap, and the rule that
 * nothing leaves STATE.md without landing in the archive in the same call.
 */

const TS = '2026-10-15T04:12:33+07:00'

const SMALL_STATE = [
  'RESUME FROM: XF01',
  '# KenyonExpress — Project State',
  '',
  'Updated: 2026-10-15 03:44 (UX28)',
  '',
  '## המשך מ: next thing',
  '',
  'body line',
  '',
].join('\n')

describe('normaliseResult', () => {
  it('reads DONE with or without the RESULT prefix', () => {
    expect(normaliseResult('RESULT: DONE')).toEqual({ status: 'DONE', line: 'RESULT: DONE' })
    expect(normaliseResult('DONE')).toEqual({ status: 'DONE', line: 'RESULT: DONE' })
    expect(normaliseResult('  done  ')).toEqual({ status: 'DONE', line: 'RESULT: DONE' })
  })

  it('keeps the BLOCKED reason and normalises the separator', () => {
    expect(normaliseResult('RESULT: BLOCKED no deployed URL').line).toBe('BLOCKED: no deployed URL')
    expect(normaliseResult('BLOCKED: quota').line).toBe('BLOCKED: quota')
    expect(normaliseResult('BLOCKED - compare refused').line).toBe('BLOCKED: compare refused')
  })

  it('treats anything else as BLOCKED with the text as the reason', () => {
    expect(normaliseResult('no RESULT line after 3 tries')).toEqual({
      status: 'BLOCKED',
      line: 'BLOCKED: no RESULT line after 3 tries',
    })
    expect(normaliseResult('').line).toBe('BLOCKED: no reason given')
    expect(normaliseResult('BLOCKED').line).toBe('BLOCKED: no reason given')
  })
})

describe('summaryBlock', () => {
  it('is exactly three lines: timestamp, item, outcome', () => {
    expect(summaryBlock({ timestamp: TS, id: 'XF01', result: 'RESULT: DONE' })).toEqual([
      `### ${TS}`,
      '- item: XF01',
      '- RESULT: DONE',
    ])
    expect(summaryBlock({ timestamp: TS, id: ' M03-c179 ', result: 'BLOCKED: refused' })).toEqual([
      `### ${TS}`,
      '- item: M03-c179',
      '- BLOCKED: refused',
    ])
  })

  it('refuses an empty id', () => {
    expect(() => summaryBlock({ timestamp: TS, id: '', result: 'DONE' })).toThrow(/id/)
  })
})

describe('isoLocal', () => {
  it('is ISO 8601 with a numeric offset, not Z', () => {
    expect(isoLocal(new Date(2026, 9, 15, 4, 12, 33))).toMatch(
      /^2026-10-15T04:12:33[+-]\d{2}:\d{2}$/,
    )
  })
})

describe('prependSummary', () => {
  it('creates the heading after the resume line and the title on first use', () => {
    const lines = prependSummary(
      splitLines(SMALL_STATE),
      summaryBlock({ timestamp: TS, id: 'XF01', result: 'DONE' }),
    )
    expect(lines[0]).toBe('RESUME FROM: XF01')
    expect(lines[1]).toBe('# KenyonExpress — Project State')
    expect(lines[2]).toBe('')
    expect(lines[3].startsWith(LOG_HEADING)).toBe(true)
    expect(lines.slice(4, 9)).toEqual(['', `### ${TS}`, '- item: XF01', '- RESULT: DONE', ''])
    // The rest of the file is untouched.
    expect(lines.slice(9)).toEqual(splitLines(SMALL_STATE).slice(3))
  })

  it('puts a newer block above the older one under the existing heading', () => {
    const first = prependSummary(
      splitLines(SMALL_STATE),
      summaryBlock({ timestamp: TS, id: 'XF01', result: 'DONE' }),
    )
    const second = prependSummary(
      first,
      summaryBlock({ timestamp: '2026-10-15T05:00:00+07:00', id: 'XF02', result: 'BLOCKED x' }),
    )
    const { entries } = logEntries(second)
    expect(entries.map((e) => second[e.start + 1])).toEqual(['- item: XF02', '- item: XF01'])
    expect(second.filter((l) => l.startsWith(LOG_HEADING))).toHaveLength(1)
  })

  it('works on an empty file', () => {
    const lines = prependSummary([], summaryBlock({ timestamp: TS, id: 'XF01', result: 'DONE' }))
    expect(lines[0].startsWith(LOG_HEADING)).toBe(true)
    expect(lines).toContain('- item: XF01')
  })
})

describe('capLogEntries', () => {
  it('moves the oldest entries past the cap and keeps the next section attached', () => {
    let lines = splitLines(SMALL_STATE)
    for (let i = 1; i <= 4; i++) {
      lines = prependSummary(
        lines,
        summaryBlock({ timestamp: `T${i}`, id: `I${i}`, result: 'DONE' }),
      )
    }
    const { lines: kept, moved } = capLogEntries(lines, 2)
    expect(logEntries(kept).entries).toHaveLength(2)
    expect(kept.filter((l) => l.startsWith('- item:'))).toEqual(['- item: I4', '- item: I3'])
    expect(moved.filter((l) => l.startsWith('- item:'))).toEqual(['- item: I2', '- item: I1'])
    expect(kept).toContain('## המשך מ: next thing')
    expect(kept).toContain('body line')
  })

  it('is a no-op under the cap', () => {
    const lines = prependSummary(
      splitLines(SMALL_STATE),
      summaryBlock({ timestamp: TS, id: 'XF01', result: 'DONE' }),
    )
    expect(capLogEntries(lines, 25)).toEqual({ lines, moved: [] })
  })
})

describe('trimToMax', () => {
  it('cuts at the last blank line at or before the limit', () => {
    const lines = ['a', 'b', 'c', 'd', '', 'e', 'f', 'g']
    const { lines: kept, moved } = trimToMax(lines, 6)
    expect(kept).toEqual(['a', 'b', 'c', 'd'])
    expect(moved).toEqual(['e', 'f', 'g'])
  })

  it('cuts exactly at the limit when no blank line sits in the upper half', () => {
    const lines = Array.from({ length: 12 }, (_, i) => `l${i}`)
    const { lines: kept, moved } = trimToMax(lines, 6)
    expect(kept).toHaveLength(6)
    expect(moved).toEqual(['l6', 'l7', 'l8', 'l9', 'l10', 'l11'])
  })

  it('never drops a line: kept plus moved is the input minus blank edges', () => {
    const lines = ['a', '', 'b', '', 'c', 'd', '', 'e']
    const { lines: kept, moved } = trimToMax(lines, 5)
    const nonBlank = (xs) => xs.filter((l) => l !== '')
    expect([...nonBlank(kept), ...nonBlank(moved)]).toEqual(nonBlank(lines))
  })
})

describe('applyStateLog', () => {
  it('rewrites line 1 to the next item and records the block', () => {
    const out = applyStateLog({
      stateText: SMALL_STATE,
      archiveText: '',
      id: 'XF01',
      result: 'RESULT: DONE',
      next: 'XF02',
      timestamp: TS,
    })
    const lines = splitLines(out.stateText)
    expect(lines[0]).toBe(`${RESUME_PREFIX}XF02`)
    expect(lines.filter((l) => l.startsWith(RESUME_PREFIX))).toHaveLength(1)
    expect(out.block).toEqual([`### ${TS}`, '- item: XF01', '- RESULT: DONE'])
    expect(out.movedCount).toBe(0)
    expect(out.archiveText).toBe('')
    expect(out.status).toBe('DONE')
  })

  it('adds a resume line to a file that has none and leaves it alone when no next is given', () => {
    const noResume = SMALL_STATE.split('\n').slice(1).join('\n')
    const withNext = applyStateLog({
      stateText: noResume,
      archiveText: '',
      id: 'A',
      result: 'DONE',
      next: 'B',
      timestamp: TS,
    })
    expect(splitLines(withNext.stateText)[0]).toBe('RESUME FROM: B')
    const without = applyStateLog({
      stateText: SMALL_STATE,
      archiveText: '',
      id: 'A',
      result: 'DONE',
      timestamp: TS,
    })
    expect(splitLines(without.stateText)[0]).toBe('RESUME FROM: XF01')
  })

  it('keeps STATE.md at or under maxLines and archives every line that left', () => {
    const body = Array.from({ length: 400 }, (_, i) => (i % 7 === 6 ? '' : `history line ${i}`))
    const stateText = `${['RESUME FROM: Q1', '# Title', '', ...body].join('\n')}\n`
    const out = applyStateLog({
      stateText,
      archiveText: '',
      id: 'Q1',
      result: 'DONE',
      next: 'Q2',
      timestamp: TS,
      maxLines: 300,
    })
    const kept = splitLines(out.stateText)
    expect(kept.length).toBeLessThanOrEqual(300)
    expect(kept[0]).toBe('RESUME FROM: Q2')
    const archive = splitLines(out.archiveText)
    expect(archive[0]).toBe(ARCHIVE_TITLE)
    expect(archive).toContain(`## Archived ${TS} after Q1 (${out.movedCount} lines from STATE.md)`)
    const history = (xs) => xs.filter((l) => l.startsWith('history line '))
    expect([...history(kept), ...history(archive)]).toEqual(history(body))
    expect(out.movedCount).toBeGreaterThan(0)
  })

  it('appends to an existing archive instead of replacing it', () => {
    const body = Array.from({ length: 50 }, (_, i) => `h${i}`)
    const stateText = `${['RESUME FROM: Q1', '# T', '', ...body].join('\n')}\n`
    const first = applyStateLog({
      stateText,
      archiveText: '',
      id: 'Q1',
      result: 'DONE',
      timestamp: TS,
      maxLines: 30,
    })
    const second = applyStateLog({
      stateText: first.stateText,
      archiveText: first.archiveText,
      id: 'Q2',
      result: 'BLOCKED again',
      timestamp: '2026-10-15T05:00:00+07:00',
      maxLines: 30,
    })
    const archive = splitLines(second.archiveText)
    expect(archive.filter((l) => l.startsWith('## Archived '))).toHaveLength(2)
    expect(archive.filter((l) => l === ARCHIVE_TITLE)).toHaveLength(1)
    const all = [...splitLines(second.stateText), ...archive].filter((l) => /^h\d+$/.test(l))
    expect(all.sort()).toEqual([...body].sort())
  })

  it('moves log entries past the entry cap before it trims by lines', () => {
    let stateText = SMALL_STATE
    let archiveText = ''
    for (let i = 1; i <= 4; i++) {
      const out = applyStateLog({
        stateText,
        archiveText,
        id: `I${i}`,
        result: 'DONE',
        timestamp: `T${i}`,
        maxLogEntries: 3,
      })
      stateText = out.stateText
      archiveText = out.archiveText
    }
    expect(splitLines(stateText).filter((l) => l.startsWith('- item:'))).toEqual([
      '- item: I4',
      '- item: I3',
      '- item: I2',
    ])
    expect(splitLines(archiveText)).toContain('- item: I1')
    expect(stateText).toContain('## המשך מ: next thing')
  })
})

describe('state-log.mjs (CLI)', () => {
  const cli = resolve(process.cwd(), 'scripts/state/state-log.mjs')
  const dirs = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const mkRepo = (state) => {
    const dir = mkdtempSync(join(tmpdir(), 'state-log-'))
    dirs.push(dir)
    if (state !== undefined) writeFileSync(join(dir, 'STATE.md'), state)
    return dir
  }
  const run = (args, options = {}) =>
    execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', ...options })

  it('writes the block, the resume line and creates the archive directory when needed', () => {
    const body = Array.from({ length: 320 }, (_, i) => `h${i}`)
    const repo = mkRepo(`${['RESUME FROM: XF01', '# T', '', ...body].join('\n')}\n`)
    const stdout = run([
      '--repo',
      repo,
      '--id',
      'XF01',
      '--result',
      'RESULT: DONE',
      '--next',
      'XF02',
      '--timestamp',
      TS,
    ])
    expect(stdout).toMatch(
      /^state-log: XF01 DONE at 2026-10-15T04:12:33\+07:00; STATE\.md \d+ lines, moved \d+ to docs\/STATE-ARCHIVE\.md, resume XF02\n$/,
    )
    const state = readFileSync(join(repo, 'STATE.md'), 'utf8')
    const lines = splitLines(state)
    expect(lines[0]).toBe('RESUME FROM: XF02')
    expect(lines.length).toBeLessThanOrEqual(300)
    expect(state).toContain(`### ${TS}\n- item: XF01\n- RESULT: DONE\n`)
    const archive = readFileSync(join(repo, 'docs', 'STATE-ARCHIVE.md'), 'utf8')
    expect(archive).toContain('h319')
  })

  it('records a BLOCKED reason verbatim', () => {
    const repo = mkRepo(SMALL_STATE)
    run([
      '--repo',
      repo,
      '--id',
      'XF05',
      '--result',
      'RESULT: BLOCKED no deployed URL to feed the vault',
      '--timestamp',
      TS,
    ])
    const state = readFileSync(join(repo, 'STATE.md'), 'utf8')
    expect(state).toContain('- item: XF05\n- BLOCKED: no deployed URL to feed the vault\n')
    expect(splitLines(state)[0]).toBe('RESUME FROM: XF01')
  })

  it('--dry-run prints the block and writes nothing', () => {
    const repo = mkRepo(SMALL_STATE)
    const stdout = run([
      '--repo',
      repo,
      '--id',
      'XF01',
      '--result',
      'DONE',
      '--timestamp',
      TS,
      '--dry-run',
    ])
    expect(stdout).toContain('(dry run)')
    expect(stdout).toContain('- item: XF01')
    expect(readFileSync(join(repo, 'STATE.md'), 'utf8')).toBe(SMALL_STATE)
  })

  it('exits 2 without --id or --result and on an unknown flag', () => {
    const repo = mkRepo(SMALL_STATE)
    for (const args of [
      ['--repo', repo, '--result', 'DONE'],
      ['--repo', repo, '--id', 'X'],
      ['--repo', repo, '--id', 'X', '--result', 'DONE', '--bogus'],
    ]) {
      let status = 0
      try {
        run(args, { stdio: 'pipe' })
      } catch (err) {
        status = err.status
      }
      expect(status).toBe(2)
    }
  })
})
