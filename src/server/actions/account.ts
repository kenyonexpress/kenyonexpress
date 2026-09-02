'use server'

import { createHash } from 'node:crypto'
import { planAccountDeletion } from '@/lib/account/delete-account'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  type AccountActionState,
  addressSchema,
  idSchema,
  profileDetailsSchema,
} from '@/lib/validations/account'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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

async function runUpdateProfileDetails(
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

async function runSaveAddress(
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

async function runDeleteAddress(
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

async function runSetDefaultAddress(
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

async function runDeletePaymentToken(
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

async function runSetDefaultPaymentToken(
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

export async function updateProfileDetails(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.update_profile', () => runUpdateProfileDetails(_prev, formData))
}

export async function saveAddress(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.save_address', () => runSaveAddress(_prev, formData))
}

export async function deleteAddress(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.delete_address', () => runDeleteAddress(_prev, formData))
}

export async function setDefaultAddress(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.set_default_address', () =>
    runSetDefaultAddress(_prev, formData),
  )
}

export async function deletePaymentToken(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.delete_payment_token', () =>
    runDeletePaymentToken(_prev, formData),
  )
}

export async function setDefaultPaymentToken(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.set_default_payment_token', () =>
    runSetDefaultPaymentToken(_prev, formData),
  )
}

async function runDeleteAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const userId = await requireUserId()
  const plan = planAccountDeletion({ userId, confirmation: formData.get('confirm') })
  if (!plan.ok) return { error: plan.message }

  const admin = createAdminClient()

  // The goodbye email needs the address BEFORE it is hashed away. Read it now;
  // enqueue at the end, so a failure to anonymize does not mail a goodbye for
  // an account that still exists.
  const { data: profile, error: emailReadError } = await admin
    .from('profiles')
    .select('email')
    .eq('id', plan.userId)
    .maybeSingle()
  if (emailReadError) {
    // The deletion does not depend on this read; only the goodbye email does,
    // and that ships with migration 150. Logged so the absence has a cause.
    log.warn('account.delete_email_read_failed', { reason: emailReadError.message })
  }
  const emailBefore = profile?.email ?? null

  // THE ERASURE. `fn_anonymize_user` (migration 150) is the atomic version:
  // one definer function, satellites and profile in one transaction. Until 150
  // is applied the RPC does not exist (42883), and a privacy right the law
  // gives cannot wait on a migration queue -- so the same steps run through
  // the service client, in the same order, non-atomically. The fallback is
  // idempotent for the same reason the function is: the email hash is derived
  // from the id, so a retry after a partial failure converges instead of
  // stacking.
  const rpc = await admin.rpc('fn_anonymize_user', { p_user_id: plan.userId })
  if (rpc.error) {
    const missing = rpc.error.code === 'PGRST202' || /fn_anonymize_user/.test(rpc.error.message)
    if (!missing) {
      log.error('account.delete_failed', { userId: plan.userId, reason: rpc.error.message })
      return { error: 'מחיקת החשבון נכשלה. פנו לתמיכה.' }
    }
    log.warn('account.delete_fallback_no_rpc', { userId: plan.userId })
    const hashed = anonymizedEmail(plan.userId)
    for (const [table, column] of [
      ['user_recent_searches', 'user_id'],
      ['push_tokens', 'user_id'],
      ['user_addresses', 'user_id'],
      ['payment_tokens', 'profile_id'],
      ['carts', 'profile_id'],
    ] as const) {
      const { error } = await admin.from(table).delete().eq(column, plan.userId)
      if (error) {
        log.error('account.delete_satellite_failed', { table, reason: error.message })
        return { error: 'מחיקת החשבון נכשלה באמצע. פנו לתמיכה.' }
      }
    }
    const { error: profileError } = await admin
      .from('profiles')
      .update({ email: hashed, full_name: 'משתמש שנמחק', phone: null })
      .eq('id', plan.userId)
    if (profileError) {
      log.error('account.delete_profile_failed', { reason: profileError.message })
      return { error: 'מחיקת החשבון נכשלה באמצע. פנו לתמיכה.' }
    }
  }

  // Login dies AFTER the data is gone: an account that cannot log in but still
  // holds personal data is the failure mode the law cares about, so the order
  // is data first, access second. SOFT delete, and that is load-bearing --
  // auth.users cascades to profiles, and a hard delete would take the
  // anonymized profile and orphan every order pointing at it.
  const { error: authError } = await admin.auth.admin.deleteUser(plan.userId, true)
  if (authError) {
    log.error('account.delete_auth_failed', { userId: plan.userId, reason: authError.message })
    return { error: 'הנתונים נמחקו אך ההתנתקות נכשלה. פנו לתמיכה.' }
  }

  // NO GOODBYE EMAIL YET, DELIBERATELY. The first draft enqueued an
  // 'account_deleted' notification best-effort, and the outbox-kinds guard
  // test refused it: the LIVE `notification_outbox_kind_check` does not carry
  // that kind until migration 150 applies, so every enqueue would 23514 -- the
  // exact silently-dead-notification pattern that killed five kinds before
  // 2026-08-19 and that the guard exists to block. The email read above stays,
  // so the day 150 applies the enqueue can be added here with the address
  // still reachable. `emailBefore` is referenced below to keep that intent
  // visible rather than dead.
  void emailBefore

  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/?account=deleted')
}

/**
 * The anonymized address, byte-identical to the one `fn_anonymize_user`
 * derives (`'deleted+' || substr(md5(id::text), 1, 16) || '@anonymized.invalid'`).
 * Identical on purpose: if this fallback ran before migration 150 and the
 * function runs after it, the second write converges on the same value instead
 * of re-anonymizing an already-anonymized row to something new.
 *
 * node:crypto rather than WebCrypto because `crypto.subtle` has no MD5 at all
 * -- the first draft called `subtle.digest('MD5', ...)`, which rejects on every
 * runtime, so its "fallback" SHA path was actually the only path and diverged
 * from the SQL. MD5 is fine here: this derives a stable pseudonym from a uuid,
 * it protects nothing.
 */
function anonymizedEmail(userId: string): string {
  const hex = createHash('md5').update(userId).digest('hex')
  return `deleted+${hex.slice(0, 16)}@anonymized.invalid`
}

export async function deleteAccount(
  _prev: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  return withActionContext('account.delete_account', () => runDeleteAccount(_prev, formData))
}
