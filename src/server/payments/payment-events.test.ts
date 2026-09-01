import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PAYMENT_EVENT_TYPES,
  type PaymentEventAdmin,
  recordPaymentEvent,
} from '@/server/payments/payment-events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/observability/log', () => ({
  log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const MIGRATION_CANDIDATES = [
  'migrations/pending/130_payment_events.sql',
  'supabase/migrations/130_payment_events.sql',
]

const MIGRATION = (() => {
  for (const candidate of MIGRATION_CANDIDATES) {
    const full = resolve(process.cwd(), candidate)
    if (existsSync(full)) return full
  }
  throw new Error(`130_payment_events.sql is in neither ${MIGRATION_CANDIDATES.join(' nor ')}.`)
})()

/**
 * The enum members the migration declares, in declaration order.
 *
 * Writing an event_type the enum does not carry is a 22P02 at runtime, on the
 * money path. This is the only thing standing between an edit to one list and
 * a runtime error in the other.
 */
function enumInMigration(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const start = sql.indexOf('CREATE TYPE public.payment_event_type AS ENUM (')
  if (start === -1) throw new Error('payment_event_type enum not found in the migration')
  const body = sql.slice(start, sql.indexOf(');', start))
  return [...body.matchAll(/'([a-z_]+)'/g)].flatMap((m) => (m[1] ? [m[1]] : []))
}

describe('the enum and the TypeScript union describe the same journal', () => {
  it('holds exactly the members the migration declares, in the same order', () => {
    expect([...PAYMENT_EVENT_TYPES]).toEqual(enumInMigration())
  })

  it('is the 38 the migration was written with, so a silent truncation is caught', () => {
    expect(PAYMENT_EVENT_TYPES).toHaveLength(38)
  })

  it('has no duplicates', () => {
    expect(new Set(PAYMENT_EVENT_TYPES).size).toBe(PAYMENT_EVENT_TYPES.length)
  })
})

/** The one row the stub was called with. Narrowed once, so the assertions below
 * do not each have to prove to TypeScript that a call happened. */
// biome-ignore lint/suspicious/noExplicitAny: a vitest mock's recorded args are untyped by construction.
function firstRow(insert: { mock: { calls: any[][] } }): Record<string, unknown> {
  const row = insert.mock.calls[0]?.[0]
  if (!row) throw new Error('insert was never called')
  return row as Record<string, unknown>
}

function stubAdmin(result: { error: { message: string } | null } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(result)
  const admin = { from: vi.fn(() => ({ insert })) } as unknown as PaymentEventAdmin
  return { admin, insert }
}

describe('recordPaymentEvent writes the row the journal expects', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps every field onto its column', async () => {
    const { admin, insert } = stubAdmin()
    await recordPaymentEvent(
      {
        eventType: 'callback_received',
        stage: 'cardcom_webhook_persist',
        paymentId: 'pay-1',
        orderId: 'ord-1',
        lowProfileId: 'lp-1',
        transactionId: 'tx-1',
        externalEventId: 'ext-1',
        amountAgorot: 1710,
        detail: { note: 'x' },
        actorId: 'user-1',
        actorRole: 'admin',
      },
      admin,
    )
    expect(insert).toHaveBeenCalledTimes(1)
    expect(firstRow(insert)).toMatchObject({
      event_type: 'callback_received',
      stage: 'cardcom_webhook_persist',
      payment_id: 'pay-1',
      order_id: 'ord-1',
      low_profile_id: 'lp-1',
      transaction_id: 'tx-1',
      external_event_id: 'ext-1',
      amount_agorot: 1710,
      detail: { note: 'x' },
      actor_id: 'user-1',
      actor_role: 'admin',
    })
  })

  it('defaults every optional field to null, and detail to an empty object', async () => {
    const { admin, insert } = stubAdmin()
    await recordPaymentEvent({ eventType: 'finalize_started' }, admin)
    const row = firstRow(insert)
    expect(row.detail).toEqual({})
    for (const column of [
      'stage',
      'payment_id',
      'order_id',
      'low_profile_id',
      'transaction_id',
      'external_event_id',
      'amount_agorot',
      'actor_id',
      'actor_role',
    ]) {
      expect(row[column]).toBeNull()
    }
  })

  // Money is integer agorot by project rule. A fractional amount is a bug
  // upstream, and rounding it here would make the journal disagree with the
  // payment it describes.
  it('drops a non-integer amount to null rather than rounding it', async () => {
    const { admin, insert } = stubAdmin()
    await recordPaymentEvent({ eventType: 'verify_succeeded', amountAgorot: 17.5 }, admin)
    expect(firstRow(insert).amount_agorot).toBeNull()
  })

  it('keeps a zero amount, which is a real amount and not a missing one', async () => {
    const { admin, insert } = stubAdmin()
    await recordPaymentEvent({ eventType: 'wallet_credited', amountAgorot: 0 }, admin)
    expect(firstRow(insert).amount_agorot).toBe(0)
  })
})

describe('the journal never becomes a way for the money path to fail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('swallows a database error', async () => {
    const { admin } = stubAdmin({ error: { message: 'duplicate key value' } })
    await expect(
      recordPaymentEvent({ eventType: 'callback_replay' }, admin),
    ).resolves.toBeUndefined()
  })

  it('swallows a client that throws outright', async () => {
    const admin = {
      from: () => {
        throw new Error('connection refused')
      },
    } as unknown as PaymentEventAdmin
    await expect(
      recordPaymentEvent({ eventType: 'finalize_failed' }, admin),
    ).resolves.toBeUndefined()
  })

  it('swallows a rejected insert', async () => {
    const admin = {
      from: () => ({ insert: () => Promise.reject(new Error('socket hang up')) }),
    } as unknown as PaymentEventAdmin
    await expect(recordPaymentEvent({ eventType: 'refund_failed' }, admin)).resolves.toBeUndefined()
  })
})
