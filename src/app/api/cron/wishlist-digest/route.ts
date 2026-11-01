import { sendEmail } from '@/lib/email/resend'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatAgorot } from '@/lib/vouchers/coupon-view'
import { isInStock, isoWeekKey, previousObservedPrice } from '@/lib/wishlist/alerts'
import { createUnsubscribeToken } from '@/lib/wishlist/unsubscribe-token'
import { OFF_PAGE } from '@/styles/tokens'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The customer's weekly wishlist digest: one Friday-morning mail per user who
 * OPTED IN (`wishlist_alert_prefs.weekly_digest`, default off, so until 233
 * is applied and somebody flips the switch this route mails nobody, which is
 * the correct number of marketing emails to send without consent).
 *
 * DIRECT RESEND SEND, NOT THE OUTBOX, the same decision the operator digest
 * at /api/cron/weekly-digest recorded: the outbox kind CHECK is a deployed
 * constraint and a digest is a summary, not an event. What the outbox would
 * buy is retries, and a digest that misses a week is stale rather than owed:
 * next Friday's covers it. Resend's idempotency key
 * (`wishlist_digest:<user>:<ISO week>`) keeps a double run at one mail.
 *
 * EVERY MAIL CARRIES THE SIGNED UNSUBSCRIBE LINK (scope `digest`). If no
 * secret can sign one, the user is SKIPPED, not mailed without an exit:
 * recurring marketing mail with no working unsubscribe is the one shape this
 * feature must never produce.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */

const TABLE_MISSING = new Set(['PGRST205', '42P01'])

/** Users per run and items per mail. More opted-in users than this is a nice
 * problem, and the cap fails the tail loudly in the response counters. */
const MAX_USERS = 500
const MAX_ITEMS = 20

const { brand: BRAND, ink: INK, muted: MUTED, rule: RULE, paper: PAPER } = OFF_PAGE

