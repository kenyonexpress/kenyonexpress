import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The supplier portal's authorization layer.
 *
 * `roles.ts` covers the rank arithmetic and is tested. This file is the part
 * that decides WHO the caller is, and it was not tested at all. Three of its
 * decisions are security decisions and none of them fails loudly when reversed:
 * which Supabase client the membership is read through, whether `is_active` is
 * honoured, and whether the `next` parameter is sanitised before it becomes a
 * redirect.
 *
 * The last one matters more here than in most apps. A supplier reaches this
 * portal by scanning a QR code, so `next` arrives inside a URL a stranger can
 * print on a sticker and leave on a counter.
 */

const getUser = vi.fn()
const from = vi.fn()
const redirect = vi.fn((path: string) => {
  // Next's redirect() throws to unwind the render. Tests that expect a redirect
  // therefore have to catch, and code after a redirect must not run.
  throw new Error(`NEXT_REDIRECT:${path}`)
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser }, from }),
}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => redirect(path),
}))

import {
  getSupplierMemberships,
  getSupplierSession,
  requireSupplierMember,
  requireSupplierRole,
} from './rbac'

type Row = { supplier_id: string; member_role: string | null; suppliers?: { name?: string } | null }

/**
 * The `supplier_members` query builder, recording what it was filtered by.
 *
 * PostgREST builders are awaitable AND chainable: getSupplierSession ends in
 * `.maybeSingle()` while getSupplierMemberships awaits the builder itself. So
 * this is a real Promise with the chain methods hung off it, rather than a
 * plain object carrying a `then` key, which is a genuine footgun elsewhere and
 * one biome refuses on sight.
 */
function membershipQuery(rows: Row[]) {
  const filters: Record<string, unknown> = {}
  const chain = Promise.resolve({ data: rows, error: null }) as Promise<unknown> &
    Record<string, unknown>
  Object.assign(chain, {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      filters[column] = value
      return chain
    },
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
  })
  return { chain, filters }
}

const OWNER: Row = { supplier_id: 'sup-1', member_role: 'owner', suppliers: { name: 'ספא הרצליה' } }

describe('reading the caller supplier membership', () => {
  let filters: Record<string, unknown>

  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } })
    redirect.mockClear()
    const q = membershipQuery([OWNER])
    filters = q.filters
    from.mockReset().mockReturnValue(q.chain)
  })

  it('returns null for a caller who is not signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await getSupplierSession()).toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('returns null for a signed-in user with no membership', async () => {
    from.mockReturnValue(membershipQuery([]).chain)
    expect(await getSupplierSession()).toBeNull()
  })

  it('reads through the user-scoped client, so RLS applies', async () => {
    // The service-role client would return every supplier's membership rows
    // regardless of who is asking, and this function would happily hand back
    // the first one.
    await getSupplierSession()
    expect(from).toHaveBeenCalledWith('supplier_members')
    expect(filters.user_id).toBe('user-1')
  })

  it('ignores a deactivated membership', async () => {
    // Removing a member is done by clearing is_active, not by deleting the row.
    // Dropping this filter silently re-admits every former employee.
    await getSupplierSession()
    expect(filters.is_active).toBe(true)
  })

  it('carries the supplier name through for the portal header', async () => {
    expect((await getSupplierSession())?.supplierName).toBe('ספא הרצליה')
  })

  it('survives the supplier join arriving as an array', async () => {
    // PostgREST returns an embedded one-to-one as an object or as a
    // single-element array depending on how it inferred the relationship.
    from.mockReturnValue(
      membershipQuery([
        { supplier_id: 'sup-1', member_role: 'owner', suppliers: [{ name: 'ספא' }] as never },
      ]).chain,
    )
    expect((await getSupplierSession())?.supplierName).toBe('ספא')
  })

  it('treats an unknown role as the least privileged one', async () => {
    from.mockReturnValue(membershipQuery([{ ...OWNER, member_role: 'superuser' }]).chain)
    expect((await getSupplierSession())?.memberRole).toBe('scanner')
  })
})

