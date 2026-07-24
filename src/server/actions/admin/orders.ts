'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { type AdminSessionInfo, requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export type OrderActionState = { error: string } | { success: string } | null

const cancelSchema = z.object({
  id: z.string().uuid({ message: 'מזהה הזמנה לא תקין' }),
  reason: z
    .string()
    .trim()
    .min(3, 'חובה לציין סיבת ביטול (לפחות 3 תווים)')
    .max(500, 'סיבת הביטול ארוכה מדי'),
})

// F2: order status is owned by the payment/fulfillment flow (webhooks,
// finalize, redemption). The ONLY manual admin transition is
// pending -> cancelled, with a mandatory reason and an audit row.
// Refunds of paid orders belong to the refund console (037, not built yet).
export async function cancelPendingOrder(
  _: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  let session: AdminSessionInfo
  try {
    session = await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const parsed = cancelSchema.safeParse({
    id: formData.get('id'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'קלט לא תקין' }
  }

  const supabase = await createClient()
  const { data: order } = await supabase
    .from('orders')
    .select('id, status, notes')
    .eq('id', parsed.data.id)
    .single()

  if (!order) return { error: 'הזמנה לא נמצאה' }
  if (order.status !== 'pending') {
    return {
      error:
        order.status === 'paid'
          ? 'הזמנה ששולמה אינה מבוטלת ידנית; החזר כספי מתבצע דרך מסלול ההחזרים'
          : 'רק הזמנה בסטטוס ממתין ניתנת לביטול ידני',
    }
  }

  const cancelNote = `ביטול אדמין: ${parsed.data.reason}`
  const { error } = await supabase
    .from('orders')
    .update({
      status: 'cancelled',
      notes: order.notes ? `${order.notes}\n${cancelNote}` : cancelNote,
    })
    .eq('id', parsed.data.id)
    .eq('status', 'pending')

  if (error) return { error: error.message }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'status_change',
    entityType: 'orders',
    entityId: parsed.data.id,
    changes: { status: { from: 'pending', to: 'cancelled' } },
    metadata: { reason: parsed.data.reason },
  })

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${parsed.data.id}`)
  return { success: 'ההזמנה בוטלה' }
}
