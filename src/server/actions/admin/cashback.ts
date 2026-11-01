'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireSection } from '@/lib/admin/rbac'
import { agorot, formatAgorot, parseIls } from '@/lib/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Admin cashback adjustments.
 *
 * A thin wrapper over `fn_cashback_admin_adjust` (migration 177), on purpose:
 * the money rules (signed integer agorot, the reserve account on the other
 * leg of every movement, the clawback refusing when the balance is already
 * spent, the append-only ledger row) live in the function, which is SECURITY
 * DEFINER and re-checks is_admin() itself. The requireSection guard here is
 * defence in depth rather than the only gate, same stance as the payout RPCs.
 *
 * THE AUDIT TRAIL IS TWO LAYERS. The ledger row itself is the primary record
 * (append-only, carries actor, reason, amount and the wallet entry it moved),
 * and writeAuditLog adds the app-side audit_log row every admin mutation
 * writes, with IP, user agent and request id. Neither replaces the other.
 */

type ActionResult = { error?: string; success?: string }

const adjustSchema = z.object({
  email: z.string().trim().toLowerCase().email('כתובת אימייל לא תקינה'),
  amountIls: z
    .string()
    .trim()
    .regex(/^-?\d+(?:\.\d{1,2})?$/, 'סכום לא תקין: מספר בשקלים, עד שתי ספרות אחרי הנקודה'),
  reason: z.string().trim().min(3, 'נדרש נימוק (לפחות 3 תווים)').max(500, 'נימוק ארוך מדי'),
  // Minted once per form render, so a double click is one movement, not two.
  idempotencyKey: z.string().uuid('מפתח בקשה לא תקין'),
})

const UNDEFINED_FUNCTION = '42883'
const UNDEFINED_TABLE = '42P01'

const NOT_INSTALLED =
  'יומן הקאשבק אינו מותקן בבסיס הנתונים הזה: מיגרציה 177 טרם הוחלה, ולכן ' +
  'הפונקציה fn_cashback_admin_adjust והטבלה cashback_ledger אינן קיימות עדיין.'

function readableError(message: string): string {
  if (message.includes('admin only')) return 'אין הרשאה'
  if (message.includes('unknown user')) return 'לא נמצא משתמש עם הכתובת הזו'
  if (message.includes('insufficient') || message.includes('nonneg')) {
    return 'אי אפשר לקזז: היתרה בארנק הלקוח נמוכה מסכום הקיזוז.'
  }
  return message
}

async function guard(): Promise<AdminSessionInfo | null> {
  try {
    return await requireSection('payments', 'write')
  } catch {
    return null
  }
}

async function runAdjustCashback(input: {
  email: string
  amountIls: string
  reason: string
  idempotencyKey: string
}): Promise<ActionResult> {
  const session = await guard()
  if (!session) return { error: 'אין הרשאה' }

  const parsed = adjustSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  }

  let amountAgorot: number
  try {
    amountAgorot = parseIls(parsed.data.amountIls)
  } catch {
    return { error: 'סכום לא תקין' }
  }
  if (amountAgorot === 0) return { error: 'הסכום חייב להיות שונה מאפס' }

  // Email -> profile id through the admin client: profiles RLS hides other
  // users from the session client, and an admin adjusting cashback is exactly
  // the case it hides them from.
  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email')
    .eq('email', parsed.data.email)
    .maybeSingle()
  if (profileError) {
    log.error('cashback.adjust_profile_read_failed', { reason: profileError.message })
    return { error: 'קריאת המשתמש נכשלה, נסה שוב' }
  }
  if (!profile) return { error: 'לא נמצא משתמש עם הכתובת הזו' }

  // The RPC runs on the SESSION client, not the admin one: fn_cashback_admin_adjust
  // records auth.uid() as created_by, and the service role has no uid.
  const supabase = await createClient()
  const { data: ledgerId, error } = await supabase.rpc('fn_cashback_admin_adjust' as never, {
    p_user_id: profile.id,
    p_amount_agorot: amountAgorot,
    p_reason: parsed.data.reason,
    p_idempotency: parsed.data.idempotencyKey,
  })
  if (error) {
    if (error.code === UNDEFINED_FUNCTION || error.code === UNDEFINED_TABLE) {
      log.error('cashback.not_installed', { code: error.code, reason: error.message })
      return { error: NOT_INSTALLED }
    }
    return { error: readableError(error.message) }
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'cashback_ledger',
    entityId: typeof ledgerId === 'string' ? ledgerId : undefined,
    metadata: {
      user_id: profile.id,
      user_email: profile.email,
      amount_agorot: amountAgorot,
      reason: parsed.data.reason,
    },
  })

  revalidatePath('/admin/cashback')

  const direction = amountAgorot > 0 ? 'זוכה' : 'קוזז'
  return {
    success: `בוצע: ${direction} ${formatAgorot(agorot(Math.abs(amountAgorot)))} עבור ${profile.email}`,
  }
}

export async function adjustCashback(input: {
  email: string
  amountIls: string
  reason: string
  idempotencyKey: string
}): Promise<ActionResult> {
  return withActionContext('admin.cashback.adjust', () => runAdjustCashback(input))
}
