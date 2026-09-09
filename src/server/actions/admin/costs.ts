'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireSection } from '@/lib/admin/rbac'
import { toMicro } from '@/lib/costs/model'
import { providerById } from '@/lib/costs/providers'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Recording what a provider charged, by hand, because nothing can fetch it.
 *
 * See `src/lib/costs/providers.ts`: not one billing credential exists in this
 * project, so this action is the ONLY writer of `infra_costs` today. When a
 * pull is built it writes the same rows with `source = 'api'`, and the two are
 * kept apart deliberately -- a typed figure is a recollection and a fetched one
 * is a measurement, and a report that blends them without saying so is the
 * less useful for it.
 *
 * THE AMOUNT IS PARSED AS DIGITS, NOT AS A FLOAT. `parseFloat('20.10') * 1e6`
 * is 20099999.999999996. Multiplying money by a million through binary floating
 * point is precisely the mistake `price_micro` exists to avoid, and doing it
 * here would put the error into the column that was chosen to prevent it.
 */

type ActionResult = { error?: string; success?: string }

const costSchema = z.object({
  provider: z.string().trim().min(1, 'ספק נדרש'),
  // YYYY-MM-01. The page supplies it; a free month string would let a figure
  // land on a day rather than a month.
  month: z.string().regex(/^\d{4}-\d{2}-01$/, 'חודש לא תקין'),
  kind: z.enum(['fixed', 'variable']),
  // Digits with up to six decimals. The regex IS the validation: anything it
  // accepts, `toMicro` converts exactly.
  amount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,6})?$/, 'סכום לא תקין: מספר חיובי, עד שש ספרות אחרי הנקודה'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'מטבע לא תקין'),
  note: z.string().trim().max(500).optional(),
})

async function runSaveInfraCost(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireSection('payments', 'write')

  const parsed = costSchema.safeParse({
    provider: formData.get('provider'),
    month: formData.get('month'),
    kind: formData.get('kind'),
    amount: formData.get('amount'),
    currency: formData.get('currency') ?? 'USD',
    note: formData.get('note') ?? undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  // Checked against the registry rather than trusted from the form: the
  // provider column carries a CHECK constraint, and a value that fails it comes
  // back as a 23514 that says nothing useful to an operator.
  if (!providerById(parsed.data.provider)) return { error: 'ספק לא מוכר' }

  const micro = toMicro(parsed.data.amount)
  if (micro === null) return { error: 'סכום לא תקין' }

  const admin = createAdminClient()
  const { error } = await admin.from('infra_costs' as never).upsert(
    {
      provider: parsed.data.provider,
      month: parsed.data.month,
      kind: parsed.data.kind,
      amount_micro: micro,
      currency: parsed.data.currency,
      source: 'manual',
      note: parsed.data.note ?? null,
    } as never,
    // Correcting a figure must UPDATE it. Without this, a second entry for the
    // same provider and month silently doubles that month's spend, and the
    // budget alert fires on a number nobody entered.
    { onConflict: 'provider,month,kind' },
  )

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return { error: 'טבלת העלויות עדיין לא הוחלה (מיגרציה 219)' }
    }
    log.error('costs.save_failed', { reason: error.message })
    return { error: 'השמירה נכשלה' }
  }

  await writeAuditLog({
    // `manual_override` and not `updated`, because that is exactly what this
    // is: a figure a person read off a vendor dashboard and typed in, standing
    // in for a measurement nothing here can take. The audit trail should say
    // which of the two it was.
    action: 'manual_override',
    entityType: 'infra_costs',
    entityId: `${parsed.data.provider}:${parsed.data.month}:${parsed.data.kind}`,
    actorId: session.userId,
    actorRole: session.role,
    metadata: { amount_micro: micro, currency: parsed.data.currency, source: 'manual' },
  })

  revalidatePath('/admin/billing')
  return { success: 'הסכום נשמר' }
}

const budgetSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/, 'חודש לא תקין'),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d{1,6})?$/, 'סכום לא תקין'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'מטבע לא תקין'),
})

async function runSaveInfraBudget(_: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireSection('payments', 'write')

  const parsed = budgetSchema.safeParse({
    month: formData.get('month'),
    amount: formData.get('amount'),
    currency: formData.get('currency') ?? 'USD',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'נתונים לא תקינים' }

  const micro = toMicro(parsed.data.amount)
  if (micro === null) return { error: 'סכום לא תקין' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('infra_budgets' as never)
    .upsert(
      { month: parsed.data.month, amount_micro: micro, currency: parsed.data.currency } as never,
      { onConflict: 'month' },
    )

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return { error: 'טבלת התקציב עדיין לא הוחלה (מיגרציה 219)' }
    }
    log.error('costs.budget_save_failed', { reason: error.message })
    return { error: 'השמירה נכשלה' }
  }

  await writeAuditLog({
    action: 'manual_override',
    entityType: 'infra_budgets',
    entityId: parsed.data.month,
    actorId: session.userId,
    actorRole: session.role,
    metadata: { amount_micro: micro, currency: parsed.data.currency },
  })

  revalidatePath('/admin/billing')
  return { success: 'התקציב נשמר' }
}

export async function saveInfraCost(prev: ActionResult, formData: FormData): Promise<ActionResult> {
  return withActionContext('admin.costs.save', () => runSaveInfraCost(prev, formData))
}

export async function saveInfraBudget(
  prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return withActionContext('admin.costs.budget', () => runSaveInfraBudget(prev, formData))
}
