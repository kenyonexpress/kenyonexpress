'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { ilsToAgorot } from '@/lib/commerce/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Scheduling and cancelling a flash deal.
 *
 * `discounts` and not a section of its own: this is the same authority that
 * already sets `discount_campaigns`, and giving a price schedule its own
 * permission would mean an operator who can run a 50%-off code cannot run a
 * 50%-off afternoon.
 *
 * MONEY ARRIVES AS SHEKELS AND IS STORED AS AGOROT, through `ilsToAgorot` —
 * which parses rather than multiplies, because `Number('8.20') * 100` is
 * 819.9999999999999. Nothing on this path holds a shekel float.
 *
 * A PAST TIME IS REFUSED at the form, and it is worth saying why rather than
 * just doing it: the CRON deliberately treats a past due row as still due, so
 * that a missed run catches up. Those two rules together mean "schedule for
 * yesterday" would apply immediately and look like a bug in the scheduler
 * rather than a mis-typed date.
 */

const scheduleSchema = z.object({
  productId: z.string().uuid(),
  // `datetime-local` from the form, interpreted in the browser's zone, which
  // for an Israeli operator is Israel's. Stored as an instant.
  effectiveAt: z.string().min(10),
  priceIls: z.coerce.number().positive().max(1_000_000),
  referenceIls: z.coerce.number().positive().max(1_000_000).nullable().optional(),
  note: z.string().max(200).optional(),
})

export type FlashDealState = { ok: boolean; error?: string; message?: string }

async function runSchedule(formData: FormData): Promise<FlashDealState> {
  const session = await requireSection('discounts', 'write')

  const parsed = scheduleSchema.safeParse({
    productId: formData.get('product_id'),
    effectiveAt: formData.get('effective_at'),
    priceIls: formData.get('price_ils'),
    referenceIls: formData.get('reference_ils') || null,
    note: formData.get('note') || undefined,
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'קלט לא תקין.' }
  }

  const when = new Date(parsed.data.effectiveAt)
  if (Number.isNaN(when.getTime())) return { ok: false, error: 'תאריך לא תקין.' }
  if (when.getTime() <= Date.now()) {
    return { ok: false, error: 'המועד חייב להיות בעתיד. שינוי מיידי נעשה בעריכת המוצר.' }
  }

  const priceAgorot = ilsToAgorot(parsed.data.priceIls)
  const referenceAgorot =
    parsed.data.referenceIls == null ? null : ilsToAgorot(parsed.data.referenceIls)

  // A struck-through price at or below the price it is struck through against
  // is not a saving. Refused here rather than left to the storefront's
  // compliance check, because that check can only SUPPRESS the claim after the
  // fact and the operator would never learn they had typed it.
  if (referenceAgorot !== null && referenceAgorot <= priceAgorot) {
    return { ok: false, error: 'המחיר שלפני ההנחה חייב להיות גבוה מהמחיר החדש.' }
  }

  const { error } = await createAdminClient()
    .from('scheduled_price_changes' as never)
    .insert({
      product_id: parsed.data.productId,
      effective_at: when.toISOString(),
      price_agorot: priceAgorot,
      reference_agorot: referenceAgorot,
      note: parsed.data.note ?? null,
      created_by: session.userId,
    } as never)

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return { ok: false, error: 'תזמון מחירים עדיין לא זמין (מיגרציה 201).' }
    }
    if (error.code === '23505') {
      return { ok: false, error: 'כבר קיים שינוי מתוזמן למוצר הזה באותו מועד.' }
    }
    log.warn('admin.flash_deal_schedule_failed', { reason: error.message })
    return { ok: false, error: 'השמירה נכשלה.' }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'created',
    entityType: 'scheduled_price_change',
    entityId: parsed.data.productId,
    changes: {
      effective_at: when.toISOString(),
      price_agorot: priceAgorot,
      reference_agorot: referenceAgorot,
    },
  })

  revalidatePath('/admin/flash-deals')
  return { ok: true, message: 'השינוי תוזמן.' }
}

async function runCancel(id: string): Promise<FlashDealState> {
  const session = await requireSection('discounts', 'write')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'מזהה לא תקין.' }

  // Cancelled, never deleted: "we were going to run this and pulled it" is a
  // fact worth keeping next to the deal that did run, and a deleted row cannot
  // be told from one that never existed. The partial unique index is scoped to
  // uncancelled rows, so the slot is freed for a replacement.
  const { data, error } = await createAdminClient()
    .from('scheduled_price_changes' as never)
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: session.userId } as never)
    .eq('id', id)
    .is('applied_at', null)
    .is('cancelled_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    log.warn('admin.flash_deal_cancel_failed', { reason: error.message })
    return { ok: false, error: 'הביטול נכשל.' }
  }
  // Zero rows means it has already run or already been cancelled. Said plainly,
  // because "cancelled" about a deal that is live on the site would be the
  // worst possible answer.
  if (!data) return { ok: false, error: 'השינוי כבר הוחל או בוטל.' }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'deleted',
    entityType: 'scheduled_price_change',
    entityId: id,
  })

  revalidatePath('/admin/flash-deals')
  return { ok: true, message: 'השינוי בוטל.' }
}

export async function scheduleFlashDeal(
  _prev: FlashDealState,
  formData: FormData,
): Promise<FlashDealState> {
  return withActionContext('admin.flash_deals.schedule', () => runSchedule(formData))
}

export async function cancelFlashDeal(id: string): Promise<FlashDealState> {
  return withActionContext('admin.flash_deals.cancel', () => runCancel(id))
}
