import { describe, expect, it } from 'vitest'
import { decodeGiftDraft, encodeGiftDraft } from './draft'

describe('gift draft cookie (S22)', () => {
  it('round-trips every field, Hebrew included', () => {
    const draft = {
      gift_recipient_email: 'friend@example.com',
      gift_recipient_name: 'דנה',
      gift_message: 'יום הולדת שמח!',
      gift_deliver_at: '2026-12-01',
      gift_wrap: true,
    }
    expect(decodeGiftDraft(encodeGiftDraft(draft))).toEqual(draft)
  })

  it('keeps a full 500-character Hebrew greeting well under the 4 KB cookie ceiling', () => {
    const encoded = encodeGiftDraft({
      gift_recipient_email: `${'a'.repeat(60)}@example.com`,
      gift_recipient_name: 'א'.repeat(80),
      gift_message: 'ש'.repeat(500),
      gift_deliver_at: '2026-12-01',
      gift_wrap: true,
    })
    expect(encoded.length).toBeLessThan(2000)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('refuses to encode a draft with no valid recipient email', () => {
    expect(() => encodeGiftDraft({ gift_recipient_email: 'not-an-email' })).toThrow()
  })

  it('reads anything malformed or tampered as no draft, without throwing', () => {
    expect(decodeGiftDraft(undefined)).toBeNull()
    expect(decodeGiftDraft('')).toBeNull()
    expect(decodeGiftDraft('%%%not-base64')).toBeNull()
    expect(decodeGiftDraft(Buffer.from('{"x":1}').toString('base64url'))).toBeNull()
    expect(
      decodeGiftDraft(
        Buffer.from(
          JSON.stringify({ gift_recipient_email: 'a@b.co', gift_message: 'x'.repeat(501) }),
        ).toString('base64url'),
      ),
    ).toBeNull()
    expect(decodeGiftDraft('a'.repeat(5000))).toBeNull()
  })
})
