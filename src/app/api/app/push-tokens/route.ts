import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { isExpoPushToken } from '@/lib/push/expo'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateRequest } from '@/lib/supabase/bearer'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Device registration for push. Called by the app right after sign-in and again
 * whenever Expo hands it a token it has not already reported.
 *
 * WHY A ROUTE AND NOT A SERVER ACTION. Server actions are a Next form protocol
 * with an origin check the app cannot satisfy from a native fetch; a route
 * handler is an ordinary HTTP endpoint. The app authenticates with the bearer
 * token it already holds.
 *
 * WHY THE ADMIN CLIENT WHEN RLS ALREADY ALLOWS THE OWNER. The upsert has to
 * reach a row that may currently belong to a DIFFERENT user - the previous
 * owner of a resold or shared phone - and RLS correctly hides that row from the
 * new one. Under RLS the insert would hit the unique constraint on the token
 * and fail, leaving the new owner permanently unable to register while the old
 * account kept receiving their notifications. `user_id` is taken from the
 * verified session and never from the body, so the admin client widens nothing
 * a caller can steer.
 */

const registerSchema = z.object({
  token: z.string().min(1).max(200),
  platform: z.enum(['ios', 'android']).optional(),
  device_id: z.string().min(1).max(200).optional(),
  app_version: z.string().min(1).max(40).optional(),
  locale: z.string().min(2).max(10).optional(),
})

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const identity = await authenticateRequest(request)
  if (!identity) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // A phone re-registers on every cold start; 60 an hour is far above that and
  // far below anything worth using to churn rows.
  const allowed = await checkRateLimit(`push-register:${identity.user.id}`, 60, 3600)
  if (!allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const parsed = registerSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const token = parsed.data.token.trim()
  if (!isExpoPushToken(token)) {
    // A device id or an emulator placeholder in this column would make Expo
    // reject the whole 100-message chunk it lands in, taking every valid token
    // in that chunk down with it. Refused at the door instead.
    return NextResponse.json({ ok: false, error: 'not_an_expo_token' }, { status: 400 })
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { error } = await admin.from('push_tokens').upsert(
    {
      user_id: identity.user.id,
      expo_token: token,
      platform: parsed.data.platform ?? 'unknown',
      device_id: parsed.data.device_id ?? null,
      app_version: parsed.data.app_version ?? null,
      locale: parsed.data.locale ?? 'he',
      // Re-registering is how a customer who reinstalled comes back. A token
      // disabled by a past DeviceNotRegistered has to be revived here or the
      // reinstall is silent.
      enabled: true,
      disabled_reason: null,
      last_seen_at: now,
    },
    { onConflict: 'expo_token' },
  )

  if (error) {
    log.error('push.register_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: 'register_failed' }, { status: 500 })
  }

  // Expo mints a new token for the same install after some store updates. The
  // old row would otherwise keep receiving pushes into a void forever, so the
  // device's other tokens are retired the moment it reports a newer one.
  if (parsed.data.device_id) {
    await admin
      .from('push_tokens')
      .update({ enabled: false, disabled_reason: 'replaced by a newer token on the same device' })
      .eq('user_id', identity.user.id)
      .eq('device_id', parsed.data.device_id)
      .neq('expo_token', token)
  }

  return NextResponse.json({ ok: true })
}

const unregisterSchema = z.object({ token: z.string().min(1).max(200) })

/**
 * Sign-out and the in-app notifications toggle. Disables rather than deletes,
 * so the row keeps saying why this device went quiet.
 */
async function handleDELETE(request: NextRequest): Promise<NextResponse> {
  const identity = await authenticateRequest(request)
  if (!identity) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const parsed = unregisterSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('push_tokens')
    .update({ enabled: false, disabled_reason: 'signed out' })
    .eq('expo_token', parsed.data.token.trim())
    // Scoped to the caller: holding a token string must not let anyone silence
    // somebody else's phone.
    .eq('user_id', identity.user.id)

  if (error) {
    log.error('push.unregister_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: 'unregister_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/app/push-tokens', handlePOST)
export const DELETE = withRequestLog('/api/app/push-tokens', handleDELETE)
