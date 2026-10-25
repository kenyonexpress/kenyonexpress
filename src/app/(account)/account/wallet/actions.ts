'use server'

import { createClient } from '@/lib/supabase/server'
import { createWithdrawalRequest } from '@/lib/wallet'
import { revalidatePath } from 'next/cache'

export async function requestWithdrawal(formData: FormData) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'נדרשת התחברות' }
  }

  const amountAgorot = Number(formData.get('amount_agorot'))
  const payoutMethod = formData.get('payout_method') as 'bank_transfer' | 'cardcom_refund'

  const accountNumber = formData.get('account_number')?.toString()
  const branchCode = formData.get('branch_code')?.toString()
  const referenceId = formData.get('reference_id')?.toString()

  const result = await createWithdrawalRequest({
    userId: user.id,
    amountAgorot,
    payoutMethod,
    bankDetails:
      payoutMethod === 'bank_transfer' && accountNumber && branchCode && referenceId
        ? {
            account_number: accountNumber,
            branch_code: branchCode,
            reference_id: referenceId,
          }
        : undefined,
  })

  if (result.success) {
    revalidatePath('/account/wallet')
  }

  return result
}
