/**
 * Anonymization job for users whose deletion grace period has expired
 *
 * GDPR Article 17 and Israeli Privacy Protection Law.
 * Removes PII while preserving order records for legal compliance.
 */

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'

export async function anonymizeUserDataJob(): Promise<{
  success: boolean
  anonymized_count: number
  errors: string[]
}> {
  const errors: string[] = []
  let anonymizedCount = 0

  try {
    const supabase = createAdminClient()

    const { data: pendingDeletions, error: fetchError } = await supabase
      .from('pending_deletions')
      .select('id, user_id, scheduled_delete_at')
      .eq('status', 'grace_period')
      .lte('scheduled_delete_at', new Date().toISOString())

    if (fetchError) {
      log.error('anonymize_user_data.fetch_failed', { reason: fetchError.message })
      errors.push(`Failed to fetch pending deletions: ${fetchError.message}`)
      return { success: false, anonymized_count: 0, errors }
    }

    if (!pendingDeletions || pendingDeletions.length === 0) {
      return { success: true, anonymized_count: 0, errors: [] }
    }

    for (const deletion of pendingDeletions) {
      try {
        await anonymizeUser(supabase, deletion.user_id)
        anonymizedCount++

        await supabase
          .from('pending_deletions')
          .update({
            status: 'anonymized',
            anonymized_at: new Date().toISOString(),
          })
          .eq('id', deletion.id)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        // The id is deliberately absent: writing it into a log line would
        // outlive the anonymisation this line reports.
        log.error('anonymize_user_data.user_failed', { reason: errorMsg })
        errors.push(`User ${deletion.user_id}: ${errorMsg}`)
      }
    }

    return {
      success: errors.length === 0,
      anonymized_count: anonymizedCount,
      errors,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    log.error('anonymize_user_data.job_failed', { reason: errorMsg })
    return {
      success: false,
      anonymized_count: anonymizedCount,
      errors: [`Job failed: ${errorMsg}`],
    }
  }
}

/**
 * Anonymize all PII for a user while preserving order history
 */
async function anonymizeUser(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  const anonymousEmail = `deleted-${userId}@kenyonexpress.invalid`
  const now = new Date().toISOString()

  // 1. Anonymize profile
  await supabase
    .from('profiles')
    .update({
      first_name: null,
      last_name: null,
      phone: null,
      email: anonymousEmail,
      updated_at: now,
    })
    .eq('id', userId)

  // 2. Delete all user addresses
  await supabase.from('user_addresses').delete().eq('user_id', userId)

  // 3. Clear wishlist notes
  await supabase
    .from('wishlists')
    .update({
      notes: null,
      updated_at: now,
    })
    .eq('user_id', userId)

  // 4. Clear push notification tokens
  await supabase.from('push_tokens').delete().eq('user_id', userId)

  // 5. Delete support tickets
  await supabase.from('support_tickets').delete().eq('user_id', userId)

  // NOTE: Orders are NOT deleted - preserved for legal compliance with 7-year tax retention law
}
