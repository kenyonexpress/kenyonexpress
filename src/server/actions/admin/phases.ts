'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { CATALOGUE_TAG } from '@/lib/catalogue-cache'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath, updateTag } from 'next/cache'
import { z } from 'zod'

/**
 * Turning a product type on or off.
 *
 * ADMIN ONLY, and not `content_uploader`: this decides what the shop sells.
 * Measured against production, switching `physical` off hides 44 of 44 active
 * products, which is a business decision and not a catalogue edit.
 *
 * `updateTag(CATALOGUE_TAG)` plus `revalidatePath('/')` and the two archives.
 * The tag expires the cached phase read and every catalogue list that now has
 * to be recomputed; the paths invalidate the prerendered pages that hold the
 * old grid. Doing only the tag leaves a prerendered `/products` listing a type
 * that is no longer sellable, and a shopper who clicks it gets a 404 from the
 * product page - which reads as a broken link rather than as a withdrawal.
 */

export type PhaseActionState = { error: string } | { success: string } | null

const schema = z.object({
  productType: z.string().trim().min(2).max(40),
  enabled: z.boolean(),
  note: z.string().trim().max(500).optional(),
})

const NOT_APPLIED = 'טבלת השלבים עדיין לא הוחלה. ראו migrations/pending/210_product_phases.sql'
const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703', 'PGRST202', '42883'])

async function runSetPhase(_: PhaseActionState, formData: FormData): Promise<PhaseActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const raw = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value : undefined
  }

  const parsed = schema.safeParse({
    productType: raw('productType'),
    enabled: raw('enabled') === 'true',
    note: raw('note'),
  })
  if (!parsed.success) return { error: 'קלט לא תקין' }

  const admin = createAdminClient()
  const { error } = await admin.rpc(
    'set_phase_enabled' as never,
    {
      p_product_type: parsed.data.productType,
      p_enabled: parsed.data.enabled,
      p_actor: session.userId,
      p_note: parsed.data.note ?? null,
    } as never,
  )

  if (error) {
    if (MISSING.has(error.code ?? '')) return { error: NOT_APPLIED }
    log.error('admin.phase_toggle_failed', {
      productType: parsed.data.productType,
      reason: error.message,
    })
    return { error: 'העדכון נכשל' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'phase_config',
    entityId: parsed.data.productType,
    changes: { product_type: parsed.data.productType, is_enabled: parsed.data.enabled },
  })

  updateTag(CATALOGUE_TAG)
  revalidatePath('/')
  revalidatePath('/products')
  revalidatePath('/admin/phases')

  return {
    success: parsed.data.enabled ? 'הסוג הופעל למכירה' : 'הסוג הוסר ממכירה',
  }
}

export async function setProductPhase(
  state: PhaseActionState,
  formData: FormData,
): Promise<PhaseActionState> {
  return withActionContext('admin.phase_set', () => runSetPhase(state, formData))
}
