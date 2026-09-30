'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'

/**
 * What the browser may know about the session now that the cookie is
 * HttpOnly (lib/auth/session-cookie.ts): the user's id, and, for the one
 * component that needs it, a short-lived access token.
 *
 * `currentUserId` is the Sentry tag and the "render nothing when signed out"
 * gate. The id is a UUID, not a secret; it is also what withActionContext
 * already decodes from the cookie on every action.
 *
 * `realtimeCredentials` is for the account bell only. Supabase Realtime
 * evaluates the `notifications` RLS policy against the JWT the socket
 * presents, and a socket with no JWT is `anon` and receives nothing. The
 * ACCESS token crosses to the browser, the REFRESH token never does: the
 * access token is worth an hour (`jwt_exp` measured 3600 on the hosted
 * project, 2026-10-01) and cannot mint a successor, which is the whole
 * difference between the two and the reason the refresh token is the one
 * behind HttpOnly. `getSession()` here reads the cookie already verified by
 * `getUser()` on the line above it; nothing is decided on the unverified
 * read.
 */

export type RealtimeCredentials = { userId: string; accessToken: string } | null

async function runCurrentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function runRealtimeCredentials(): Promise<RealtimeCredentials> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  return { userId: user.id, accessToken: session.access_token }
}

export async function currentUserId(): Promise<string | null> {
  return withActionContext('session.current_user_id', () => runCurrentUserId())
}

export async function realtimeCredentials(): Promise<RealtimeCredentials> {
  return withActionContext('session.realtime_credentials', () => runRealtimeCredentials())
}
