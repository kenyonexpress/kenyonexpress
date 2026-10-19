import 'server-only'

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Signs `userId` in on THIS request, after the caller has proven who they are
 * by another factor (a passkey assertion or a WhatsApp code).
 *
 * Supabase has no "create a session for user X" call, so this uses the one it
 * does have: the admin API mints a single-use magic-link token for the user's
 * email, and the server immediately redeems it with `verifyOtp`, which writes
 * the session cookies on the response. The token never leaves the server.
 * An account with no email cannot be signed in this way; the caller says so.
 */
export async function mintSessionFor(
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: 'no_email' | 'failed' }> {
  const admin = createAdminClient()
  const { data: found, error: userError } = await admin.auth.admin.getUserById(userId)
  const email = found?.user?.email
  if (userError || !found?.user) return { ok: false, reason: 'failed' }
  if (!email) return { ok: false, reason: 'no_email' }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const tokenHash = link?.properties?.hashed_token
  if (linkError || !tokenHash) {
    log.error('auth.mint_link_failed', { reason: linkError?.message ?? 'no token' })
    return { ok: false, reason: 'failed' }
  }

  const supabase = await createClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  })
  if (verifyError) {
    log.error('auth.mint_verify_failed', { reason: verifyError.message })
    return { ok: false, reason: 'failed' }
  }
  return { ok: true }
}
