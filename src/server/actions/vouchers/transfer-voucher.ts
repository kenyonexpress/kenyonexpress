'use server'

import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { normaliseTransferEmail } from '@/lib/vouchers/transfer'
import { revalidatePath } from 'next/cache'

export type TransferVoucherOutcome = { ok: true } | { ok: false; error: string }

/**
 * Hand an unused coupon to another registered customer. Ownership moves in one
 * database function under a row lock; the caller's identity comes from the
 * session, never from the arguments. The recipient lookup answers the same way
 * whether or not the address is registered, so this cannot be used to probe
 * which emails have accounts.
 */
export async function transferVoucher(input: {
  voucherId: string
  email: string
}): Promise<TransferVoucherOutcome> {
  const email = normaliseTransferEmail(input.email)
  if (!email) return { ok: false, error: 'כתובת האימייל אינה תקינה.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר כדי להעביר קופון.' }

  if (!(await checkRateLimit(`voucher-transfer:${user.id}`, 10, 3600)))
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }

  const generic = { ok: false, error: 'לא ניתן להעביר את הקופון לכתובת הזו.' } as const

  const admin = createAdminClient()
  const { data: recipient, error: lookupError } = await admin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (lookupError) {
    log.error('voucher_transfer_lookup_failed', { message: lookupError.message })
    return { ok: false, error: 'אירעה שגיאה. נסו שוב.' }
  }
  if (!recipient || recipient.id === user.id) return generic

  const { data, error } = await admin.rpc('transfer_voucher', {
    p_voucher_id: input.voucherId,
    p_from: user.id,
    p_to: recipient.id,
  })
  if (error) {
    log.error('voucher_transfer_failed', { message: error.message })
    return { ok: false, error: 'אירעה שגיאה. נסו שוב.' }
  }
  if (data !== 'ok') return generic

  revalidatePath('/account/coupons')
  return { ok: true }
}
