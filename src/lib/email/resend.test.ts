import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetEmailWarning, sendEmail, serializeAttachment } from './resend'

/**
 * The transport's wire shape for attachments, which is the one thing about
 * sending a tax document that cannot be checked anywhere else: Resend's
 * JSON endpoint takes base64 text, the issuer holds bytes, and a wrong
 * encoding is a 200 from the API and a corrupt PDF in the customer's inbox.
 */

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'mail-1' }),
    text: async () => '',
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('RESEND_API_KEY', 're_test')
  __resetEmailWarning()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function sentBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as { body: string }
  return JSON.parse(init.body) as Record<string, unknown>
}

describe('serializeAttachment', () => {
  it('base64-encodes the bytes and names the content type when given', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 hello')
    expect(
      serializeAttachment({ filename: 'a.pdf', content: bytes, contentType: 'application/pdf' }),
    ).toEqual({
      filename: 'a.pdf',
      content: Buffer.from('%PDF-1.7 hello').toString('base64'),
      content_type: 'application/pdf',
    })
    expect(serializeAttachment({ filename: 'a.bin', content: bytes })).not.toHaveProperty(
      'content_type',
    )
  })
})

describe('sendEmail attachments', () => {
  it('posts the attachment as base64 next to the bodies', async () => {
    const bytes = new TextEncoder().encode('%PDF-bytes')
    const result = await sendEmail({
      to: 'dana@example.com',
      subject: 's',
      html: '<p>h</p>',
      text: 't',
      idempotencyKey: 'invoice:inv-1:issued',
      attachments: [
        { filename: 'KE-INV-000042.pdf', content: bytes, contentType: 'application/pdf' },
      ],
    })
    expect(result).toEqual({ ok: true, id: 'mail-1' })

    const body = sentBody()
    expect(body.attachments).toEqual([
      {
        filename: 'KE-INV-000042.pdf',
        content: Buffer.from('%PDF-bytes').toString('base64'),
        content_type: 'application/pdf',
      },
    ])
    const headers = (fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers
    expect(headers['idempotency-key']).toBe('invoice:inv-1:issued')
  })

  it('sends no attachments key at all when there is nothing to attach', async () => {
    await sendEmail({ to: 'a@b.c', subject: 's', html: 'h', text: 't', attachments: [] })
    expect(sentBody()).not.toHaveProperty('attachments')
    fetchMock.mockClear()
    await sendEmail({ to: 'a@b.c', subject: 's', html: 'h', text: 't' })
    expect(sentBody()).not.toHaveProperty('attachments')
  })

  it('reports a missing key as skipped without touching the network', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const result = await sendEmail({ to: 'a@b.c', subject: 's', html: 'h', text: 't' })
    expect(result).toEqual({ ok: false, skipped: true, reason: 'no_api_key' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
