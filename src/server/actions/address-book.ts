'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const phoneSchema = z
  .string()
  .trim()
  .min(10, 'מספר טלפון קצר מדי')
  .max(15, 'מספר טלפון ארוך מדי')
  .regex(/^\+?[0-9]{10,15}$/, 'מספר טלפון לא תקין')

const addressBookSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, 'יש להזין תווית').max(50, 'התווית ארוכה מדי'),
  full_name: z.string().trim().min(2, 'יש להזין שם מלא').max(100, 'השם ארוך מדי'),
  phone: phoneSchema,
  street: z.string().trim().min(1, 'יש להזין כתובת').max(200, 'הכתובת ארוכה מדי'),
  city: z.string().trim().min(1, 'יש להזין עיר').max(100, 'העיר ארוכה מדי'),
  postal_code: z.string().trim().max(20).optional().nullable(),
  country: z.string().length(2).default('IL'),
  is_default: z.coerce.boolean().default(false),
})

export type AddressBookInput = z.infer<typeof addressBookSchema>

export type AddressBookActionState = { error: string } | { success: string } | null

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

async function runSaveAddressBook(
  _prev: AddressBookActionState,
  formData: FormData,
): Promise<AddressBookActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const rawId = formData.get('id')
  const parsed = addressBookSchema.safeParse({
    id: typeof rawId === 'string' && rawId !== '' ? rawId : undefined,
    label: formData.get('label'),
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    street: formData.get('street'),
    city: formData.get('city'),
    postal_code: formData.get('postal_code') || null,
    country: formData.get('country') || 'IL',
    is_default: formData.get('is_default') === 'on' || formData.get('is_default') === 'true',
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'הכתובת אינה תקינה' }
  }

  const supabase = await createClient()
  const row = {
    user_id: userId,
    label: parsed.data.label,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone,
    street: parsed.data.street,
    city: parsed.data.city,
    postal_code: parsed.data.postal_code,
    country: parsed.data.country,
    is_default: parsed.data.is_default,
    updated_at: new Date().toISOString(),
  }

  const { error } = parsed.data.id
    ? await supabase.from('address_book').update(row).eq('id', parsed.data.id)
    : await supabase.from('address_book').insert(row)

  if (error) {
    return { error: 'שמירת הכתובת נכשלה' }
  }

  revalidatePath('/account/addresses')
  revalidatePath('/checkout')
  return { success: parsed.data.id ? 'הכתובת עודכנה' : 'הכתובת נוספה' }
}

async function runDeleteAddressBook(
  _prev: AddressBookActionState,
  formData: FormData,
): Promise<AddressBookActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const id = formData.get('id')
  if (typeof id !== 'string' || !id) return { error: 'מזהה כתובת לא תקין' }

  const supabase = await createClient()
  const { error } = await supabase.from('address_book').delete().eq('id', id).eq('user_id', userId)

  if (error) {
    return { error: 'מחיקת הכתובת נכשלה' }
  }

  revalidatePath('/account/addresses')
  revalidatePath('/checkout')
  return { success: 'הכתובת נמחקה' }
}

async function runSetDefaultAddressBook(
  _prev: AddressBookActionState,
  formData: FormData,
): Promise<AddressBookActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const id = formData.get('id')
  if (typeof id !== 'string' || !id) return { error: 'מזהה כתובת לא תקין' }

  const supabase = await createClient()

  // Unset all defaults first
  await supabase.from('address_book').update({ is_default: false }).eq('user_id', userId)

  // Set the new default
  const { error } = await supabase.from('address_book').update({ is_default: true }).eq('id', id)

  if (error) {
    return { error: 'עדכון ברירת המחדל נכשל' }
  }

  revalidatePath('/account/addresses')
  revalidatePath('/checkout')
  return { success: 'הכתובת נקבעה כברירת מחדל' }
}

export async function saveAddressBook(
  _prev: AddressBookActionState,
  formData: FormData,
): Promise<AddressBookActionState> {
  return withActionContext('address_book.save', () => runSaveAddressBook(_prev, formData))
}

export async function deleteAddressBook(
  _prev: AddressBookActionState,
  formData: FormData,
): Promise<AddressBookActionState> {
  return withActionContext('address_book.delete', () => runDeleteAddressBook(_prev, formData))
}

export async function setDefaultAddressBook(
  _prev: AddressBookActionState,
  formData: FormData,
): Promise<AddressBookActionState> {
  return withActionContext('address_book.set_default', () =>
    runSetDefaultAddressBook(_prev, formData),
  )
}
