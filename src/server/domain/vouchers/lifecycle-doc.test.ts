import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STATUS_TRANSITIONS } from '@/server/domain/orders/status-transitions'
import { describe, expect, it } from 'vitest'
import { VOUCHER_STATES } from './state-machine'

/**
 * `docs/VOUCHER-LIFECYCLE.md` and the guard describe the same machine.
 *
 * WHY A DOCUMENT GETS A TEST. On 2026-09-01 this file said, in bold, that there
 * was no transition guard on `vouchers` and that "a `service_role` statement can
 * put a voucher into any state the enum carries". It was accurate that day.
 * `166_voucher_transition_guard.sql` applied on 2026-09-03 and made it false,
 * and it stayed false for six days.
 *
 * That is worse than an out-of-date sentence. It is an instruction: someone
 * fixing a stuck voucher reads "the database will not refuse on your behalf",
 * writes the repair `UPDATE`, and gets a 23514 they were told could not happen.
 * A document that says you are unprotected when you are protected sends people
 * down a path that no longer exists.
 *
 * WHAT IS CHECKED, AND WHAT DELIBERATELY IS NOT. The mermaid diagram is parsed
 * and diffed against the transition table, so an arrow cannot rot. The prose is
 * checked only for the specific claim that was wrong, because a test that
 * greps English for correctness is a test that fails on rewording. The negated
 * form is what this catches: the sentence coming back.
 */
const DOC = resolve(process.cwd(), 'docs/VOUCHER-LIFECYCLE.md')
const source = readFileSync(DOC, 'utf8')

/**
 * `from --> to : label` inside the first stateDiagram block, ignoring the
 * `[*]` pseudo-states, which are diagram punctuation and not enum values.
 */
function arrowsInDiagram(): Set<string> {
  const start = source.indexOf('```mermaid')
  const end = source.indexOf('```', start + 3)
  const block = source.slice(start, end)
  const arrows = new Set<string>()
  for (const match of block.matchAll(/^\s*(\S+)\s*-->\s*([^\s:]+)/gm)) {
    const [, from, to] = match
    if (!from || !to || from === '[*]' || to === '[*]') continue
    arrows.add(`${from}->${to}`)
  }
  return arrows
}

describe('the voucher lifecycle document', () => {
  it('draws exactly the transitions the database guard permits', () => {
    const expected = new Set<string>()
    for (const [from, tos] of Object.entries(STATUS_TRANSITIONS['vouchers.status'])) {
      for (const to of tos) expected.add(`${from}->${to}`)
    }
    expect([...arrowsInDiagram()].sort()).toEqual([...expected].sort())
  })

  it('names every live state somewhere in the prose', () => {
    for (const state of VOUCHER_STATES) {
      expect(source, `${state} is a live enum value the document never mentions`).toContain(state)
    }
  })

  it('does not claim the vouchers table is unguarded', () => {
    // The exact claim that was false from 2026-09-03 to 2026-09-09. The
    // corrected section quotes the old sentence on purpose, so matching a bare
    // "no transition guard" would fail on the correction itself; what must not
    // come back is the assertion stated as current fact.
    const asCurrentFact = /\*\*There is no transition guard on `vouchers`\.\*\*/
    expect(
      asCurrentFact.test(source),
      'tg_vouchers_status_guard has been live since 2026-09-03; this document says it is not',
    ).toBe(false)
  })

  it('names the migration that installed the guard', () => {
    // The reader who needs to know WHEN the behaviour changed needs the number,
    // because the answer to "why did my repair script start failing" is a date.
    expect(source).toContain('166_voucher_transition_guard.sql')
    expect(source).toContain('tg_vouchers_status_guard')
  })
})
