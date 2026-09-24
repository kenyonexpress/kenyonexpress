import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Double opt-in, end to end through fakes. What can only fail here: that
 * signup writes a PENDING row and never a subscribed one, that the consent
 * evidence (hashed IP, user agent, wording version) lands on the row, that a
 * suppressed address gets the same answer as a fresh one with no mail sent,
 * and that the click is what subscribes and mirrors to the audience.
 */

type Result = { data: unknown; error: unknown }
type Call = { table: string; op: string; payload?: unknown; chain: [string, unknown[]][] }

const calls: Call[] = []
const queues = new Map<string, Result[]>()

function override(key: string, result: Result): void {
  queues.set(key, [result])
}

function settle(key: string): Result {
  const q = queues.get(key)
  if (!q || q.length === 0) return { data: null, error: null }
  return q.length === 1 ? (q[0] as Result) : (q.shift() as Result)
}

function builder(client: string, table: string, op: string, payload?: unknown): never {
  const record: Call = { table: `${client}:${table}`, op, payload, chain: [] }
  calls.push(record)
  const key = `${client}:${table}.${op}`
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(settle(key)).then(resolve, reject)
        }
        return (...args: unknown[]) => {
          record.chain.push([String(prop), args])
          if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle(key))
          return proxy
        }
      },
    },
  )
  return proxy as never
}

const rpcCalls: { name: string; args: unknown }[] = []

const adminClient = {
  from: (table: string) => ({
    select: (...args: unknown[]) => builder('admin', table, 'select', args[0]),
    update: (payload: unknown) => builder('admin', table, 'update', payload),
    insert: (payload: unknown) => builder('admin', table, 'insert', payload),
    upsert: (payload: unknown, options: unknown) =>
      builder('admin', table, 'upsert', { payload, options }),
    delete: () => builder('admin', table, 'delete'),
  }),
  rpc: async (name: string, args: unknown) => {
    rpcCalls.push({ name, args })
    return settle(`admin:rpc.${name}`)
  },
}

