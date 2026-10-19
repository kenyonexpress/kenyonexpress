import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Constants } from '@/types/database'
import { describe, expect, it } from 'vitest'

/**
 * THE DIAGRAM IS COMPLETE TODAY AND NOTHING HELD IT THERE.
 *
 * `docs/PAYMENT-FLOW.md` draws the payment state machine, and checked
 * 2026-09-08 it covers every value of the `payment_status` enum. That is worth
 * a test rather than a compliment: adding a state is an enum change plus a
 * migration, and neither of those touches a markdown file. The next state would
 * be invisible in the document a reader trusts to be the state machine.
 *
 * The states are `initiated`, `redirected`, `succeeded`, `failed`, `refunded`
 * and `platform_settled`. The brief for this step names `pending`,
 * `authorized`, `captured` and `settled`; the mapping and the reason - Cardcom's
 * Low Profile flow authorises and captures in one step, and the provider
 * interface carries no `capture` verb - are recorded in the document beside the
 * diagram.
 */
const ROOT = resolve(__dirname, '..', '..', '..')
const DOC = readFileSync(join(ROOT, 'docs/PAYMENT-FLOW.md'), 'utf8')

/** The enum as the generated types report it, which describes the hosted database. */
const STATES = Constants.public.Enums.payment_status

describe('every payment state appears in the diagram', () => {
  it('reads the enum from the generated types, not from a hand-written list', () => {
    expect(STATES.length).toBeGreaterThanOrEqual(6)
  })

  for (const state of STATES) {
    it(`${state} is drawn`, () => {
      expect(
        DOC.includes(state),
        `payment_status carries "${state}" and docs/PAYMENT-FLOW.md never names it. A state absent from the diagram is a state nobody reviews.`,
      ).toBe(true)
    })
  }
})

describe('the document explains the states the brief asks for and this system lacks', () => {
  it('names the mapping rather than leaving the reader to notice', () => {
    expect(DOC).toContain('Why there is no `authorized` and no `captured`')
  })

  it('gives the evidence, which is that no call could reach them', () => {
    // The provider interface has no capture verb; a state no call can move a
    // payment into is a state nothing ever leaves.
    const types = readFileSync(join(ROOT, 'src/lib/payments/types.ts'), 'utf8')
    expect(types).not.toMatch(/^\s+capture\(/m)
    expect(DOC).toContain('There is no `capture`')
  })

  it('says the transitions are enforced and by what', () => {
    // Migration 137 is in migrations/applied and installs payments_status_guard.
    expect(DOC).toContain('payments_status_guard')
  })
})