describe('every supplier the caller staffs, not just the first', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } })
    from.mockReset()
  })

  it('returns them all', async () => {
    // getSupplierSession answers "whose portal am I in" and takes the earliest
    // membership. That is the wrong question when deciding whether a voucher
    // belongs to this scanner: redeem_voucher matches the FULL membership set,
    // and an app-side check that disagrees would refuse a member of two
    // businesses their own second business's vouchers.
    from.mockReturnValue(
      membershipQuery([
        { supplier_id: 'sup-1', member_role: 'owner' },
        { supplier_id: 'sup-2', member_role: 'scanner' },
      ]).chain,
    )
    expect(await getSupplierMemberships()).toEqual(['sup-1', 'sup-2'])
  })

  it('returns nothing for a signed-out caller rather than throwing', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await getSupplierMemberships()).toEqual([])
  })
})

describe('the page guard', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } })
    redirect.mockClear()
    from.mockReset().mockReturnValue(membershipQuery([OWNER]).chain)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  /** Runs the guard and returns the path it redirected to, or null. */
  async function redirectedTo(run: () => Promise<unknown>): Promise<string | null> {
    try {
      await run()
      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      return message.startsWith('NEXT_REDIRECT:') ? message.slice('NEXT_REDIRECT:'.length) : null
    }
  }

  it('lets a member straight through', async () => {
    const session = await requireSupplierMember()
    expect(session.supplierId).toBe('sup-1')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('sends a signed-out caller to log in, carrying where they were going', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    from.mockReturnValue(membershipQuery([]).chain)
    const to = await redirectedTo(() => requireSupplierMember('/supplier/orders'))
    expect(to).toBe('/login?next=%2Fsupplier%2Forders')
  })

  it('sends a signed-in NON-member somewhere else entirely', async () => {
    // "Who are you" and "you are not staff here" are different answers, and
    // returning someone to a login form they have already satisfied is the
    // second dressed up as the first.
    from.mockReturnValue(membershipQuery([]).chain)
    const to = await redirectedTo(() => requireSupplierMember('/supplier/orders'))
    expect(to).toBe('/supplier/access-denied')
  })

  describe('the next parameter, which arrives from a scanned QR code', () => {
    it.each([
      ['//evil.example', 'a protocol-relative URL a browser follows off-site'],
      ['https://evil.example/steal', 'an absolute URL'],
      ['/\\evil.example', 'a backslash variant of the same trick'],
    ])('refuses to send the caller to %s', async (hostile) => {
      getUser.mockResolvedValue({ data: { user: null } })
      from.mockReturnValue(membershipQuery([]).chain)
      const to = await redirectedTo(() => requireSupplierMember(hostile))
      expect(to).not.toBeNull()
      const next = decodeURIComponent(String(to).replace('/login?next=', ''))
      expect(next.startsWith('/')).toBe(true)
      expect(next.startsWith('//')).toBe(false)
      expect(next).not.toContain('evil.example')
    })

    it('keeps an ordinary in-app path intact', async () => {
      getUser.mockResolvedValue({ data: { user: null } })
      from.mockReturnValue(membershipQuery([]).chain)
      const to = await redirectedTo(() => requireSupplierMember('/supplier/redemptions'))
      expect(to).toBe('/login?next=%2Fsupplier%2Fredemptions')
    })
  })
})

