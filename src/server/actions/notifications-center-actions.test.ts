import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two actions STEP 49 added to notifications.ts, and the one it widened.
 *
 * What can only fail here: a mute is written with the SESSION's user id and
 * the reserved `category:` kind on the `in_app` channel, never from the
 * form; an unknown category is refused before any client is made; mark-all
 * narrows by the tab's kind list when a tab is given and by nothing when it
 * is not; and a signed-out caller gets a refusal and no write.
 */

const getUser = vi.fn()
const upsert = vi.fn()
const update = vi.fn()
const isNull = vi.fn()
const inList = vi.fn()
const notIn = vi.fn()
const revalidatePath = vi.fn()

/**
 * The tail of an UPDATE builder: awaitable (a real Promise, so no `then`
 * property of our own) and still chainable through the filters the action
 * may add after `.is()`.
 */
/** The customer's `notification_preferences` rows, as the mark-all read sees them. */
let prefRows: { kind: string; channel: string; enabled: boolean }[] = []

function filterChain() {
  const chain = Object.assign(Promise.resolve({ error: null }), {
    eq: () => chain,
    in: (...a: unknown[]) => {
      inList(...a)
      return chain
    },
    not: (...a: unknown[]) => {
      notIn(...a)
      return chain
    },
  })
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: () => getUser() },
    from: () => ({
      select: () => Promise.resolve({ data: prefRows, error: null }),
      upsert: (...a: unknown[]) => upsert(...a),
      update: (...a: unknown[]) => {
        update(...a)
        return {
          is: (...b: unknown[]) => {
            isNull(...b)
            return filterChain()
          },
        }
      },
    }),
  }),
}))
vi.mock('@/lib/observability/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }))

import { markAllNotificationsRead, setCategoryMute } from './notifications'

beforeEach(() => {
  vi.clearAllMocks()
  prefRows = []
  getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
  upsert.mockResolvedValue({ error: null })
})

describe('setCategoryMute', () => {
  it('refuses an unknown category before touching the database', async () => {
    expect(await setCategoryMute('promotions', true)).toEqual({
      ok: false,
      error: 'קטגוריה לא מוכרת.',
    })
    expect(upsert).not.toHaveBeenCalled()
  })

  it('refuses when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await setCategoryMute('deals', true)).ok).toBe(false)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('writes the reserved kind on the in_app channel with the session user id', async () => {
    expect(await setCategoryMute('deals', true)).toEqual({ ok: true })
    expect(upsert).toHaveBeenCalledWith(
      { user_id: 'u-1', kind: 'category:deals', channel: 'in_app', enabled: false },
      { onConflict: 'user_id,kind,channel' },
    )
    expect(revalidatePath).toHaveBeenCalledWith('/account/notifications')
  })

  it('unmutes by flipping enabled back on, same row', async () => {
    await setCategoryMute('orders', false)
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'category:orders', enabled: true }),
      expect.anything(),
    )
  })

  it('reports an absent table as settings not yet available', async () => {
    upsert.mockResolvedValue({ error: { code: '42P01', message: 'no table' } })
    expect(await setCategoryMute('account', true)).toEqual({
      ok: false,
      error: 'ההגדרות עדיין לא זמינות.',
    })
  })
})

describe('markAllNotificationsRead', () => {
  it('marks every unread row when no tab is given', async () => {
    expect(await markAllNotificationsRead(null)).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ read_at: expect.any(String) }))
    expect(isNull).toHaveBeenCalledWith('read_at', null)
    expect(inList).not.toHaveBeenCalled()
    expect(notIn).not.toHaveBeenCalled()
  })

  it('leaves the rows a mute hides unread, so lifting the mute returns them unread', async () => {
    prefRows = [{ kind: 'category:deals', channel: 'in_app', enabled: false }]
    expect(await markAllNotificationsRead(null)).toEqual({ ok: true })
    expect(notIn).toHaveBeenCalledWith('kind', 'in', expect.stringContaining('price_drop'))
    expect(notIn).toHaveBeenCalledWith('kind', 'in', expect.stringContaining('back_in_stock'))
    expect(notIn).toHaveBeenCalledWith('kind', 'in', expect.not.stringContaining('order_paid'))
    expect(inList).not.toHaveBeenCalled()
  })

  it('narrows the mark to the shelves still shown when the fallback shelf is muted', async () => {
    prefRows = [{ kind: 'category:system', channel: 'in_app', enabled: false }]
    await markAllNotificationsRead(null)
    expect(inList).toHaveBeenCalledWith('kind', expect.arrayContaining(['order_paid', 'welcome']))
    expect(notIn).not.toHaveBeenCalled()
  })

  it("narrows to the tab's kinds when a named shelf is given", async () => {
    expect(await markAllNotificationsRead('deals')).toEqual({ ok: true })
    expect(inList).toHaveBeenCalledWith('kind', expect.arrayContaining(['price_drop']))
    expect(notIn).not.toHaveBeenCalled()
  })

  it('narrows to the complement of every named shelf for system', async () => {
    await markAllNotificationsRead('system')
    expect(notIn).toHaveBeenCalledWith('kind', 'in', expect.stringContaining('order_paid'))
    expect(inList).not.toHaveBeenCalled()
  })

  it('refuses an unknown shelf rather than treating it as all', async () => {
    expect(await markAllNotificationsRead('everything')).toEqual({
      ok: false,
      error: 'קטגוריה לא מוכרת.',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await markAllNotificationsRead(null)).ok).toBe(false)
    expect(update).not.toHaveBeenCalled()
  })
})
