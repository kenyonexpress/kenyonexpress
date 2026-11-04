import { agorot } from '@/lib/commerce/money'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S07, GUEST CHECKOUT: the server half of "a guest can reach payment".
 *
 * submitCheckout used to answer 'יש להתחבר לפני התשלום' to anybody without a
 * session, and the form sent them to Google before the card. Now the action
 * mints an anonymous session itself, moves the cookie cart onto it, requires
 * and stores the guest's email, saves the shipping address on that user, and
 * hands over to beginCheckout - which is stopped here by its own rate limit,
 * the cheapest exit AFTER the guest has been let through.
 */

type Result = { data: unknown; error: unknown }
const calls: { table: string; op: string; payload?: unknown }[] = []
const results = new Map<string, Result>()

function builder(table: string, op: string, payload?: unknown): never {
  calls.push({ table, op, payload })
  const settle = () => results.get(`${table}.${op}`) ?? { data: null, error: null }
  const proxy: unknown = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown) => Promise.resolve(settle()).then(resolve)
        }
        return () => {
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle())
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder(table, 'select', args[0]),
    insert: (payload: unknown) => builder(table, 'insert', payload),
    update: (payload: unknown) => builder(table, 'update', payload),
    upsert: (payload: unknown) => builder(table, 'upsert', payload),
  }),
  rpc: (name: string, payload: unknown) => builder(`rpc:${name}`, 'rpc', payload),
}

const ANON_ID = '77777777-7777-4777-8777-777777777777'
const ACCOUNT_ID = '88888888-8888-4888-8888-888888888888'

type TestUser = { id: string; is_anonymous?: boolean; email?: string } | null
let currentUser: TestUser = null
const signInAnonymously = vi.fn(async () => {
  currentUser = { id: ANON_ID, is_anonymous: true }
  return { data: { user: currentUser }, error: null }
})

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }), signInAnonymously },
  }),
}))
const checkRateLimit = vi.hoisted(() => vi.fn(async (_key: string) => true))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit,
  getClientIp: async () => '203.0.113.10',
}))
vi.mock('@/lib/payments', () => ({
  loadCardcomEnv: () => ({ checkoutEnabled: true, terminalNumber: '1000', appUrl: 'x' }),
  getCardcomAccounts: () => [],
  getPaymentProvider: () => ({}),
}))
vi.mock('@/lib/observability/sentry', () => ({ capturePaymentError: vi.fn() }))
vi.mock('@/server/analytics/track', () => ({
  linkAnalyticsIdentity: vi.fn(),
  stampOrderAttribution: vi.fn(),
  trackServerEvent: vi.fn(),
}))
vi.mock('@/lib/cart/guest-session', () => ({ getGuestSessionId: async () => 'guest-session-1' }))

const mergeGuestCart = vi.fn(async (..._args: unknown[]) => true)
vi.mock('@/server/actions/cart', () => ({
  getCart: async () => ({
    id: 'cart-1',
    items: [{ product_id: 'p', type: 'physical', available: true, quantity: 1 }],
    total: agorot(12000),
  }),
  mergeGuestCart: (...args: unknown[]) => mergeGuestCart(...args),
  resolveCheckoutDiscountAgorot: async () => ({ code: null, discountAgorot: 0 }),
}))

const { submitCheckout } = await import('./checkout')

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

const PHYSICAL_ORDER = {
  first_name: 'דנה',
  last_name: 'כהן',
  phone: '0501234567',
  email: ' Dana@Example.com ',
  needs_address: 'true',
  city: 'תל אביב',
  street: 'הרצל',
  street_number: '10',
  client_ref: '66666666-6666-4666-8666-666666666666',
  accept_terms: 'on',
}

/** Lets the guest through and stops beginCheckout at its first gate. */
function stopAtBeginCheckout() {
  checkRateLimit.mockImplementation(async (key: string) => !key.startsWith('begin_checkout'))
}

beforeEach(() => {
  calls.length = 0
  results.clear()
  currentUser = null
  signInAnonymously.mockClear()
  mergeGuestCart.mockClear()
  checkRateLimit.mockReset()
  checkRateLimit.mockResolvedValue(true)
  results.set('user_addresses.insert', { data: { id: 'addr-1' }, error: null })
})

