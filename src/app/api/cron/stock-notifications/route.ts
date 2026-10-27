import { revalidateTag } from 'next/cache'

import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { fetchWithTimeout } from '@/lib/http/fetch-with-timeout'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { bearerMatches } from '@/lib/security/constant-time'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Process stock notifications: find products that are back in stock and
 * notify users who subscribed to notifications for those products.
 *
 * Runs every hour via Vercel cron: `0 * * * *`
 */
async function handlePOST(request: Request) {
  try {
    // Verify CRON_SECRET
    if (!bearerMatches(request.headers.get('authorization'), process.env.CRON_SECRET ?? '')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = await createAdminClient()

    // Find products that have pending notifications and are now in stock
    const { data: notifiable, error: notifyError } = await admin
      .from('stock_notifications')
      .select(
        `
        id,
        product_id,
        email,
        user_id,
        products!inner(
          id,
          name_he,
          stock_quantity
        )
      `,
      )
      .is('notified_at', null)
      .is('unsubscribed_at', null)
      .gt('products.stock_quantity', 0)

    if (notifyError) {
      log.error('stock.notify_query_failed', { error: notifyError })
      return Response.json({ error: 'Failed to query notifications' }, { status: 500 })
    }

    if (!notifiable || notifiable.length === 0) {
      return Response.json({ processed: 0, notified: 0 })
    }

    // Group by product for bulk updates
    const productMap = new Map<string, (typeof notifiable)[0][]>()
    for (const row of notifiable) {
      const productId = (row.products as any).id
      if (!productMap.has(productId)) {
        productMap.set(productId, [])
      }
      productMap.get(productId)!.push(row)
    }

    // Send emails and mark as notified
    let emailCount = 0
    for (const [productId, rows] of productMap.entries()) {
      const firstRow = rows[0]
      if (!firstRow) continue

      let productData: any = firstRow.products
      if (Array.isArray(productData)) {
        productData = productData[0]
      }
      if (!productData) continue

      const productName = String(productData.name_he || '')
      const stockLevel = Number(productData.stock_quantity || 0)

      for (const row of rows) {
        try {
          // Send email notification via Resend
          const emailResponse = await fetchWithTimeout('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'notifications@kenyonexpress.com',
              to: row.email,
              subject: `${productName} זמין שוב בקניון EXPRESS!`,
              html: `
                <h2>${productName} חזר למלאי!</h2>
                <p>המוצר שרשמת לתביעה עליו זמין שוב בקניון EXPRESS.</p>
                <p>כמות במלאי: ${stockLevel}</p>
                <a href="https://kenyonexpress.com/product/${encodeURIComponent(productName)}">
                  לצפייה במוצר לחץ כאן
                </a>
              `,
            }),
          })

          if (!emailResponse.ok) {
            log.warn('stock.email_send_failed', {
              notification_id: row.id,
              product_id: productId,
              email: row.email,
            })
            continue
          }

          // Mark notification as sent
          const { error: updateError } = await admin
            .from('stock_notifications')
            .update({ notified_at: new Date().toISOString() })
            .eq('id', row.id)

          if (!updateError) {
            emailCount++
          }
        } catch (error) {
          log.error('stock.notify_processing_error', {
            notification_id: row.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }
    }

    // A route handler cannot call updateTag (Server Actions only), so expire the
    // catalogue tag with revalidateTag; 'max' serves stale once while refreshing.
    if (emailCount > 0) {
      revalidateTag(CATALOGUE_TAG, 'max')
    }

    // Send alert if any notifications were sent
    if (emailCount > 0) {
      await fetchWithTimeout('https://ntfy.sh/kenyon-ofir-limit', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: `📦 Stock Notifications: ${emailCount} users notified of ${productMap.size} products back in stock`,
      }).catch((err) =>
        log.error('stock.ntfy_send_failed', {
          error_message: err instanceof Error ? err.message : 'Unknown error',
        }),
      )
    }

    return Response.json({
      processed: notifiable.length,
      notified: emailCount,
      products: productMap.size,
    })
  } catch (error) {
    log.error('stock.notify_cron_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    await fetchWithTimeout('https://ntfy.sh/kenyon-ofir-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `⚠️ Stock Notifications Cron Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }).catch((err) => log.error('stock.ntfy_alert_send_failed', { error: err.message }))

    return Response.json({ error: 'Cron job failed' }, { status: 500 })
  }
}

export const GET = withRequestLog('/api/cron/stock-notifications', handlePOST)
