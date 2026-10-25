import { sendEmail } from '@/lib/growth/resend'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { siteUrl } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import { OFF_PAGE } from '@/styles/tokens'
import { type NextRequest, NextResponse } from 'next/server'

const {
  brand: BRAND,
  ink: INK,
  muted: MUTED,
  rule: RULE,
  paper: PAPER,
  panelWarm: PANEL_WARM,
} = OFF_PAGE

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Cart abandonment hourly cron.
 *
 * Finds carts with items where:
 * - last_updated > 24h ago
 * - cart belongs to an authenticated user (not guest)
 * - no completed order exists for that cart
 *
 * Sends one email per cart with product thumbnails and a link to resume.
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */
async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000) // 24 hours ago

  // Find abandoned carts with items updated >24h ago, user not null, no order
  const { data: carts, error: cartsError } = await admin
    .from('carts')
    .select(
      `
      id,
      profile_id,
      updated_at,
      profiles!inner(email, full_name),
      cart_items!inner(
        id,
        product_id,
        quantity,
        products(id, name, image_url)
      )
    `,
    )
    .not('profile_id', 'is', null)
    .lt('updated_at', cutoff.toISOString())
    .limit(100)

  if (cartsError) {
    log.error('cart_abandonment.query_failed', { reason: cartsError.message })
    return NextResponse.json({ ok: false, error: cartsError.message }, { status: 500 })
  }

  if (!carts || carts.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 })
  }

  // Filter out carts that have a completed order
  const cartIds = carts.map((c) => c.id)
  const { data: ordersData } = await admin
    .from('orders')
    .select('cart_id')
    .in('cart_id', cartIds)
    .in('status', ['completed', 'processing'])

  const cartIdsWithOrders = new Set(ordersData?.map((o) => o.cart_id) ?? [])
  const abandonedCarts = carts.filter((cart) => !cartIdsWithOrders.has(cart.id))

  let sent = 0

  for (const cart of abandonedCarts) {
    const profile = Array.isArray(cart.profiles) ? cart.profiles[0] : cart.profiles
    if (!profile?.email) continue

    const items = Array.isArray(cart.cart_items) ? cart.cart_items : []
    if (items.length === 0) continue

    const subject = 'יש לך דיל ממתין בעגלה'
    const site = siteUrl().replace(/\/+$/, '')
    const cartUrl = `${site}/cart`
    const greeting = profile.full_name ? `שלום ${profile.full_name},` : 'שלום,'

    const productBlocks = items
      .slice(0, 3) // Show up to 3 products
      .map((item) => {
        const product = Array.isArray(item.products) ? item.products[0] : item.products
        if (!product) return ''

        const imgUrl = product.image_url || ''
        return `
        <div dir="rtl" style="border:1px solid ${RULE};border-radius:10px;padding:14px;margin:0 0 10px;background:${PAPER};display:flex;align-items:center;gap:12px">
          ${
            imgUrl
              ? `<img src="${escapeHtml(imgUrl)}" alt="" style="width:60px;height:60px;object-fit:cover;border-radius:6px" />`
              : ''
          }
          <div style="flex:1">
            <div style="font-size:15px;font-weight:700;color:${INK}">${escapeHtml(product.name ?? 'מוצר')}</div>
            <div style="font-size:13px;color:${MUTED}">כמות: ${item.quantity}</div>
          </div>
        </div>`
      })
      .filter(Boolean)
      .join('')

    const html = `
      <div dir="rtl" style="background:${PANEL_WARM};padding:24px 12px;font-family:Heebo,Arial,Helvetica,sans-serif">
        <div style="max-width:560px;margin:0 auto">
          <div style="font-size:20px;font-weight:800;color:${INK};margin-bottom:4px">KenyonExpress</div>
          <div style="font-size:15px;color:${INK};margin-bottom:18px">${escapeHtml(greeting)} שמנו לב שהשארת מוצרים בעגלה.</div>
          ${productBlocks}
          ${items.length > 3 ? `<div style="font-size:13px;color:${MUTED};margin:8px 0">ועוד ${items.length - 3} מוצרים נוספים...</div>` : ''}
          <a href="${escapeHtml(cartUrl)}" style="display:block;margin-top:18px;background:${BRAND};color:${INK};text-decoration:none;text-align:center;font-weight:700;padding:13px 18px;border-radius:10px">חזרה לעגלה</a>
          <div style="font-size:13px;color:${MUTED};margin-top:14px;text-align:center">המוצרים שלך ממתינים לך. להשלמת הרכישה פשוט חזרו לעגלה.</div>
        </div>
      </div>`

    const result = await sendEmail({
      to: profile.email,
      subject,
      html,
      tag: 'cart-abandonment',
    })

    if (result.ok) {
      sent += 1
    } else if (!('skipped' in result && result.skipped)) {
      log.error('cart_abandonment.send_failed', {
        cartId: cart.id,
        email: profile.email,
      })
    }
  }

  return NextResponse.json({ ok: true, sent, checked: abandonedCarts.length })
}

export const GET = withRequestLog('/api/cron/cart-abandonment', handleGET)
