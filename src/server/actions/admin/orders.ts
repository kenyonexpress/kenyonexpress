'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const statusSchema = z.enum([
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
])

export type OrderActionState = { error: string } | { success: string } | null

export async function updateOrderStatus(
  _: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const id = formData.get('id') as string
  const parsed = statusSchema.safeParse(formData.get('status'))
  if (!parsed.success) return { error: 'סטטוס לא תקין' }

  const supabase = await createClient()
  const { error } = await supabase.from('orders').update({ status: parsed.data }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${id}`)
  return { success: 'סטטוס הזמנה עודכן' }
}
