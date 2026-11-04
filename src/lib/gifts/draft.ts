import { giftSchema } from '@/lib/validations/checkout'
import { z } from 'zod'

/**
 * The gift a shopper filled in on /gift/[product], carried to /checkout.
 *
 * WHY A COOKIE AND NOT THE QUERY STRING. The greeting is personal and up to 500
 * characters, and a query string is written into the browser history, the
 * server logs and every Referer the checkout page sends. An httpOnly cookie
 * scoped to `/checkout` reaches exactly the one page that needs it.
 *
 * WHY base64url OF UTF-8 JSON. A Hebrew character is 6 bytes once
 * percent-encoded and 2 in UTF-8, so a full 500-character greeting is ~3 KB as
 * `encodeURIComponent` (close to the 4 KB cookie ceiling with the other fields)
 * and ~1.4 KB here.
 *
 * NOTHING HERE IS TRUSTED. The cookie is only a prefill: the checkout form
 * posts the fields again and `submitCheckout` validates them with the same
 * `giftSchema`. A tampered cookie can change what the form shows the shopper
 * who owns the cookie, and nothing else.
 */

export const GIFT_DRAFT_COOKIE = 'ke_gift_draft'
/** Long enough to finish a checkout, short enough not to haunt the next one. */
export const GIFT_DRAFT_MAX_AGE_SECONDS = 30 * 60

const draftSchema = giftSchema
  .pick({
    gift_recipient_name: true,
    gift_message: true,
    gift_deliver_at: true,
    gift_wrap: true,
  })
  .extend({
    gift_recipient_email: z.string().trim().email().max(200),
  })

export type GiftDraft = z.infer<typeof draftSchema>

export function encodeGiftDraft(draft: GiftDraft): string {
  return Buffer.from(JSON.stringify(draftSchema.parse(draft)), 'utf8').toString('base64url')
}

/** `null` for anything that is not a valid draft. Never throws. */
export function decodeGiftDraft(value: string | null | undefined): GiftDraft | null {
  if (!value || value.length > 4096) return null
  try {
    const parsed = draftSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    )
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
