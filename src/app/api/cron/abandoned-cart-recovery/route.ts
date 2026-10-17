import { loadCartProductData } from '@/lib/cart/load-products'
import { buildCartView } from '@/lib/cart/pricing'
import type { CartStorageItem } from '@/lib/cart/types'
import { sendEmail } from '@/lib/growth/resend'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { OFF_PAGE } from '@/styles/tokens'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Multi-stage abandoned cart recovery emails with escalating discounts.
 *
 * Stage 1 (+1h): Initial recovery email with 5% discount
 * Stage 2 (+24h): Escalated email with 10% discount (if not recovered)
 *
 * Both stages require a newsletter subscription consent (as per 031_notifications).
 * Each cart receives at most two emails, tracked in abandoned_cart_nudges table.
 *
 * Eligibility is decided in fn_due_abandoned_carts_stage_1 and stage_2,
 * so the rules are testable in SQL and cannot drift.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 * Runs hourly.
 */

interface RecoveryStage {
  discountPercent: number
  hoursElapsed: number
  subject: string
  headline: string
}

const RECOVERY_STAGES: Record<1 | 2, RecoveryStage> = {
  1: {
    discountPercent: 5,
    hoursElapsed: 1,
    subject: 'קופון של 5% על המוצרים שבסל שלך',
    headline: 'הנחה בלעדית בחזרה לסל',
  },
  2: {
    discountPercent: 10,
    hoursElapsed: 24,
    subject: 'עוד הזדמנות: הנחה של 10% על הסל שלך',
    headline: 'הנחה מיוחדת בסוף השבוע',
  },
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il').replace(
    /\/+$/,
    '',
  )

  const results = {
    stage1: { due: 0, sent: 0, failed: 0 },
    stage2: { due: 0, sent: 0, failed: 0 },
  }

  /**
   * Get cart value in agorot at time of nudge.
   * Best-effort: returns null if pricing fails.
   */
  async function cartValueAgorot(cartId: string): Promise<number | null> {
    try {
      const { data: cart } = await admin
        .from('carts')
        .select('items')
        .eq('id', cartId)
        .maybeSingle()
      const items = (Array.isArray(cart?.items) ? cart.items : []) as CartStorageItem[]
      if (items.length === 0) return null
      const { products, variants } = await loadCartProductData(items)
      return buildCartView(cartId, items, products, variants).subtotal
    } catch {
      return null
    }
  }

  /**
   * Generate recovery email HTML with discount code and styling.
   */
  function generateRecoveryHtml(
    stage: 1 | 2,
    itemCount: number,
    discountCode: string,
    unsubscribeUrl?: string,
  ): string {
    const stageConfig = RECOVERY_STAGES[stage]
    const brandColor = OFF_PAGE.brand
    const textColor = OFF_PAGE.ink
    const mutedColor = OFF_PAGE.muted

    return `
<div dir="rtl" style="font-family: Heebo, Arial, Helvetica, sans-serif; text-align: right; background: #f5f5f5; padding: 20px; color: ${textColor};">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

    <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 24px; color: ${brandColor};">
      ${stageConfig.headline}
    </h1>

    <p style="font-size: 16px; line-height: 1.5; margin: 0 0 20px;">
      יש לך <bdi>${itemCount}</bdi> פריטים בסל בקניון אקספרס שממתינים לך.
    </p>

    <div style="background: #e8f5e9; border-left: 4px solid ${brandColor}; padding: 16px; margin: 24px 0; border-radius: 4px;">
      <p style="margin: 0; font-size: 14px; color: ${mutedColor};">קוד הנחה בלעדי:</p>
      <p style="margin: 8px 0 0; font-size: 20px; font-weight: 700; font-family: monospace; color: ${brandColor};">
        ${discountCode}
      </p>
      <p style="margin: 8px 0 0; font-size: 13px; color: ${mutedColor};">
        <bdi>${stageConfig.discountPercent}%</bdi> הנחה על כל הפריטים בסל
      </p>
    </div>

    <p style="margin: 0 0 20px; font-size: 14px; color: ${mutedColor};">
      הקוד תופס למשך 48 שעות בלבד.
    </p>

    <a
      href="${baseUrl}/cart"
      style="display: inline-block; background: ${brandColor}; color: white; font-weight: 700; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 16px; margin: 24px 0;"
    >
      חזרה לסל שלי
    </a>

    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 32px 0;" />

    <p style="font-size: 12px; color: ${mutedColor}; margin: 16px 0 0;">
      קניון אקספרס — קופונים ודילים לכל המשפחה
    </p>
    ${
      unsubscribeUrl
        ? `<p style="font-size: 12px; color: ${mutedColor}; margin: 8px 0 0;">
        <a href="${unsubscribeUrl}" style="color: ${mutedColor}; text-decoration: underline;">
          הסרה מרשימת הדיוור
        </a>
      </p>`
        : ''
    }
  </div>
</div>
    `.trim()
  }

  /**
   * Send stage 1 recovery emails (+1h with 5% discount).
   */
  const { data: stage1Data, error: stage1Error } = await admin.rpc(
    'fn_due_abandoned_carts_stage_1' as never,
    {
      p_limit: 100,
    } as never,
  )

  if (!stage1Error && Array.isArray(stage1Data)) {
    const stage1Rows = stage1Data as unknown as {
      cart_id: string
      user_id: string
      email: string
      item_count: number
    }[]

    results.stage1.due = stage1Rows.length

    for (const row of stage1Rows) {
      try {
        const discountCode = `RECOVERY-${Date.now().toString(36).toUpperCase()}`

        const { data: sub } = await admin
          .from('newsletter_subscribers' as never)
          .select('unsubscribe_token')
          .eq('email', row.email)
          .maybeSingle()
        const unsubToken = (sub as unknown as { unsubscribe_token?: string } | null)
          ?.unsubscribe_token
        const unsubUrl = unsubToken
          ? `${baseUrl}/newsletter/unsubscribe?token=${unsubToken}`
          : undefined

        const result = await sendEmail({
          to: row.email,
          subject: RECOVERY_STAGES[1].subject,
          tag: 'abandoned_cart_recovery_1',
          unsubscribeUrl: unsubUrl,
          html: generateRecoveryHtml(1, row.item_count, discountCode, unsubUrl),
        })

        if ('skipped' in result && result.skipped) continue
        if (!result.ok) {
          results.stage1.failed += 1
          continue
        }

        const cartValue = await cartValueAgorot(row.cart_id)

        await admin.from('abandoned_cart_nudges' as never).insert({
          cart_id: row.cart_id,
          user_id: row.user_id,
          email: row.email,
          item_count: row.item_count,
          cart_value_agorot: cartValue,
          first_nudge_at: new Date().toISOString(),
          first_discount_percent: RECOVERY_STAGES[1].discountPercent,
          first_provider_id: result.id,
        } as never)

        results.stage1.sent += 1
      } catch (_e) {
        results.stage1.failed += 1
      }
    }
  }

  /**
   * Send stage 2 recovery emails (+24h with 10% discount).
   */
  const { data: stage2Data, error: stage2Error } = await admin.rpc(
    'fn_due_abandoned_carts_stage_2' as never,
    {
      p_limit: 100,
    } as never,
  )

  if (!stage2Error && Array.isArray(stage2Data)) {
    const stage2Rows = stage2Data as unknown as {
      cart_id: string
      user_id: string
      email: string
      item_count: number
      nudge_id: string
    }[]

    results.stage2.due = stage2Rows.length

    for (const row of stage2Rows) {
      try {
        const discountCode = `FINAL-${Date.now().toString(36).toUpperCase()}`

        const { data: sub } = await admin
          .from('newsletter_subscribers' as never)
          .select('unsubscribe_token')
          .eq('email', row.email)
          .maybeSingle()
        const unsubToken = (sub as unknown as { unsubscribe_token?: string } | null)
          ?.unsubscribe_token
        const unsubUrl = unsubToken
          ? `${baseUrl}/newsletter/unsubscribe?token=${unsubToken}`
          : undefined

        const result = await sendEmail({
          to: row.email,
          subject: RECOVERY_STAGES[2].subject,
          tag: 'abandoned_cart_recovery_2',
          unsubscribeUrl: unsubUrl,
          html: generateRecoveryHtml(2, row.item_count, discountCode, unsubUrl),
        })

        if ('skipped' in result && result.skipped) continue
        if (!result.ok) {
          results.stage2.failed += 1
          continue
        }

        await admin
          .from('abandoned_cart_nudges' as never)
          .update({
            second_nudge_at: new Date().toISOString(),
            second_discount_percent: RECOVERY_STAGES[2].discountPercent,
            second_provider_id: result.id,
          } as never)
          .eq('id', row.nudge_id)

        results.stage2.sent += 1
      } catch (_e) {
        results.stage2.failed += 1
      }
    }
  }

  return NextResponse.json({
    ok: true,
    stage1: results.stage1,
    stage2: results.stage2,
    timestamp: new Date().toISOString(),
  })
}

export const GET = withRequestLog('/api/cron/abandoned-cart-recovery', handleGET)
