'use server'

import { createHash, randomBytes } from 'node:crypto'
import { sendEmail, syncAudienceContact } from '@/lib/growth/resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { headers } from 'next/headers'
import { z } from 'zod'

/**
 * Newsletter signup, double opt-in.
 *
 * Nothing here marks anyone subscribed. It creates a PENDING row and mails a
 * confirmation link; the click is what subscribes, and the click is also the
 * evidence. Section 30A requires opt-in that can be proven, and an address
 * typed by somebody else must never end up on the list.
 */

export const CONSENT_WORDING_VERSION = 'newsletter-v1'

const schema = z.object({
  email: z.string().email('כתובת מייל לא תקינה').max(254),
})

export type NewsletterState = { ok: boolean; message?: string; error?: string }

/** IPs are hashed before storage: consent evidence needs equality, not the address. */
function hashIp(ip: string): string {
  const salt = process.env.CONSENT_IP_SALT ?? ''
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

const siteUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il').replace(/\/+$/, '')

export async function subscribeToNewsletter(
  _prev: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  const parsed = schema.safeParse({ email: formData.get('email') })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'כתובת מייל לא תקינה' }
  }
  const email = parsed.data.email.trim().toLowerCase()

  const ip = await getClientIp()
  // Without a limit this endpoint mails anyone, repeatedly, on demand: it is a
  // free way to use our domain to harass a stranger's inbox.
  if (!(await checkRateLimit(`newsletter:${ip}`, 5, 3600))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }

  const admin = createAdminClient()

  // Suppressions outrank everything. Someone who complained or hard-bounced
  // does not get re-mailed by re-typing their address into the footer.
  const { data: suppressed } = await admin
    .from('email_suppressions' as never)
    .select('email')
    .eq('email', email)
    .maybeSingle()

  // The answer is identical whether the address is suppressed, already
  // subscribed, or brand new. Anything else turns this box into a way to ask
  // "is this person a customer here".
  const SAME_ANSWER: NewsletterState = {
    ok: true,
    message: 'אם הכתובת תקינה, שלחנו אליה מייל לאישור ההרשמה.',
  }
  if (suppressed) return SAME_ANSWER

  const token = randomBytes(24).toString('hex')
  const ua = (await headers()).get('user-agent')?.slice(0, 300) ?? null
  const {
    data: { user } = { user: null },
  } = await (await createClient()).auth.getUser()

  const { error } = await admin.from('newsletter_subscribers' as never).upsert(
    {
      email,
      user_id: user?.id ?? null,
      status: 'pending',
      source: (formData.get('source') as string) || 'site',
      consent_wording_version: CONSENT_WORDING_VERSION,
      consent_ip_hash: hashIp(ip),
      consent_user_agent: ua,
      confirm_token: token,
      confirm_sent_at: new Date().toISOString(),
    } as never,
    { onConflict: 'email' } as never,
  )
  if (error) return { ok: false, error: 'ההרשמה נכשלה. נסו שוב.' }

  const confirmUrl = `${siteUrl()}/newsletter/confirm?token=${token}`
  await sendEmail({
    to: email,
    subject: 'אישור הרשמה לניוזלטר של קניון אקספרס',
    tag: 'newsletter_confirm',
    html: `<div dir="rtl" style="font-family:system-ui,sans-serif;text-align:right">
      <h1 style="font-size:20px">רגע לפני שנתחיל</h1>
      <p>נרשמת לרשימת הדיוור של קניון אקספרס. לאישור ההרשמה יש ללחוץ:</p>
      <p><a href="${confirmUrl}" style="background:#000;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">אישור ההרשמה</a></p>
      <p style="color:#666;font-size:13px">אם לא נרשמת, אפשר להתעלם מהמייל הזה ולא יישלח אליך דבר.</p>
    </div>`,
  })

  return SAME_ANSWER
}

/** The click. This is what subscribes, and the timestamp is the evidence. */
export async function confirmNewsletter(token: string): Promise<NewsletterState> {
  if (!token) return { ok: false, error: 'קישור לא תקין' }
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('newsletter_subscribers' as never)
    .update({
      status: 'subscribed',
      confirmed_at: new Date().toISOString(),
      confirm_token: null,
    } as never)
    .eq('confirm_token', token)
    .select('email')
    .maybeSingle()

  if (error || !data) return { ok: false, error: 'הקישור אינו תקף או שכבר נעשה בו שימוש' }

  const row = data as unknown as { email: string }
  await admin
    .from('email_suppressions' as never)
    .delete()
    .eq('email', row.email)
  await syncAudienceContact({ email: row.email, subscribed: true })

  return { ok: true, message: 'ההרשמה אושרה. תודה!' }
}

export async function unsubscribeByToken(token: string, reason?: string): Promise<NewsletterState> {
  const admin = createAdminClient()
  const { error } = await admin.rpc(
    'fn_unsubscribe_by_token' as never,
    {
      p_token: token,
      p_reason: reason ?? null,
    } as never,
  )
  if (error) return { ok: false, error: 'ההסרה נכשלה. נסו שוב.' }

  // Mirrored to Resend so a send started from their dashboard cannot reach
  // someone who opted out here.
  const { data } = await admin
    .from('newsletter_subscribers' as never)
    .select('email')
    .eq('unsubscribe_token', token)
    .maybeSingle()
  if (data) {
    await syncAudienceContact({
      email: (data as unknown as { email: string }).email,
      subscribed: false,
    })
  }

  return { ok: true, message: 'הוסרת מרשימת הדיוור.' }
}