describe('submitCheckout: a guest reaches payment without an account', () => {
  it('mints an anonymous session, moves the cart, and goes on to beginCheckout', async () => {
    stopAtBeginCheckout()
    const state = await submitCheckout(null, form(PHYSICAL_ORDER))

    expect(signInAnonymously).toHaveBeenCalledTimes(1)
    expect(mergeGuestCart).toHaveBeenCalledWith(expect.anything(), ANON_ID, 'guest-session-1')
    // RATE_LIMITED is beginCheckout's answer: the guest got past every gate of
    // the form wrapper, which used to stop them with "sign in first".
    expect(state).toEqual(expect.objectContaining({ code: 'RATE_LIMITED' }))
    expect(JSON.stringify(state)).not.toContain('יש להתחבר')
  })

  it('stores the email, normalised, on the guest profile', async () => {
    stopAtBeginCheckout()
    await submitCheckout(null, form(PHYSICAL_ORDER))
    const upsert = calls.find((c) => c.table === 'profiles' && c.op === 'upsert')
    expect(upsert?.payload).toEqual({
      id: ANON_ID,
      email: 'dana@example.com',
      full_name: 'דנה כהן',
      phone: '0501234567',
    })
  })

  it('saves the shipping address on the guest user as the default for next time', async () => {
    stopAtBeginCheckout()
    await submitCheckout(null, form(PHYSICAL_ORDER))
    const insert = calls.find((c) => c.table === 'user_addresses' && c.op === 'insert')
    expect(insert?.payload).toEqual(
      expect.objectContaining({ user_id: ANON_ID, city: 'תל אביב', is_default: true }),
    )
  })

  it('writes no address for a cart that does not need one', async () => {
    stopAtBeginCheckout()
    await submitCheckout(null, form({ ...PHYSICAL_ORDER, needs_address: 'false' }))
    expect(calls.some((c) => c.table === 'user_addresses' && c.op === 'insert')).toBe(false)
  })
})

describe('submitCheckout: the guest email is required', () => {
  it('refuses a guest with no email before anything is saved', async () => {
    const state = await submitCheckout(null, form({ ...PHYSICAL_ORDER, email: '' }))
    expect(state).toEqual({
      error: 'יש להזין כתובת אימייל תקינה לקבלת ההזמנה',
      code: 'VALIDATION',
    })
    expect(calls.some((c) => c.op === 'upsert' || c.op === 'insert')).toBe(false)
  })

  it('refuses a malformed email', async () => {
    const state = await submitCheckout(null, form({ ...PHYSICAL_ORDER, email: 'not-an-email' }))
    expect(state).toEqual(expect.objectContaining({ code: 'VALIDATION' }))
  })

  it('lets a returning guest pay with the email saved on the last order', async () => {
    stopAtBeginCheckout()
    currentUser = { id: ANON_ID, is_anonymous: true }
    results.set('profiles.select', { data: { email: 'dana@example.com' }, error: null })
    const state = await submitCheckout(
      null,
      form({ ...PHYSICAL_ORDER, email: '', needs_address: 'true', address_id: 'addr-1' }),
    )
    // Same anonymous user, no second one minted.
    expect(signInAnonymously).not.toHaveBeenCalled()
    expect(state).toEqual(expect.objectContaining({ code: 'RATE_LIMITED' }))
  })
})

describe('submitCheckout: what a guest session does not touch', () => {
  it('a signed-in customer is not asked for a guest email and gets no profile write', async () => {
    stopAtBeginCheckout()
    currentUser = { id: ACCOUNT_ID, email: 'a@b.co' }
    await submitCheckout(null, form({ ...PHYSICAL_ORDER, email: '' }))
    expect(signInAnonymously).not.toHaveBeenCalled()
    expect(calls.some((c) => c.table === 'profiles' && c.op === 'upsert')).toBe(false)
  })

  it('mints no anonymous user once the per-IP ceiling is reached', async () => {
    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith('guest_identity'))
    const state = await submitCheckout(null, form(PHYSICAL_ORDER))
    expect(signInAnonymously).not.toHaveBeenCalled()
    expect(state).toEqual(expect.objectContaining({ code: 'GUEST_UNAVAILABLE' }))
  })
})
