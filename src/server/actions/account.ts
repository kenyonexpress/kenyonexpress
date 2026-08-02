'use server'

import { createClient } from '@/lib/supabase/server'
import {
  type AccountActionState,
  addressSchema,
  idSchema,
  profileDetailsSchema,
} from '@/lib/validations/account'
import { revalidatePath } from 'next/cache'

/**
 * Account mutations.
 *
 * Every write goes through the request-scoped client so RLS decides ownership.
 * None of these touch the wallet: the ledger has no write policy for any role
 * by design, and money only moves through fn_wallet_transfer under the service
 * role in the payment webhook.
 */

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return s === '' ? null : s
}

export async function updateProfileDetails(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = profileDetailsSchema.safeParse({
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'הפרטים אינם תקינים' }
  }

  const supabase = await createClient()
  // The profiles UPDATE policy freezes `role`, so a client cannot escalate here.
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.full_name, phone: parsed.data.phone })
    .eq('id', userId)

  if (error) return { error: 'שמירת הפרטים נכשלה' }

  revalidatePath('/account/details')
  revalidatePath('/account')
  return { success: 'הפרטים נשמרו' }
}

export async function saveAddress(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const rawId = formData.get('id')
  const parsed = addressSchema.safeParse({
    id: typeof rawId === 'string' && rawId !== '' ? rawId : undefined,
    full_name: formData.get('full_name'),
    phone: formData.get('phone'),
    street: formData.get('street'),
    street_number: formData.get('street_number') ?? '',
    apartment: formData.get('apartment') ?? '',
    entrance: formData.get('entrance') ?? '',
    floor: formData.get('floor') ?? '',
    city: formData.get('city'),
    zip: formData.get('zip') ?? '',
    notes_for_courier: formData.get('notes_for_courier') ?? '',
    is_default: formData.get('is_default') === 'on',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'הכתובת אינה תקינה' }
  }

  const supabase = await createClient()
  const row = {
    user_id: userId,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone,
    street: parsed.data.street,
    street_number: emptyToNull(formData.get('street_number')),
    apartment: emptyToNull(formData.get('apartment')),
    entrance: emptyToNull(formData.get('entrance')),
    floor: emptyToNull(formData.get('floor')),
    city: parsed.data.city,
    zip: emptyToNull(formData.get('zip')),
    notes_for_courier: emptyToNull(formData.get('notes_for_courier')),
    is_default: parsed.data.is_default ?? false,
  }

  // Only one default may exist. Clear the flag first so the write below cannot
  // leave two rows marked default if it lands between the two statements.
  if (row.is_default) {
    await supabase
      .from('user_addresses')
      .update({ is_default: false })
      .eq('user_id', userId)
      .is('deleted_at', null)
  }

  const { error } = parsed.data.id
    ? await supabase.from('user_addresses').update(row).eq('id', parsed.data.id)
    : await supabase.from('user_addresses').insert(row)

  if (error) return { error: 'שמירת הכתובת נכשלה' }

  revalidatePath('/account/addresses')
  return { success: parsed.data.id ? 'הכתובת עודכנה' : 'הכתובת נוספה' }
}

export async function deleteAddress(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = idSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'מזהה כתובת לא תקין' }

  const supabase = await createClient()
  // Soft delete: orders reference address_id and must keep resolving.
  const { error } = await supabase
    .from('user_addresses')
    .update({ is_default: false, deleted_at: new Date().toISOString() })
    .eq('id', parsed.data.id)

  if (error) return { error: 'מחיקת הכתובת נכשלה' }

  revalidatePath('/account/addresses')
  return { success: 'הכתובת נמחקה' }
}

export async function setDefaultAddress(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = idSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'מזהה כתובת לא תקין' }

  const supabase = await createClient()
  await supabase
    .from('user_addresses')
    .update({ is_default: false })
    .eq('user_id', userId)
    .is('deleted_at', null)

  const { error } = await supabase
    .from('user_addresses')
    .update({ is_default: true })
    .eq('id', parsed.data.id)

  if (error) return { error: 'עדכון ברירת המחדל נכשל' }

  revalidatePath('/account/addresses')
  return { success: 'הכתובת נקבעה כברירת מחדל' }
}

export async function deletePaymentToken(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = idSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'מזהה כרטיס לא תקין' }

  // Enabled by the payment_tokens_owner_delete policy added in 052.
  const supabase = await createClient()
  const { error } = await supabase.from('payment_tokens').delete().eq('id', parsed.data.id)

  if (error) return { error: 'מחיקת הכרטיס נכשלה' }

  revalidatePath('/account/tokens')
  return { success: 'הכרטיס הוסר' }
}

export async function setDefaultPaymentToken(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  if (!userId) return { error: 'יש להתחבר' }

  const parsed = idSchema.safeParse({ id: formData.get('id') })
  if (!parsed.success) return { error: 'מזהה כרטיס לא תקין' }

  const supabase = await createClient()
  await supabase.from('payment_tokens').update({ is_default: false }).eq('profile_id', userId)

  const { error } = await supabase
    .from('payment_tokens')
    .update({ is_default: true })
    .eq('id', parsed.data.id)

  if (error) return { error: 'עדכון ברירת המחדל נכשל' }

  revalidatePath('/account/tokens')
  return { success: 'הכרטיס נקבע כברירת מחדל' }
}