const getUser = vi.fn()
const checkRateLimit = vi.fn()
const sendEmail = vi.fn()
const syncAudienceContact = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: () => getUser() } }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
  getClientIp: async () => '203.0.113.9',
}))
vi.mock('@/lib/growth/resend', () => ({
  sendEmail: (input: unknown) => sendEmail(input),
  syncAudienceContact: (input: unknown) => syncAudienceContact(input),
}))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => (name === 'user-agent' ? 'UA/1.0' : null) }),
}))
vi.mock('@/lib/observability/action-context', () => ({
  withActionContext: (_name: string, fn: () => unknown) => fn(),
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const SAME_ANSWER = { ok: true, message: 'אם הכתובת תקינה, שלחנו אליה מייל לאישור ההרשמה.' }

function form(entries: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

function find(table: string, op: string): Call | undefined {
  return calls.find((c) => c.table === table && c.op === op)
}

const { subscribeToNewsletter, confirmNewsletter, unsubscribeByToken } = await import(
  './newsletter'
)

beforeEach(() => {
  calls.length = 0
  rpcCalls.length = 0
  queues.clear()
  getUser.mockReset()
  getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  checkRateLimit.mockReset()
  checkRateLimit.mockResolvedValue(true)
  sendEmail.mockReset()
  sendEmail.mockResolvedValue(undefined)
  syncAudienceContact.mockReset()
  syncAudienceContact.mockResolvedValue(undefined)
  vi.stubEnv('CONSENT_IP_SALT', 'salt-1')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://ke.example/')
})

describe('subscribeToNewsletter', () => {
  it('writes a PENDING row with the consent evidence and mails the confirmation link', async () => {
    const result = await subscribeToNewsletter(
      { ok: false },
      form({ email: 'Dana@Example.com', source: 'footer' }),
    )
    expect(result).toEqual(SAME_ANSWER)

    const upsert = find('admin:newsletter_subscribers', 'upsert')
    const { payload, options } = upsert?.payload as {
      payload: Record<string, unknown>
      options: unknown
    }
    expect(payload).toMatchObject({
      email: 'dana@example.com',
      user_id: USER_ID,
      status: 'pending',
      source: 'footer',
      consent_wording_version: 'newsletter-v1',
      consent_ip_hash: createHash('sha256').update('salt-1:203.0.113.9').digest('hex'),
      consent_user_agent: 'UA/1.0',
    })
    expect(payload.confirm_token).toMatch(/^[0-9a-f]{48}$/)
    expect(payload.confirm_sent_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(options).toEqual({ onConflict: 'email' })
    // Nothing here marks anyone subscribed.
    expect(payload.status).not.toBe('subscribed')

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const mail = sendEmail.mock.calls[0]?.[0] as { to: string; tag: string; html: string }
    expect(mail.to).toBe('dana@example.com')
    expect(mail.tag).toBe('newsletter_confirm')
    expect(mail.html).toContain(
      `https://ke.example/newsletter/confirm?token=${String(payload.confirm_token)}`,
    )
    expect(checkRateLimit).toHaveBeenCalledWith('newsletter:203.0.113.9', 5, 3600)
  })

  it('defaults the source to site and the user to null when signed out', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    await subscribeToNewsletter({ ok: false }, form({ email: 'a@b.co' }))
    const { payload } = find('admin:newsletter_subscribers', 'upsert')?.payload as {
      payload: Record<string, unknown>
    }
    expect(payload).toMatchObject({ source: 'site', user_id: null })
  })

  it('rejects a malformed address and a rate-limited IP before any read', async () => {
    expect(await subscribeToNewsletter({ ok: false }, form({ email: 'not-an-email' }))).toEqual({
      ok: false,
      error: 'כתובת מייל לא תקינה',
    })
    checkRateLimit.mockResolvedValue(false)
    expect(await subscribeToNewsletter({ ok: false }, form({ email: 'a@b.co' }))).toEqual({
      ok: false,
      error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.',
    })
    expect(calls).toEqual([])
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('gives a suppressed address the same answer, writes nothing and sends nothing', async () => {
    override('admin:email_suppressions.select', { data: { email: 'a@b.co' }, error: null })
    expect(await subscribeToNewsletter({ ok: false }, form({ email: 'a@b.co' }))).toEqual(
      SAME_ANSWER,
    )
    expect(find('admin:newsletter_subscribers', 'upsert')).toBeUndefined()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('reports a failed upsert and does not mail', async () => {
    override('admin:newsletter_subscribers.upsert', { data: null, error: { message: 'down' } })
    expect(await subscribeToNewsletter({ ok: false }, form({ email: 'a@b.co' }))).toEqual({
      ok: false,
      error: 'ההרשמה נכשלה. נסו שוב.',
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('confirmNewsletter', () => {
  it('rejects an empty token and a token that matches nothing', async () => {
    expect(await confirmNewsletter('')).toEqual({ ok: false, error: 'קישור לא תקין' })
    expect(calls).toEqual([])
    expect(await confirmNewsletter('tok')).toEqual({
      ok: false,
      error: 'הקישור אינו תקף או שכבר נעשה בו שימוש',
    })
    override('admin:newsletter_subscribers.update', { data: null, error: { message: 'down' } })
    expect(await confirmNewsletter('tok')).toEqual({
      ok: false,
      error: 'הקישור אינו תקף או שכבר נעשה בו שימוש',
    })
    expect(syncAudienceContact).not.toHaveBeenCalled()
  })

  it('subscribes on the click, burns the token, lifts the suppression and mirrors', async () => {
    override('admin:newsletter_subscribers.update', { data: { email: 'a@b.co' }, error: null })
    expect(await confirmNewsletter('tok-1')).toEqual({ ok: true, message: 'ההרשמה אושרה. תודה!' })

    const update = find('admin:newsletter_subscribers', 'update')
    expect(update?.payload).toMatchObject({ status: 'subscribed', confirm_token: null })
    expect((update?.payload as { confirmed_at: string }).confirmed_at).toMatch(/^\d{4}-/)
    expect(update?.chain).toContainEqual(['eq', ['confirm_token', 'tok-1']])

    const del = find('admin:email_suppressions', 'delete')
    expect(del?.chain).toContainEqual(['eq', ['email', 'a@b.co']])
    expect(syncAudienceContact).toHaveBeenCalledWith({ email: 'a@b.co', subscribed: true })
  })
})

describe('unsubscribeByToken', () => {
  it('reports a failed rpc without touching the audience', async () => {
    override('admin:rpc.fn_unsubscribe_by_token', { data: null, error: { message: 'down' } })
    expect(await unsubscribeByToken('u-1')).toEqual({ ok: false, error: 'ההסרה נכשלה. נסו שוב.' })
    expect(syncAudienceContact).not.toHaveBeenCalled()
  })

  it('unsubscribes through the rpc and mirrors the opt-out when the row is found', async () => {
    override('admin:newsletter_subscribers.select', { data: { email: 'a@b.co' }, error: null })
    expect(await unsubscribeByToken('u-1', 'too many')).toEqual({
      ok: true,
      message: 'הוסרת מרשימת הדיוור.',
    })
    expect(rpcCalls).toEqual([
      { name: 'fn_unsubscribe_by_token', args: { p_token: 'u-1', p_reason: 'too many' } },
    ])
    expect(syncAudienceContact).toHaveBeenCalledWith({ email: 'a@b.co', subscribed: false })
  })

  it('still succeeds, without a mirror, when the row cannot be read back', async () => {
    expect(await unsubscribeByToken('u-1')).toEqual({ ok: true, message: 'הוסרת מרשימת הדיוור.' })
    expect(rpcCalls[0]?.args).toEqual({ p_token: 'u-1', p_reason: null })
    expect(syncAudienceContact).not.toHaveBeenCalled()
  })
})
