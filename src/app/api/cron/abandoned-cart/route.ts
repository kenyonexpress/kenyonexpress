import { sendEmail } from '@/lib/growth/resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Abandoned cart nudge. One email, once, per cart.
 *
 * Who is eligible is decided entirely in fn_due_abandoned_carts, not here, so
 * the rules are testable in SQL and cannot drift between this route and any
 * other caller. That function requires, all of them together: a cart older than
 * the cutoff but younger than seven days, still unexpired, with items, whose
 * owner has NOT ordered since it was last touched, who has a confirmed
 * newsletter subscription, and who is not suppressed.
 *
 * The consent condition is the one worth defending. An abandoned-cart email
 * feels operational and is not: it is unsolicited commercial mail under section
 * 30A, and sending it to someone who never opted in is the same offence as any
 * other unsolicited campaign.
 *
 * A cart is nudged at most once, ever, enforced by a UNIQUE on cart_id rather
 * than by a check here. A second mail about the same forgotten cart is what
 * makes a person press the spam button.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  // `!secret` closes the route in the absence of a secret rather than opening it.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const hours = Number(process.env.ABANDONED_CART_HOURS ?? 3)

  const { data, error } = await admin.rpc(
    'fn_due_abandoned_carts' as never,
    {
      p_older_than_hours: hours,
      p_limit: 100,
    } as never,
  )

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const due = (data ?? []) as unknown as {
    cart_id: string
    user_id: string
    email: string
    item_count: number
  }[]

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il').replace(
    /\/+$/,
    '',
  )
  let sent = 0
  let failed = 0

  for (const row of due) {
    try {
      // The unsubscribe link is fetched per recipient because it is their
      // token. A shared link would unsubscribe whoever clicked it last.
      const { data: sub } = await admin
        .from('newsletter_subscribers' as never)
        .select('unsubscribe_token')
        .eq('email', row.email)
        .maybeSingle()
      const token = (sub as unknown as { unsubscribe_token?: string } | null)?.unsubscribe_token
      const unsubscribeUrl = token ? `${base}/newsletter/unsubscribe?token=${token}` : undefined

      const result = await sendEmail({
        to: row.email,
        subject: 'שכחת משהו בסל?',
        tag: 'abandoned_cart',
        unsubscribeUrl,
        html: `<div dir="rtl" style="font-family:system-ui,sans-serif;text-align:right">
          <h1 style="font-size:20px">הסל שלך מחכה</h1>
          <p>נשארו לך <bdi>${row.item_count}</bdi> פריטים בסל בקניון אקספרס.</p>
          <p><a href="${base}/cart" style="background:#000;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">חזרה לסל</a></p>
          ${unsubscribeUrl ? `<p style="color:#888;font-size:12px"><a href="${unsubscribeUrl}">הסרה מרשימת הדיוור</a></p>` : ''}
        </div>`,
      })

      // A skipped send (no RESEND_API_KEY) must NOT write a nudge row. Doing so
      // would burn the one-per-cart allowance on an email nobody received, and
      // the cart could never be nudged again.
      if ('skipped' in result && result.skipped) continue
      if (!result.ok) {
        failed += 1
        continue
      }

      await admin.from('abandoned_cart_nudges' as never).insert({
        cart_id: row.cart_id,
        user_id: row.user_id,
        email: row.email,
        item_count: row.item_count,
        provider_id: result.id,
      } as never)
      sent += 1
    } catch {
      failed += 1
    }
  }

  return NextResponse.json({ ok: true, due: due.length, sent, failed })
}
