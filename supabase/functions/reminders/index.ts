/**
 * Supabase Edge Function: reminders
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 * Schedule: daily (Supabase cron / QStash).
 *
 * Triggers the expiry sweep on the Next cron host, which enqueues the T-7 and
 * T-1 `voucher_expiring` notices (push + email, WhatsApp never automated) and
 * then lets the notifications drain deliver them. Same proxy shape as
 * notifications-worker so the Hebrew templates live in one place.
 *
 * Deploy: supabase functions deploy reminders --no-verify-jwt
 * Secrets: CRON_SECRET, NEXT_PUBLIC_APP_URL (or APP_URL)
 */

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

serve(async (req) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: 'method' }), { status: 405 })
  }

  const secret = Deno.env.get('CRON_SECRET')
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ ok: false }), { status: 401 })
  }

  const appUrl = (Deno.env.get('NEXT_PUBLIC_APP_URL') ?? Deno.env.get('APP_URL') ?? '').replace(
    /\/$/,
    '',
  )
  if (!appUrl) {
    return new Response(JSON.stringify({ ok: false, error: 'no_app_url' }), { status: 503 })
  }

  try {
    const headers = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }
    const sweep = await fetch(`${appUrl}/api/cron/expire-vouchers`, { method: 'POST', headers })
    const sweepBody = await sweep.text()
    if (!sweep.ok) {
      return new Response(sweepBody, {
        status: sweep.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const drain = await fetch(`${appUrl}/api/cron/notifications`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ wake: true, source: 'edge-reminders' }),
    })
    return new Response(await drain.text(), {
      status: drain.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('reminders proxy failed:', message)
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500 })
  }
})
