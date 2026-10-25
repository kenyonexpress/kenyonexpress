'use server'

import { agorot } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

interface SubmitProductInput {
  supplierId: string
  nameHe: string
  descriptionHe: string | null
  priceAgorot: number
  category: string | null
}

export async function submitProduct(
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
    const { data: membership } = await supabase
      .from('supplier_members')
      .select('id')
      .eq('supplier_id', input.supplierId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

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
      console.error('Failed to create product:', productError)
      return { success: false, error: 'שגיאה ביצירת מוצר' }
    }

    return { success: true, productId: product.id }
  } catch (error) {
    console.error('Product submission error:', error)
    return { success: false, error: 'שגיאה ביצירת מוצר' }
  }
}
