import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * THE ROUTE'S JOB IS THE IRREVERSIBLE HALF: it sends mail.
 *
 * Eligibility lives in `fn_due_abandoned_carts` and is not re-implemented here.
 * What IS here, and what these tests hold, are the four things that can only go
 * wrong on this side of the RPC:
 *
 * 1. THE CEILING IN FRONT OF THE SEND. Every other guard on "at most two" fires
 *    on the INSERT, which happens after the mail is already gone. A due row
 *    claiming reminder 3 has to be refused before `sendEmail`, not after.
 *
 * 2. THE PRE-MIGRATION DEGRADE. `reminder_number` ships in pending/190. Before
 *    it, the deployed function returns rows without that column and the route
 *    must read them as reminder 1 and record them without it -- 42703 fails the
 *    whole INSERT, so a blind write would send mail and lose the receipt.
 *
 * 3. A RECEIPT FOR EVERY SEND. A nudge row that is not written is a message
 *    that will be sent again on the next run, to the same person, about the
 *    same cart. That is the shape of a complaint, so it is loud.
 *
 * 4. NO CONTENTS, NO MAIL. The whole message is the cart's contents now, so a
 *    cart that cannot be priced must produce no email rather than an empty one.
 *
 * The auth gate is NOT retested here. `route.test.ts` beside this file already
 * holds all three of its cases -- no credential, wrong credential, and the one
 * that matters most, an unset CRON_SECRET staying closed rather than opening --
 * and it proves them with mocks that assert the database is never touched. A
 * fourth, weaker copy here would be the one somebody reads.
 */

type Result = { data: unknown; error: unknown }

const scenario = {
  due: { data: [] as unknown[], error: null } as Result,
  /** The cart row the router prices. */
  cartItems: [{ product_id: 'p-1', variant_id: null, quantity: 2 }] as unknown[],
  /** Set to fail the insert that names reminder_number. */
  insertErrorWithReminder: null as unknown,
  insertError: null as unknown,
  sendResult: { ok: true, id: 'msg-1' } as Record<string, unknown>,
}

const inserts: Record<string, unknown>[] = []
const sends: { subject: string; html: string }[] = []
const tracked: { event: string; props: Record<string, unknown> }[] = []
const errors: string[] = []

function makeBuilder() {
  let table = ''
  let pending: Result | null = null
  const builder: Record<string, unknown> = {}
  for (const method of ['is', 'not', 'or', 'in', 'order', 'limit']) builder[method] = () => builder
  builder.eq = () => builder
  builder.select = () => builder
  builder.maybeSingle = () => builder
  builder.from = (t: string) => {
    table = t
    pending = null
    return builder
  }
  builder.insert = (payload: Record<string, unknown>) => {
    // `job_runs` is written by withJobRun around every cron handler and is not
    // this route's work. Recording it here would make `inserts[0]` the
    // telemetry row rather than the reminder, which is a test asserting on the
    // wrapper it did not mean to test.
    if (table !== 'job_runs') inserts.push(payload)
    pending = {
      data: null,
      error: Object.hasOwn(payload, 'reminder_number')
        ? (scenario.insertErrorWithReminder ?? scenario.insertError)
        : scenario.insertError,
    }
    return builder
  }
  // biome-ignore lint/suspicious/noThenProperty: a PostgREST builder is thenable
  builder.then = (resolve: (v: unknown) => unknown) => {
    if (pending) return resolve({ ...pending })
    if (table === 'carts') return resolve({ data: { items: scenario.cartItems }, error: null })
    if (table === 'newsletter_subscribers') {
      return resolve({ data: { unsubscribe_token: 'tok' }, error: null })
    }
    return resolve({ data: null, error: null })
  }
  return builder
}

const admin = {
  from: (table: string) => (makeBuilder().from as (t: string) => unknown)(table),
  rpc: async () => ({ ...scenario.due }),
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/growth/resend', () => ({
  sendEmail: async (input: { subject: string; html: string }) => {
    sends.push({ subject: input.subject, html: input.html })
    return scenario.sendResult
  },
}))
vi.mock('@/lib/observability/posthog', () => ({
  trackEvent: (event: string, props: Record<string, unknown>) => {
    tracked.push({ event, props })
  },
}))
vi.mock('@/lib/observability/log', () => ({
  log: {
    error: (event: string) => errors.push(event),
    warn: (event: string) => errors.push(event),
    info: () => {},
    debug: () => {},
  },
}))
vi.mock('@/lib/observability/with-request-log', () => ({
  withRequestLog: (_name: string, handler: (r: unknown) => unknown) => (r: unknown) => handler(r),
}))
vi.mock('@/lib/cart/load-products', () => ({
  loadCartProductData: async () => ({ products: new Map(), variants: new Map() }),
}))
vi.mock('@/lib/cart/pricing', () => ({
  buildCartView: (id: string, items: unknown[]) => ({
    id,
    items: items.map((_, i) => ({
      name_he: `מוצר ${i}`,
      quantity: 2,
      line_total: 1000,
    })),
    item_count: items.length,
    subtotal: 1000,
    total: 1000,
    discount: 0,
  }),
}))

