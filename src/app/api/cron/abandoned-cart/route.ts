import { loadCartProductData } from '@/lib/cart/load-products'
import { buildCartView } from '@/lib/cart/pricing'
import type { CartStorageItem, CartView } from '@/lib/cart/types'
import {
  ABANDONED_CART_MAX_REMINDERS,
  type ReminderNumber,
  buildAbandonedCartEmail,
} from '@/lib/growth/abandoned-cart-email'
import { sendEmail } from '@/lib/growth/resend'
import { withJobRun } from '@/lib/observability/job-run'
import { log } from '@/lib/observability/log'
import { trackEvent } from '@/lib/observability/posthog'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Abandoned cart reminders. At most two per cart, T+2h and T+24h.
 *
 * WHO IS ELIGIBLE IS DECIDED ENTIRELY IN `fn_due_abandoned_carts`, not here, so
 * the rules are testable in SQL and cannot drift between this route and any
 * other caller. That function requires, all together: a cart older than the
 * cutoff but younger than seven days, still unexpired, with items, whose owner
 * has NOT ordered since it was last touched, who has a confirmed newsletter
 * subscription, and who is not suppressed. It also decides WHICH reminder is
 * owed and enforces the ceiling of two.
 *
 * The consent condition is the one worth defending. An abandoned-cart email
 * feels operational and is not: it is unsolicited commercial mail under section
 * 30A, and sending it to someone who never opted in is the same offence as any
 * other unsolicited campaign.
 *
 * THE SECOND REMINDER NEEDS `pending/190` AND THIS ROUTE DOES NOT WAIT FOR IT.
 * Before that migration the deployed function returns no `reminder_number` and
 * still excludes any cart with a nudge against it, so this reads every row as
 * reminder 1 and the behaviour is exactly what shipped: one mail per cart. The
 * insert retries without the column on 42703 for the same reason. There is no
 * window where the two halves disagree.
 *
 * WHY THE CEILING IS CHECKED HERE TOO, when the function already applies it and
 * a CHECK constraint backs it: this route sends mail. A due-list that returned
 * a 3 because somebody edited the SQL would send a third message before any
 * constraint had an opinion, since the refusal would land on the INSERT that
 * happens AFTER the send. A cheap comparison in front of the send is the only
 * place that can stop the irreversible half.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

/** The default floors, in hours. Both overridable for a manual catch-up run. */
const FIRST_REMINDER_HOURS = 2
const SECOND_REMINDER_HOURS = 24

/** Postgres: undefined_column. `reminder_number` ships in pending/190. */
const UNDEFINED_COLUMN = '42703'

interface DueCart {
  cart_id: string
  user_id: string
  email: string
  item_count: number
  /** Absent until pending/190 is applied. */
  reminder_number?: number
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  // `!secret` closes the route in the absence of a secret rather than opening it.
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const firstHours = Number(process.env.ABANDONED_CART_HOURS ?? FIRST_REMINDER_HOURS)
  const secondHours = Number(process.env.ABANDONED_CART_SECOND_HOURS ?? SECOND_REMINDER_HOURS)

  /**
   * TWO CALLS, WIDEST FIRST, AND THE NARROW ONE IS NOT A NICETY.
   *
   * The comment that used to sit here said the third argument was "ignored by
   * the deployed two-argument function; PostgREST resolves the call by the
   * named arguments it recognises". That is false, and it made this route
   * return 500 on every single run: PostgREST resolves a routine by the exact
   * SET of argument names it is given, so naming an argument the function does
   * not have matches no candidate at all. Measured against production:
   *
   *   fn_due_abandoned_carts(p_older_than_hours := 2, p_limit := 100)
   *     -> rows
   *   fn_due_abandoned_carts(p_older_than_hours := 2, p_limit := 100,
   *                          p_second_after_hours := 24)
   *     -> undefined_function
   *
   * 190's own header is right that the signature is backward compatible, but
   * only in the direction it considered: an OLD caller against the NEW
   * function, where the default fills the gap. This is the other direction - a
   * new caller against the old function - and a default cannot supply a
   * parameter that does not exist.
   *
   * So: ask for the second reminder, and on "no such routine" ask again without
   * it. The narrow call is the pre-190 behaviour and it is exactly what shipped
   * before: one mail per cart, `reminder_number` absent and read as 1 below.
   */
  const NOT_APPLIED = new Set(['PGRST202', '42883'])

  let { data, error } = await admin.rpc(
    'fn_due_abandoned_carts' as never,
    {
      p_older_than_hours: firstHours,
      p_limit: 100,
      p_second_after_hours: secondHours,
    } as never,
  )

