import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isResendConfigured, sendEmail, syncAudienceContact } from './resend'

/**
 * The marketing sender (marathon step 7; the module had no tests). The
 * properties that matter: it is INERT without a key rather than throwing in
 * the middle of whatever triggered the send, the sender identity follows the
 * verified-domain fallback chain, and marketing mail cannot go out without
 * the one-click unsubscribe headers when a URL is provided.
 */

const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(jsonResponse(200, { id: 'email_1' }))
  vi.stubEnv('RESEND_API_KEY', 'rk_test')
  // undefined, not '': the module reads with ??, so an empty string would
  // count as configured and pin `from` to ''.
  vi.stubEnv('RESEND_FROM', undefined)
  vi.stubEnv('EMAIL_FROM', undefined)
  vi.stubEnv('RESEND_AUDIENCE_ID', 'aud_1')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(init.body as string)
}

describe('inert without configuration', () => {
  it('sendEmail skips, and never calls the network, when the key is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const result = await sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' })
    expect(result).toEqual({ ok: false, skipped: true })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(isResendConfigured()).toBe(false)
  })

  it('syncAudienceContact skips without a key OR without an audience id', async () => {
    vi.stubEnv('RESEND_AUDIENCE_ID', '')
    expect(await syncAudienceContact({ email: 'a@b.c', subscribed: true })).toEqual({
      ok: false,
      skipped: true,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('sendEmail', () => {
  it('posts to /emails with the bearer key', async () => {
    const result = await sendEmail({ to: 'a@b.c', subject: 'שלום', html: '<p>x</p>' })
    expect(result).toEqual({ ok: true, id: 'email_1' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer rk_test')
    expect(sentBody()).toMatchObject({ to: ['a@b.c'], subject: 'שלום' })
  })

  it('falls from RESEND_FROM to EMAIL_FROM to the domain default', async () => {
    // EMAIL_FROM alone must win over the hardcoded default: one verified
    // domain configures both senders, and a deploy that set only EMAIL_FROM
    // must not mail marketing from an address nobody verified.
    vi.stubEnv('EMAIL_FROM', 'KE <hello@kenyonexpress.co.il>')
    await sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' })
    expect(sentBody().from).toBe('KE <hello@kenyonexpress.co.il>')

    fetchMock.mockClear()
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'email_2' }))
    vi.stubEnv('RESEND_FROM', 'Marketing <deals@kenyonexpress.co.il>')
    await sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' })
    expect(sentBody().from).toBe('Marketing <deals@kenyonexpress.co.il>')
  })

  it('uses the verified-domain default when nothing is configured', async () => {
    await sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' })
    expect(sentBody().from).toBe('KenyonExpress <noreply@kenyonexpress.co.il>')
  })

  it('attaches both RFC 8058 unsubscribe headers when a URL is given', async () => {
    await sendEmail({
      to: 'a@b.c',
      subject: 's',
      html: '<p/>',
      unsubscribeUrl: 'https://kenyonexpress.co.il/u/abc',
    })
    expect(sentBody().headers).toEqual({
      'List-Unsubscribe': '<https://kenyonexpress.co.il/u/abc>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    })
  })

  it('sends no headers field at all when there is no unsubscribe URL', async () => {
    await sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' })
    expect(sentBody().headers).toBeUndefined()
  })

  it('tags the send when a tag is given', async () => {
    await sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>', tag: 'weekly-digest' })
    expect(sentBody().tags).toEqual([{ name: 'kind', value: 'weekly-digest' }])
  })

  it('reports a non-2xx as an error with the status and a bounded detail', async () => {
    fetchMock.mockResolvedValue(new Response('x'.repeat(500), { status: 422 }))
    const result = await sendEmail({ to: 'a@b.c', subject: 's', html: '<p/>' })
    expect(result.ok).toBe(false)
    if (!result.ok && 'error' in result) {
      expect(result.error).toMatch(/^resend 422: /)
      // slice(0, 200): a provider error page must not become a megabyte log line.
      expect(result.error.length).toBeLessThanOrEqual('resend 422: '.length + 200)
    }
  })
})

describe('syncAudienceContact', () => {
  it('posts to the configured audience and inverts subscribed into unsubscribed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'contact_1' }))
    const result = await syncAudienceContact({
      email: 'a@b.c',
      subscribed: false,
      firstName: 'דנה',
    })
    expect(result).toEqual({ ok: true, id: 'contact_1' })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://api.resend.com/audiences/aud_1/contacts')
    // Resend's own flag mirrors ours so a dashboard-initiated send cannot
    // reach someone who opted out here.
    expect(sentBody()).toMatchObject({ email: 'a@b.c', unsubscribed: true, first_name: 'דנה' })
  })

  it('reports a failed sync as an error naming the audience call', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    const result = await syncAudienceContact({ email: 'a@b.c', subscribed: true })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/^resend audience 500: /)
  })
})
