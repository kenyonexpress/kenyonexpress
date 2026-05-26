'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const statusSchema = z.enum(['pending', 'active', 'suspended'])
const commissionSchema = z.coerce
  .number()
  .min(0, 'עמלה לא יכולה להיות שלילית')
  .max(100, 'עמלה לא יכולה לעלות על 100%')

export type VendorActionState = { error: string } | { success: string } | null

export async function updateVendorStatus(
  _: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const id = formData.get('id') as string
  const parsed = statusSchema.safeParse(formData.get('status'))
  if (!parsed.success) return { error: 'סטטוס לא תקין' }

  const supabase = await createClient()
  const { error } = await supabase.from('vendors').update({ status: parsed.data }).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/vendors')
  revalidatePath(`/admin/vendors/${id}`)
  return { success: 'סטטוס עודכן בהצלחה' }
}

export async function updateVendorCommission(
  _: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  try {
    await requireAdminSession()
  } catch {
    return { error: 'אין הרשאה' }
  }

  const id = formData.get('id') as string
  const parsed = commissionSchema.safeParse(formData.get('commission_rate'))
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'עמלה לא תקינה' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('vendors')
    .update({ commission_rate: parsed.data })
    .eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/admin/vendors')
  revalidatePath(`/admin/vendors/${id}`)
  return { success: 'עמלה עודכנה בהצלחה' }
}