  if (error && NOT_APPLIED.has(error.code ?? '')) {
    log.info('abandoned_cart.pre_190_signature', { firstHours })
    ;({ data, error } = await admin.rpc(
      'fn_due_abandoned_carts' as never,
      { p_older_than_hours: firstHours, p_limit: 100 } as never,
    ))
  }

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  const due = (data ?? []) as unknown as DueCart[]

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il').replace(
    /\/+$/,
    '',
  )
  let sent = 0
  let failed = 0
  let skipped = 0

  /**
   * The cart, priced through `buildCartView` -- the same function the cart page
   * and the checkout use, because a second way to price a cart is a second
   * answer waiting to disagree with the first.
   *
   * Both the email body and `cart_value_agorot` come from this one read.
   * `v_abandoned_cart_recovery` sums that column to report recovered value, so
   * leaving it null makes the admin dashboard show a recovery worth 0 forever
   * however many nudged shoppers come back.
   */
  async function priceCart(cartId: string): Promise<CartView | null> {
    try {
      const { data: cart } = await admin
        .from('carts')
        .select('items')
        .eq('id', cartId)
        .maybeSingle()
      const items = (Array.isArray(cart?.items) ? cart.items : []) as CartStorageItem[]
      if (items.length === 0) return null
      const { products, variants } = await loadCartProductData(items)
      return buildCartView(cartId, items, products, variants)
    } catch {
      return null
    }
  }

  for (const row of due) {
    try {
      const reminder = (row.reminder_number ?? 1) as ReminderNumber
      if (reminder < 1 || reminder > ABANDONED_CART_MAX_REMINDERS) {
        // See the header: the only check that can stop a send, because every
        // other guard fires on the insert that happens after it.
        log.warn('abandoned_cart.reminder_out_of_range', {
          cart_id: row.cart_id,
          reminder_number: row.reminder_number ?? null,
        })
        skipped += 1
        continue
      }

      // NO CONTENTS, NO MAIL. The whole message is the cart's contents, so a
      // cart that cannot be priced -- emptied, delisted, a failed read --
      // would produce a reminder about nothing. The previous version sent an
      // item count and could afford to guess; this one cannot, and refusing
      // costs only a nudge that is still due on the next run.
      const cart = await priceCart(row.cart_id)
      if (!cart || cart.items.length === 0) {
        skipped += 1
        continue
      }

      // The unsubscribe link is fetched per recipient because it is their
      // token. A shared link would unsubscribe whoever clicked it last.
      const { data: sub } = await admin
        .from('newsletter_subscribers' as never)
        .select('unsubscribe_token')
        .eq('email', row.email)
        .maybeSingle()
      const token = (sub as unknown as { unsubscribe_token?: string } | null)?.unsubscribe_token
      const unsubscribeUrl = token ? `${base}/newsletter/unsubscribe?token=${token}` : undefined

      const { subject, html } = buildAbandonedCartEmail({
        cart,
        base,
        reminder,
        unsubscribeUrl,
      })

      const result = await sendEmail({
        to: row.email,
        subject,
        tag: 'abandoned_cart',
        unsubscribeUrl,
        html,
      })

      // A skipped send (no RESEND_API_KEY) must NOT write a nudge row. Doing so
      // would burn one of the cart's two allowances on an email nobody
      // received, and with reminder 2 that also permanently mis-numbers the
      // sequence: the next real send would be recorded as the last one.
      if ('skipped' in result && result.skipped) {
        skipped += 1
        continue
      }
      if (!result.ok) {
        failed += 1
        continue
      }

      const nudge = {
        cart_id: row.cart_id,
        user_id: row.user_id,
        email: row.email,
        item_count: cart.items.length,
        cart_value_agorot: cart.total,
        provider_id: result.id,
      }
      let { error: insertError } = await admin
        .from('abandoned_cart_nudges' as never)
        .insert({ ...nudge, reminder_number: reminder } as never)
      if (insertError?.code === UNDEFINED_COLUMN) {
        // Behind pending/190. The old UNIQUE on cart_id alone still caps this
        // cart at one nudge, so recording it unnumbered loses nothing.
        ;({ error: insertError } = await admin
          .from('abandoned_cart_nudges' as never)
          .insert(nudge as never))
      }
      if (insertError) {
        // The mail went out and the receipt did not. Loud, because the next run
        // will see no nudge for this cart and send the same message again.
        log.error('abandoned_cart.nudge_not_recorded', {
          cart_id: row.cart_id,
          reminder_number: reminder,
          code: insertError.code ?? null,
        })
        failed += 1
        continue
      }

      /**
       * The send half of the conversion funnel. The recovery half is
       * `fn_attribute_cart_recovery`, called from `finalize`, which emits
       * `abandoned_cart_recovered` against the same distinct id.
       *
       * KEYED ON THE USER ID, and that is a real limitation rather than a
       * choice: `serverDistinctId` prefers the browser's PostHog id so a
       * server event joins the same person's client-side funnel, and a cron has
       * no request and therefore no cookie to read. Both events here use the
       * user id, so send and recovery join each other even though neither joins
       * the browsing session that preceded them.
       *
       * PostHog only, deliberately. `trackServerEvent` also writes the
       * first-party `analytics_events` table, whose deployed whitelist
       * (`fn_ingest_analytics_events`) accepts four names and would reject this
       * one -- adding it is a migration for a metric that has a first-party
       * home already in `v_abandoned_cart_recovery`.
       */
      trackEvent(
        'abandoned_cart_reminder_sent',
        {
          cart_id: row.cart_id,
          reminder_number: reminder,
          item_count: cart.items.length,
          cart_value_agorot: cart.total,
        },
        { distinctId: row.user_id },
      )
      sent += 1
    } catch {
      failed += 1
    }
  }

  return NextResponse.json({ ok: true, due: due.length, sent, failed, skipped })
}

export const GET = withRequestLog(
  '/api/cron/abandoned-cart',
  withJobRun('abandoned-cart', handleGET),
)
