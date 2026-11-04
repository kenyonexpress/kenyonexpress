'use server'

import { GUEST_LINK_PARAM } from '@/lib/auth/guest-link'
import { safeNextPath } from '@/lib/auth/safe-next'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { siteUrl } from '@/lib/site-url'
import { createClient } from '@/lib/supabase/server'
import type { AuthState } from '@/server/actions/auth'
import { redirect } from 'next/navigation'

/**
 * The post-payment "save with Google" button (S07).
 *
 * `linkIdentity` attaches Google to the anonymous user that just paid, so the
 * order, the address and the saved card stay on the same id with nothing to
 * move. When that Google account already exists Supabase refuses the link and
 * comes back to /auth/callback with `identity_already_exists`; the callback
 * then signs in to the existing account and `attachGuestOrders` hands the
 * guest's rows over (src/server/auth/guest-orders.ts).
 *
 * Only for an anonymous session. A signed-in customer has nothing to save, and
 * a visitor with no session has no order to attach.
 */
async function runLinkGoogleAfterCheckout(_: AuthState, formData: FormData): Promise<AuthState> {
  const raw = formData.get('next')
  const next = safeNextPath(typeof raw === 'string' ? raw : null)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.is_anonymous) return { error: 'אין הזמנת אורח לשמירה' }

  const { data, error } = await supabase.auth.linkIdentity({
    provider: 'google',
    options: {
      redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}&${GUEST_LINK_PARAM}=1`,
      scopes: 'openid email profile',
    },
  })
  if (error || !data?.url) {
    log.warn('auth.guest_link_start_failed', { userId: user.id, reason: error?.message })
    return { error: 'לא ניתן להתחבר עם Google כרגע, נסו שוב' }
  }
  redirect(data.url)
}

export async function linkGoogleAfterCheckout(
  prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  return withActionContext('auth.link_google_after_checkout', () =>
    runLinkGoogleAfterCheckout(prev, formData),
  )
}
