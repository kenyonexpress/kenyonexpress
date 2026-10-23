/**
 * Guest checkout via Supabase anonymous sessions.
 *
 * Creates anonymous sessions for unauthenticated shoppers, allowing them to
 * complete checkout without signing up. The order and payment token are tied
 * to the anonymous user_id, and can be claimed later via linkIdentity.
 *
 * REQUIRES Supabase project configuration:
 * - Enable Anonymous sign-ins in project settings
 * - Enable Manual linking in project settings
 *
 * Without these settings enabled, signInAnonymously will fail and checkout
 * will fall back to requiring authentication.
 */

import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'

export type GuestIdentityResult =
  | { ok: true; userId: string; isAnonymous: boolean }
  | { ok: false; error: string; code: 'UNAUTHENTICATED' | 'INTERNAL' }

/**
 * Ensures the current request has a valid user session (authenticated or anonymous).
 *
 * For authenticated users: returns their existing user_id.
 * For unauthenticated users: creates an anonymous session if Supabase allows it.
 *
 * Anonymous sessions are marked with is_anonymous: true and can be upgraded
 * to full accounts via auth.linkIdentity after payment.
 */
export async function ensureGuestIdentity(): Promise<GuestIdentityResult> {
  const supabase = await createClient()

  // Check if already authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    return {
      ok: true,
      userId: user.id,
      isAnonymous: user.is_anonymous ?? false,
    }
  }

  // Not authenticated - try to create anonymous session
  try {
    const { data, error } = await supabase.auth.signInAnonymously()

    if (error) {
      log.warn('guest_identity.anonymous_signin_failed', {
        error: error.message,
        code: error.code,
      })

      return {
        ok: false,
        error: 'לא ניתן ליצור חשבון אורח. יש להתחבר עם Google או אימייל.',
        code: 'UNAUTHENTICATED',
      }
    }

    if (!data.user) {
      return {
        ok: false,
        error: 'נכשל ביצירת חשבון אורח',
        code: 'INTERNAL',
      }
    }

    log.info('guest_identity.anonymous_session_created', {
      user_id: data.user.id,
    })

    return {
      ok: true,
      userId: data.user.id,
      isAnonymous: true,
    }
  } catch (err) {
    log.error('guest_identity.create_failed', {
      err,
    })

    return {
      ok: false,
      error: 'שגיאה ביצירת חשבון אורח',
      code: 'INTERNAL',
    }
  }
}

/**
 * Checks if the current user is an anonymous guest.
 */
export async function isAnonymousGuest(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user?.is_anonymous ?? false
}
