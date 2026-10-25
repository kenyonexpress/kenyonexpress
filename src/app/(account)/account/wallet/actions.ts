'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { createClient } from '@/lib/supabase/server'
import { createWithdrawalRequest } from '@/lib/wallet'
import { revalidatePath } from 'next/cache'

async function runRequestWithdrawal(formData: FormData) {
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
  const paymentMethodId = formData.get('payment_method_id')?.toString()

  if (payoutMethod === 'cardcom_refund') {
    // The id comes from the browser, so it must name one of this user's own cards.
    const { data: ownCard, error: cardError } = await supabase
      .from('saved_payment_methods')
      .select('id')
      .eq('id', paymentMethodId ?? '')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (cardError || !ownCard) {
      return { success: false, error: 'אמצעי תשלום לא נמצא' }
    }
  }

  const result = await createWithdrawalRequest({
    userId: user.id,
    amountAgorot,
    payoutMethod,
    cardcomTokenId: payoutMethod === 'cardcom_refund' ? paymentMethodId : undefined,
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

export async function requestWithdrawal(formData: FormData) {
  return withActionContext('account.wallet.request_withdrawal', () =>
    runRequestWithdrawal(formData),
  )
}
