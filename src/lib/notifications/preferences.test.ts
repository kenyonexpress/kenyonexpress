import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHANNELS,
  CUSTOMER_TOGGLE_CHANNELS,
  EMAIL_POLICY_EXEMPT_KINDS,
  KIND_LABEL_HE,
  OPERATOR_EMAIL_KINDS,
  OPTIONAL_KINDS,
  type PreferenceRow,
  REQUIRED_KINDS,
  isOperatorEmailKind,
  isPreferenceKind,
  mayNotify,
  preferenceMatrix,
} from './preferences'

const ROOT = resolve(__dirname, '../../..')

describe('a customer cannot switch off the thing they bought', () => {
  it('sends a required kind even when a row says otherwise, on every non-email channel', () => {
    // Checked BEFORE the table, so a stray row -- from a bug, a migration, or
    // somebody with SQL access -- cannot stop a receipt. The support ticket
    // this prevents is "I bought it and nothing arrived", answered by a setting
    // the customer turned off six weeks earlier and does not remember.
    //
    // Email is excluded here: the owner's 22.09.2026 policy blocks it for
    // EVERY required kind except `voucher_gifted` (below), so a required kind
    // being unstoppable no longer means it is unstoppable on every channel --
    // it means it is unstoppable on whichever channels still carry it.
    const rows: PreferenceRow[] = REQUIRED_KINDS.flatMap((kind) =>
      CHANNELS.map((channel) => ({ kind, channel, enabled: false })),
    )
    for (const kind of REQUIRED_KINDS) {
      for (const channel of CUSTOMER_TOGGLE_CHANNELS) {
        expect(mayNotify(kind, channel, rows), `${kind}/${channel}`).toBe(true)
      }
    }
  })

  it('keeps the required list short and made of product or money', () => {
    // Pinned by name. The list grows by somebody deciding a message is
    // "important", which is not the test -- the test is whether the message IS
    // the thing bought, or is the record of money moving.
    expect([...REQUIRED_KINDS]).toEqual([
      'order_paid',
      'voucher_issued',
      'voucher_gifted',
      'refund_completed',
    ])
  })
})

describe('an optional kind honours the table', () => {
  it('is on when nothing has been decided', () => {
    // Silence means the customer has never opened the settings page -- which is
    // all of them today, since the table is empty. Treating that as "do not
    // contact me" would stop every expiry reminder in the system. Checked on
    // `push`, not `email`: email is off unconditionally for this kind now (see
    // the owner-policy block below), so it can no longer demonstrate "honours
    // the table" on its own.
    expect(mayNotify('voucher_expiring', 'push', [])).toBe(true)
  })

  it('is off when a row says so, per channel', () => {
    const rows: PreferenceRow[] = [{ kind: 'voucher_expiring', channel: 'push', enabled: false }]
    expect(mayNotify('voucher_expiring', 'push', rows)).toBe(false)
    // The other channels are untouched: switching off the push is not
    // switching off in-app.
    expect(mayNotify('voucher_expiring', 'in_app', rows)).toBe(true)
  })

  it('does not let one kind\u2019s row govern another', () => {
    const rows: PreferenceRow[] = [{ kind: 'welcome', channel: 'push', enabled: false }]
    expect(mayNotify('cashback_credited', 'push', rows)).toBe(true)
  })
})

describe('owner policy, 22.09.2026: no customer email except password reset', () => {
  it('blocks email for every required and optional kind except voucher_gifted', () => {
    for (const kind of [...REQUIRED_KINDS, ...OPTIONAL_KINDS]) {
      const expected = (EMAIL_POLICY_EXEMPT_KINDS as readonly string[]).includes(kind)
      expect(mayNotify(kind, 'email', []), kind).toBe(expected)
    }
  })

  it('cannot be worked around by a preference row saying otherwise', () => {
    const rows: PreferenceRow[] = [{ kind: 'welcome', channel: 'email', enabled: true }]
    expect(mayNotify('welcome', 'email', rows)).toBe(false)
  })

  it('still delivers voucher_gifted by email -- the recipient has no account to read it in', () => {
    expect(mayNotify('voucher_gifted', 'email', [])).toBe(true)
  })

  it('leaves operator alerts on email untouched', () => {
    for (const kind of OPERATOR_EMAIL_KINDS) {
      expect(isOperatorEmailKind(kind), kind).toBe(true)
      expect(mayNotify(kind, 'email', []), kind).toBe(true)
    }
  })

  it('does not affect non-email channels for the same kinds', () => {
    expect(mayNotify('voucher_issued', 'in_app', [])).toBe(true)
    expect(mayNotify('voucher_expiring', 'push', [])).toBe(true)
  })
})

describe('operator alerts have no preference', () => {
  it('is not a preference kind', () => {
    // They go to a fixed operator address, not to a user, so a per-user row
    // would be a row nobody owns. Refused rather than silently defaulted,
    // because a setting that appears to exist and governs nothing is worse than
    // no setting.
    for (const kind of ['invoice_dead', 'low_stock', 'reconciliation_gap']) {
      expect(isPreferenceKind(kind), kind).toBe(false)
      expect(mayNotify(kind, 'email', [])).toBe(true)
    }
  })
})

describe('the settings page', () => {
  it('offers the optional kinds only, never a disabled switch', () => {
    // A greyed-out switch labelled "cannot be turned off" reads as a broken
    // switch and invites the conversation this design avoids.
    const matrix = preferenceMatrix([])
    expect(matrix.map((row) => row.kind)).toEqual([...OPTIONAL_KINDS])
    for (const required of REQUIRED_KINDS) {
      expect(matrix.some((row) => (row.kind as string) === required)).toBe(false)
    }
  })

  it('has a Hebrew label for every switch it will render', () => {
    for (const kind of OPTIONAL_KINDS) {
      expect(KIND_LABEL_HE[kind], kind).toMatch(/[֐-׿]/)
    }
  })

  it('reflects a stored row in the matrix it hands the page', () => {
    const matrix = preferenceMatrix([{ kind: 'welcome', channel: 'push', enabled: false }])
    const welcome = matrix.find((row) => row.kind === 'welcome')
    expect(welcome?.channels.push).toBe(false)
    expect(welcome?.channels.in_app).toBe(true)
  })

  it('never renders an email column -- the owner policy makes every row inert there', () => {
    const matrix = preferenceMatrix([])
    for (const row of matrix) {
      expect('email' in row.channels, row.kind).toBe(false)
    }
  })
})

describe('every kind here is a kind the system can actually send', () => {
  it('names nothing the notification union does not', () => {
    // A preference for a kind that cannot be enqueued is a switch that governs
    // nothing, which is the same defect the operator alerts are refused for --
    // and it arrives by a kind being renamed on one side only.
    const source = readFileSync(join(ROOT, 'src/lib/email/notifications.ts'), 'utf8')
    const union = source.slice(
      source.indexOf('export type NotificationKind'),
      source.indexOf('function escapeHtml'),
    )
    const kinds = new Set([...union.matchAll(/\|\s*'([a-z_]+)'/g)].map((m) => m[1] as string))

    const unknown = [...REQUIRED_KINDS, ...OPTIONAL_KINDS].filter((kind) => !kinds.has(kind))
    expect(unknown, `not sendable: ${unknown.join(', ')}`).toEqual([])
  })
})
