/**
 * Supabase Edge Function: notifications-worker
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 * Schedule: every minute (Supabase cron / QStash) OR invoke after enqueue wake.
 *
 * This twin drains `notification_outbox` by calling the Next cron host that
 * owns the shared Resend + RTL builders. Keeping one HTML contract avoids
 * drifting Deno copies of Hebrew templates. When NEXT_PUBLIC_APP_URL is unset,
 * the function returns 503 so QStash retries later.
 *
 * Deploy: supabase functions deploy notifications-worker --no-verify-jwt
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
    const res = await fetch(`${appUrl}/api/cron/notifications`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ wake: true, source: 'edge-notifications-worker' }),
    })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('notifications-worker proxy failed:', message)
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500 })
  }
})