type ProductRow = {
  id: string
  name_he: string | null
  slug: string | null
  status: string | null
  stock_quantity: number | null
  kenyon_price_agorot: number | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface DigestItem {
  name: string
  url: string
  priceAgorot: number | null
  droppedFromAgorot: number | null
  inStock: boolean
}

function itemLineHtml(item: DigestItem): string {
  const price =
    item.priceAgorot !== null
      ? item.droppedFromAgorot !== null
        ? `<span style="color:${MUTED};text-decoration:line-through">${escapeHtml(formatAgorot(item.droppedFromAgorot))}</span> <b>${escapeHtml(formatAgorot(item.priceAgorot))}</b>`
        : `<b>${escapeHtml(formatAgorot(item.priceAgorot))}</b>`
      : ''
  const stock = item.inStock
    ? ''
    : ` <span style="color:${MUTED};font-size:12px">(אזל מהמלאי)</span>`
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid ${RULE}"><a href="${escapeHtml(item.url)}" style="color:${INK};font-weight:600;text-decoration:none">${escapeHtml(item.name)}</a>${stock}</td>
    <td style="padding:8px 0;border-bottom:1px solid ${RULE};text-align:left;white-space:nowrap">${price}</td>
  </tr>`
}

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const site = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il').replace(
    /\/+$/,
    '',
  )
  const week = isoWeekKey(new Date())
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' })

  const { data: prefData, error: prefError } = await admin
    .from('wishlist_alert_prefs' as never)
    .select('user_id')
    .eq('weekly_digest', true)
    .limit(MAX_USERS)
  if (prefError) {
    // Missing table = 233 not applied = nobody has opted in yet. Green no-op.
    if (TABLE_MISSING.has(prefError.code ?? '')) {
      return NextResponse.json({ ok: true, week, optedIn: 0, sent: 0, skipped: 0 })
    }
    log.error('wishlist_digest.prefs_read_failed', { reason: prefError.message })
    return NextResponse.json({ ok: false, error: prefError.message }, { status: 500 })
  }
  const userIds = ((prefData ?? []) as unknown as { user_id: string }[]).map((r) => r.user_id)
  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, week, optedIn: 0, sent: 0, skipped: 0 })
  }

  const [{ data: wishlistData }, { data: profileData }] = await Promise.all([
    admin
      .from('wishlists' as never)
      .select('user_id, product_id')
      .in('user_id', userIds)
      .is('deleted_at', null),
    admin.from('profiles').select('id, email').in('id', userIds),
  ])
  const emailByUser = new Map(
    ((profileData ?? []) as unknown as { id: string; email: string | null }[])
      .filter((row) => row.email)
      .map((row) => [row.id, (row.email as string).toLowerCase()]),
  )
  const productsByUser = new Map<string, string[]>()
  const allProductIds = new Set<string>()
  for (const row of (wishlistData ?? []) as unknown as { user_id: string; product_id: string }[]) {
    const list = productsByUser.get(row.user_id) ?? []
    list.push(row.product_id)
    productsByUser.set(row.user_id, list)
    allProductIds.add(row.product_id)
  }

  const productById = new Map<string, ProductRow>()
  const historyByProduct = new Map<string, { observed_on: string; price_agorot: number }[]>()
  if (allProductIds.size > 0) {
    const ids = [...allProductIds]
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jerusalem',
    })
    const [{ data: productData }, { data: historyData }] = await Promise.all([
      admin
        .from('products')
        .select('id, name_he, slug, status, stock_quantity, kenyon_price_agorot')
        .in('id', ids)
        .is('deleted_at', null),
      admin
        .from('price_history' as never)
        .select('product_id, observed_on, price_agorot')
        .in('product_id', ids)
        .gte('observed_on', since),
    ])
    for (const row of (productData ?? []) as unknown as ProductRow[]) productById.set(row.id, row)
    for (const row of (historyData ?? []) as unknown as {
      product_id: string
      observed_on: string
      price_agorot: number
    }[]) {
      const rows = historyByProduct.get(row.product_id) ?? []
      rows.push(row)
      historyByProduct.set(row.product_id, rows)
    }
  }

  // Suppressions outrank the opt-in, same precedence the outbox RPC applies.
  const suppressed = new Set<string>()
  if (emailByUser.size > 0) {
    const { data } = await admin
      .from('email_suppressions' as never)
      .select('email')
      .in('email', [...new Set(emailByUser.values())])
    for (const row of (data ?? []) as unknown as { email: string }[]) {
      suppressed.add(row.email.toLowerCase())
    }
  }

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const userId of userIds) {
    const email = emailByUser.get(userId)
    const token = createUnsubscribeToken(userId, 'digest')
    if (!email || suppressed.has(email) || !token) {
      skipped++
      continue
    }

    const items: DigestItem[] = []
    for (const productId of (productsByUser.get(userId) ?? []).slice(0, MAX_ITEMS)) {
      const product = productById.get(productId)
      if (!product || product.status !== 'active') continue
      const previous = previousObservedPrice(historyByProduct.get(productId) ?? [], today)
      const current = product.kenyon_price_agorot
      items.push({
        name: product.name_he ?? 'מוצר',
        url: product.slug ? `${site}/product/${product.slug}` : `${site}/account/wishlist`,
        priceAgorot: current,
        droppedFromAgorot:
          previous !== null && current !== null && current < previous ? previous : null,
        inStock: isInStock(product.stock_quantity, product.status),
      })
    }
    if (items.length === 0) {
      skipped++
      continue
    }

    const drops = items.filter((item) => item.droppedFromAgorot !== null).length
    const subject =
      drops > 0
        ? `רשימת המשאלות שלך: ${drops === 1 ? 'מוצר אחד ירד במחיר' : `${drops} מוצרים ירדו במחיר`} השבוע`
        : 'סיכום שבועי לרשימת המשאלות שלך'
    const unsubscribeUrl = `${site}/wishlist-alerts/unsubscribe?token=${token}`

    const html = `<div dir="rtl" style="background:${PAPER};padding:24px 12px;font-family:Heebo,Arial,Helvetica,sans-serif">
      <div style="max-width:560px;margin:0 auto">
        <div style="font-size:20px;font-weight:800;color:${INK};margin-bottom:14px">KenyonExpress</div>
        <div style="font-size:17px;font-weight:700;color:${INK}">${escapeHtml(subject)}</div>
        <table style="border-collapse:collapse;width:100%;margin-top:12px">${items.map(itemLineHtml).join('')}</table>
        <a href="${escapeHtml(`${site}/account/wishlist`)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">לרשימת המשאלות</a>
        <div style="font-size:12px;color:${MUTED};margin-top:16px;text-align:center">קיבלת את המייל הזה כי ביקשת סיכום שבועי לרשימת המשאלות. <a href="${escapeHtml(unsubscribeUrl)}" style="color:${MUTED}">להסרה</a></div>
      </div>
    </div>`

    const text = [
      'שלום,',
      '',
      subject,
      '',
      ...items.map((item) => {
        const price = item.priceAgorot !== null ? ` - ${formatAgorot(item.priceAgorot)}` : ''
        const drop =
          item.droppedFromAgorot !== null ? ` (ירד מ-${formatAgorot(item.droppedFromAgorot)})` : ''
        const stock = item.inStock ? '' : ' (אזל מהמלאי)'
        return `${item.name}${price}${drop}${stock}`
      }),
      '',
      `לרשימה: ${site}/account/wishlist`,
      `להסרה: ${unsubscribeUrl}`,
    ].join('\n')

    const result = await sendEmail({
      to: email,
      subject,
      html,
      text,
      idempotencyKey: `wishlist_digest:${userId}:${week}`,
    })
    if (result.ok) sent++
    else if (result.skipped) skipped++
    else {
      failed++
      log.warn('wishlist_digest.send_failed', { reason: result.reason })
    }
  }

  return NextResponse.json({ ok: true, week, optedIn: userIds.length, sent, skipped, failed })
}

export const GET = withRequestLog('/api/cron/wishlist-digest', handleGET)