const { GET } = await import('./route')

const CART = 'c1111111-1111-4111-8111-111111111111'
const USER = 'u1111111-1111-4111-8111-111111111111'

function dueRow(over: Record<string, unknown> = {}) {
  return { cart_id: CART, user_id: USER, email: 'a@b.co', item_count: 1, ...over }
}

function call() {
  process.env.CRON_SECRET = 's3cret'
  return GET(
    new Request('https://x/api/cron/abandoned-cart', {
      headers: { authorization: 'Bearer s3cret' },
    }) as never,
  )
}

beforeEach(() => {
  scenario.due = { data: [], error: null }
  scenario.cartItems = [{ product_id: 'p-1', variant_id: null, quantity: 2 }]
  scenario.insertError = null
  scenario.insertErrorWithReminder = null
  scenario.sendResult = { ok: true, id: 'msg-1' }
  inserts.length = 0
  sends.length = 0
  tracked.length = 0
  errors.length = 0
})

describe('the abandoned-cart cron', () => {
  it('sends the first reminder and records it numbered', async () => {
    scenario.due = { data: [dueRow({ reminder_number: 1 })], error: null }
    const res = await call()
    expect(await res.json()).toMatchObject({ ok: true, sent: 1 })
    expect(sends).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ reminder_number: 1, cart_id: CART })
  })

  it('sends a different message for the second reminder', async () => {
    scenario.due = { data: [dueRow({ reminder_number: 1 })], error: null }
    await call()
    const first = sends[0]
    sends.length = 0
    inserts.length = 0
    scenario.due = { data: [dueRow({ reminder_number: 2 })], error: null }
    await call()
    expect(sends[0]?.subject).not.toBe(first?.subject)
    expect(inserts[0]).toMatchObject({ reminder_number: 2 })
  })

  /**
   * Test 1 in the header. The constraint and the SQL both cap this at two, and
   * both of them get their say AFTER the mail has left.
   */
  it('refuses a third reminder BEFORE sending, not after', async () => {
    scenario.due = { data: [dueRow({ reminder_number: 3 })], error: null }
    const res = await call()
    expect(sends).toHaveLength(0)
    expect(inserts).toHaveLength(0)
    expect(await res.json()).toMatchObject({ sent: 0, skipped: 1 })
    expect(errors).toContain('abandoned_cart.reminder_out_of_range')
  })

  /**
   * Test 2. Before pending/190 the deployed function returns no
   * `reminder_number` at all.
   */
  it('reads a row with no reminder_number as the first reminder', async () => {
    scenario.due = { data: [dueRow()], error: null }
    await call()
    expect(sends).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ reminder_number: 1 })
  })

  it('retries the receipt without the column when the database lacks it', async () => {
    scenario.due = { data: [dueRow()], error: null }
    scenario.insertErrorWithReminder = { code: '42703' }
    const res = await call()
    expect(inserts).toHaveLength(2)
    expect(Object.hasOwn(inserts[1] ?? {}, 'reminder_number')).toBe(false)
    expect(await res.json()).toMatchObject({ sent: 1 })
  })

  /** Test 3. */
  it('reports loudly when the mail went out and the receipt did not', async () => {
    scenario.due = { data: [dueRow()], error: null }
    scenario.insertError = { code: '57014' }
    const res = await call()
    expect(sends).toHaveLength(1)
    expect(errors).toContain('abandoned_cart.nudge_not_recorded')
    expect(await res.json()).toMatchObject({ sent: 0, failed: 1 })
  })

  /** Test 4. */
  it('sends nothing for a cart with no items left to describe', async () => {
    scenario.due = { data: [dueRow()], error: null }
    scenario.cartItems = []
    const res = await call()
    expect(sends).toHaveLength(0)
    expect(inserts).toHaveLength(0)
    expect(await res.json()).toMatchObject({ skipped: 1 })
  })

  /**
   * A skipped send writes NO receipt. Writing one would burn an allowance on a
   * message nobody got, and with two reminders it also mis-numbers the rest of
   * the sequence.
   */
  it('writes no receipt when the provider is not configured', async () => {
    scenario.due = { data: [dueRow()], error: null }
    scenario.sendResult = { skipped: true }
    const res = await call()
    expect(inserts).toHaveLength(0)
    expect(await res.json()).toMatchObject({ sent: 0, skipped: 1 })
  })

  it('emits the send half of the funnel against the customer id', async () => {
    scenario.due = { data: [dueRow({ reminder_number: 2 })], error: null }
    await call()
    expect(tracked).toEqual([
      {
        event: 'abandoned_cart_reminder_sent',
        props: expect.objectContaining({ cart_id: CART, reminder_number: 2 }),
      },
    ])
  })

  it('does not emit a send event for a message that was not sent', async () => {
    scenario.due = { data: [dueRow()], error: null }
    scenario.sendResult = { ok: false }
    await call()
    expect(tracked).toHaveLength(0)
  })
})
