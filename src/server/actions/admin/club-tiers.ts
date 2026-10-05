'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import {
  parseClubTiersForm,
  pickThresholds,
  thresholdsToRows,
} from '@/lib/admin/club-tiers-settings'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import type { ClubTierRow } from '@/lib/club/tiers'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { TABLE_MISSING } from '@/lib/supabase/error-codes'
import { revalidatePath } from 'next/cache'

export type ClubTiersActionState = { error: string } | { success: string } | null

/**
 * Writes the three paid-tier rows of `club_tiers` (pending 251).
 *
 * The same shape as `updateReferralSettings`: the `payments: write` guard is
 * the authorization, the service key is the transport (the table's only policy
 * is an authenticated SELECT), and the audit row carries the whole before and
 * after so the log's diff column shows which threshold moved and by how much.
 *
 * `member` is never written: it is the floor, pinned to 0 by the table's CHECK,
 * and the form does not offer it. Three rows, upserted by id in one statement,
 * so a half-applied edit (silver moved, gold not) cannot exist between two
 * reads; the ascending rule was already checked by the parser over all three.
 */
async function runUpdateClubTiers(
  _: ClubTiersActionState,
  formData: FormData,
): Promise<ClubTiersActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireSection('payments', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = parseClubTiersForm(formData)
  if (!parsed.ok) return { error: parsed.error }

  const admin = createAdminClient()
  const { data: before, error: readError } = await admin
    .from('club_tiers' as never)
    .select('id, min_agorot')
  if (readError) {
    if (readError.code === TABLE_MISSING) {
      return {
        error: 'הטבלה club_tiers עדיין לא קיימת: יש להחיל את migrations/pending/251_club_tiers.sql',
      }
    }
    log.error('club_tiers.read_failed', { reason: readError.message })
    return { error: `קריאת הספים נכשלה: ${readError.message}` }
  }

  const rows = thresholdsToRows(parsed.value).map((row) => ({
    ...row,
    updated_at: new Date().toISOString(),
  }))
  const { error } = await admin
    .from('club_tiers' as never)
    .upsert(rows as never, { onConflict: 'id' })
  if (error) {
    log.error('club_tiers.write_failed', { reason: error.message })
    return { error: `השמירה נכשלה: ${error.message}` }
  }

  const after: Record<string, number> = { member: 0 }
  for (const row of rows) after[row.id] = row.min_agorot

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'updated',
    entityType: 'club_tiers',
    entityId: null,
    changes: { table: 'club_tiers', unit: 'agorot' },
    before: pickThresholds(before as ClubTierRow[] | null),
    after,
  })

  revalidatePath('/admin/settings')
  revalidatePath('/account')
  return { success: 'ספי המועדון נשמרו' }
}

export async function updateClubTiers(
  _: ClubTiersActionState,
  formData: FormData,
): Promise<ClubTiersActionState> {
  return withActionContext('admin.settings.update_club_tiers', () =>
    runUpdateClubTiers(_, formData),
  )
}
