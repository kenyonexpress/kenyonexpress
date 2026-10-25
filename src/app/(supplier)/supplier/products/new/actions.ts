'use server'

import { agorot } from '@/lib/commerce/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

interface SubmitProductInput {
  supplierId: string
  nameHe: string
  descriptionHe: string | null
  priceAgorot: number
  category: string | null
}

async function runSubmitProduct(
  input: SubmitProductInput,
): Promise<{ success: boolean; productId?: string; error?: string }> {
  try {
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'יש להתחבר' }
    }

    // Verify user is member of this supplier
    const { data: membership, error: membershipError } = await supabase
      .from('supplier_members')
      .select('id')
      .eq('supplier_id', input.supplierId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (membershipError && membershipError.code !== 'PGRST116') {
      log.error('supplier_membership_lookup_failed', { err: membershipError })
      return { success: false, error: 'שגיאה ביצירת מוצר' }
    }

    if (!membership) {
      return { success: false, error: 'אין הרשאה ליצור מוצרים עבור ספק זה' }
    }

    // Create product with pending approval status
    const admin = createAdminClient()
    const { data: product, error: productError } = await admin
      .from('products')
      .insert({
        supplier_id: input.supplierId,
        name_he: input.nameHe,
        description_he: input.descriptionHe,
        price_ils: agorot(input.priceAgorot),
        product_type: 'physical',
        approval_status: 'pending_approval', // Requires admin approval
        status: 'draft', // Not published until approved
        platform_percent: 10, // Default commission
      })
      .select('id')
      .single()

    if (productError || !product) {
      log.error('failed_to_create_product', { err: productError })
      return { success: false, error: 'שגיאה ביצירת מוצר' }
    }

    return { success: true, productId: product.id }
  } catch (error) {
    log.error('product_submission_error', { err: error })
    return { success: false, error: 'שגיאה ביצירת מוצר' }
  }
}

export async function submitProduct(
  input: SubmitProductInput,
): Promise<{ success: boolean; productId?: string; error?: string }> {
  return withActionContext('supplier.products.submit', () => runSubmitProduct(input))
}