describe('the role gate on top of membership', () => {
  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } })
    redirect.mockClear()
    from.mockReset()
  })

  async function roleCheck(role: string, minimum: 'scanner' | 'manager' | 'owner') {
    from.mockReturnValue(membershipQuery([{ ...OWNER, member_role: role }]).chain)
    try {
      await requireSupplierRole(minimum)
      return 'allowed'
    } catch (error) {
      return error instanceof Error ? error.message : 'threw'
    }
  }

  it('lets an owner into an owner-only screen', async () => {
    expect(await roleCheck('owner', 'owner')).toBe('allowed')
  })

  it('lets an owner into a screen that only needs a scanner', async () => {
    expect(await roleCheck('owner', 'scanner')).toBe('allowed')
  })

  it('keeps a scanner out of the payouts screen', async () => {
    // /supplier/payouts requires owner. A scanner is the till, and the till
    // must not read the business's settlement history.
    expect(await roleCheck('scanner', 'owner')).toBe('NEXT_REDIRECT:/supplier?denied=role')
  })

  it('keeps a manager out of an owner-only screen', async () => {
    expect(await roleCheck('manager', 'owner')).toBe('NEXT_REDIRECT:/supplier?denied=role')
  })

  it('sends a refused caller back to the portal, not to a login form', async () => {
    // They are staff. Asking them to sign in again would be a lie about what
    // went wrong, and they would sign in and land here again.
    expect(await roleCheck('scanner', 'manager')).toContain('/supplier?denied=role')
  })
})

/**
 * THE READ THAT FAILS, WHICH IS NOT A MEMBERSHIP THAT DOES NOT EXIST.
 *
 * A PostgREST query never rejects: it resolves `{ data: null, error }`. Both
 * reads above used to name only `data`, so an unreachable database and a user
 * who staffs nobody arrived at every caller as the same value - `null` from
 * getSupplierSession, `[]` from getSupplierMemberships.
 *
 * `[]` is the one that got out. `getVoucherForRedemption` opens with
 * `if (supplierIds.length === 0) return null`, BEFORE the guarded query that
 * the 2026-08-20 voucher fix put there, so a failed membership read produced
 * exactly what that fix exists to prevent while never reaching it:
 *
 *   the till is told "הקוד אינו משויך לבית העסק שלכם" about a paid voucher
 *   a refusal row saying the code does not exist is written to the scan log
 *
 * Both are pinned at the call sites (lookup route, /redeem/[token]). These pin
 * the read itself, which is where the two answers stop being one value.
 */
describe('a membership read that fails', () => {
  /** The same builder shape, resolving the way PostgREST resolves a failure. */
  function failingQuery(code?: string) {
    const failure = { data: null, error: { code, message: 'connection terminated' } }
    const chain = Promise.resolve(failure) as Promise<unknown> & Record<string, unknown>
    Object.assign(chain, {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: () => Promise.resolve(failure),
    })
    return chain
  }

  beforeEach(() => {
    getUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } })
    redirect.mockClear()
    from.mockReset().mockReturnValue(failingQuery())
  })

  it('throws out of getSupplierMemberships instead of answering with an empty set', async () => {
    await expect(getSupplierMemberships()).rejects.toThrow(/memberships_read_failed/)
  })

  it('throws out of getSupplierSession instead of answering "not a member"', async () => {
    await expect(getSupplierSession()).rejects.toThrow(/session_read_failed/)
  })

  it('does not tell a real member they are not staff here', async () => {
    // The pre-fix path: null session, user present, so requireSupplierMember
    // sent a genuine supplier to /supplier/access-denied over a transient
    // failure. An error page is honest; that redirect was not.
    await expect(requireSupplierMember('/supplier')).rejects.toThrow(/session_read_failed/)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('refuses rather than admits, when it cannot tell which', async () => {
    // The direction matters more than the message: an unreadable membership
    // must never resolve to a session, whatever else it does.
    await expect(requireSupplierRole('owner')).rejects.toThrow()
  })

  it('still treats PGRST116 as the "no row" answer maybeSingle means by it', async () => {
    // Exempt on purpose: that code IS "staffs nobody" for a maybeSingle, and
    // the guards already handle it by denying access.
    from.mockReturnValue(failingQuery('PGRST116'))
    expect(await getSupplierSession()).toBeNull()
  })

  it('never reaches the read for a signed-out caller, so there is nothing to fail', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect(await getSupplierMemberships()).toEqual([])
    expect(await getSupplierSession()).toBeNull()
  })
})
