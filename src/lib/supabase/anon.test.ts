import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGuestCartClient, createPublicClient } from './anon'

const URL_ = 'https://example.supabase.co'
const ANON = 'anon-key'
const SESSION = 'cf5463aa-1fb2-4d5f-93c6-fe0012e1abfb'

let calls: { url: string; headers: Record<string, string> }[] = []

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON
  calls = []
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key.toLowerCase()] = value
    })
    calls.push({ url: String(input), headers })
    return Promise.resolve(
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createGuestCartClient', () => {
  it('sends the session id as the cookie the carts policy reads', async () => {
    await createGuestCartClient(SESSION).from('carts').select('id')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.headers.cookie).toBe(`session_id=${SESSION}`)
  })

  it('carries the anon key and no other credential', async () => {
    await createGuestCartClient(SESSION).from('carts').select('id')
    expect(calls[0]?.headers.apikey).toBe(ANON)
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${ANON}`)
  })

  // The id is read out of a browser cookie and then interpolated into a header.
  // A newline in it would be request splitting, not a bad cart.
  it.each([
    ['a newline', `${SESSION}\r\nX-Injected: 1`],
    ['a stray cookie', `${SESSION}; role=service_role`],
    ['an empty string', ''],
    ['a non-uuid', 'not-a-uuid'],
    ['sql in place of an id', "' OR 1=1 --"],
  ])('refuses %s', (_label, bad) => {
    expect(() => createGuestCartClient(bad)).toThrow(/not a UUID/)
  })
})

describe('createPublicClient', () => {
  it('sends no cookie at all, so it can never be mistaken for a cart client', async () => {
    await createPublicClient().from('products').select('id')
    expect(calls[0]?.headers.cookie).toBeUndefined()
    expect(calls[0]?.headers.apikey).toBe(ANON)
  })

  it('throws when the anon key is absent rather than building a keyless client', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ''
    expect(() => createPublicClient()).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/)
  })
})

/**
 * The point of the change, stated as a test.
 *
 * The cart is reachable without logging in, so whatever key it runs on is a key
 * an anonymous request can reach. It ran on service_role — which bypasses every
 * policy on every table, orders and payouts included — to read the public
 * catalogue and one cart row, neither of which needs it.
 */
describe('the cart runs without an elevated key', () => {
  it('src/server/actions/cart.ts never reaches for the admin client', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/server/actions/cart.ts'), 'utf8')
    expect(source).not.toMatch(/createAdminClient|supabase\/admin/)
  })
})
