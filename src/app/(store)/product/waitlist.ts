'use server'

import { createHash } from 'node:crypto'
import { withActionContext } from '@/lib/observability/action-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { headers } from 'next/headers'
import { z } from 'zod'

/**
 * "Tell me when it is back", from the sold-out state of a product page.
 *
 * The consent is single-purpose and is spelled out beside the field: ONE
 * message, about ONE product, when that product returns. It is not a
 * newsletter signup and it must never become one -- that list is
 * `newsletter_subscribers`, it carries a double opt-in and its own consent
 * wording version, and the two tables stay separate precisely so neither
 * consent can be spent on the other.
 *
 * Writes go through the service client because `product_waitlist` grants
 * nobody INSERT (see migrations/pending/124_product_waitlist.sql): an
 * anon-writable table keyed by product id is a free way to write rows about
 * any product from anywhere.
 */

const schema = z.object({
  productId: z.string().uuid(),
  email: z.string().email('כתובת מייל לא תקינה').max(254),
})

export type WaitlistState = { ok: boolean; message?: string; error?: string }

/** Consent evidence needs equality, not the address. Same rule as newsletter.ts. */
function hashIp(ip: string): string {
  const salt = process.env.CONSENT_IP_SALT ?? ''
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

/**
 * The one answer this action gives on success, whatever actually happened in
 * the table. Whether the address was already on the list is not the visitor's
 * business to learn from a form anyone can submit: distinguishing "added" from
 * "already there" turns the box into a membership oracle. The newsletter
 * action makes the identical call for the identical reason.
 */
const SAME_ANSWER: WaitlistState = {
  ok: true,
  message: 'נרשמת. נעדכן אותך במייל ברגע שהמוצר יחזור למלאי.',
}

async function runJoinWaitlist(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const parsed = schema.safeParse({
    productId: formData.get('productId'),
    email: formData.get('email'),
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'כתובת מייל לא תקינה' }
  }
  const email = parsed.data.email.trim().toLowerCase()

  // Without a limit this endpoint is a way to attach a stranger's address to
  // an unbounded number of products, and later to mail it once per product.
  const ip = await getClientIp()
  if (!(await checkRateLimit(`waitlist:${ip}`, 10, 3600))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }

  // Suppressions outrank consent. Someone who complained or hard-bounced does
  // not get re-mailed by typing their address into a different box.
  const admin = createAdminClient()
  const { data: suppressed } = await admin
    .from('email_suppressions' as never)
    .select('email')
    .eq('email', email)
    .maybeSingle()
  if (suppressed) return SAME_ANSWER

  const ua = (await headers()).get('user-agent')?.slice(0, 300) ?? null
  const {
    data: { user } = { user: null },
  } = await (await createClient()).auth.getUser()

  const { error } = await admin.from('product_waitlist' as never).upsert(
    {
      product_id: parsed.data.productId,
      email,
      user_id: user?.id ?? null,
      source: (formData.get('source') as string) || 'product-page',
      ip_hash: hashIp(ip),
      user_agent: ua,
    } as never,
    // Re-submitting refreshes the existing row rather than creating a second
    // reason to mail the same person about the same product.
    { onConflict: 'product_id,email' } as never,
  )

  if (error) {
    // 42P01 is undefined_table: migration 124 is written but not applied, and
    // that is a state this repo ships in deliberately. A sold-out page must
    // not become a 500 because a table is not there yet, and the shopper is
    // told the truth rather than thanked for a row nobody stored.
    if (error.code === '42P01') {
      return { ok: false, error: 'רשימת ההמתנה עדיין לא נפתחה. נסו שוב בקרוב.' }
    }
    return { ok: false, error: 'ההרשמה נכשלה. נסו שוב.' }
  }

  return SAME_ANSWER
}

export async function joinWaitlist(
  prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  return withActionContext('joinWaitlist', () => runJoinWaitlist(prev, formData))
}
