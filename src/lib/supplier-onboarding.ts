/**
 * Supplier onboarding: application submission, Cardcom verification, email verification
 */

import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export interface SupplierApplicationInput {
  businessName: string
  phone: string
  email: string
  cardcomTerminalId: string
  cardNumber: string
  cardExpiry: string // MM/YY
  cardCvv: string
  agreementAccepted: boolean
}

export interface SupplierAgreement {
  id: string
  application_id: string
  cardcom_terminal_id: string
  agreement_version: string
  agreement_hash: string
  accepted_ip: string
  accepted_at: string
  verification_charge_id: string | null
  verification_amount: number
  verification_status: 'pending' | 'verified' | 'failed'
  email_verified_at: string | null
  verification_token: string | null
  created_at: string
  updated_at: string
}

const AGREEMENT_TEXT_V1 = `
תנאי שימוש ספק - Kenyon Express

1. הספק מאשר כי המידע שמסר נכון ומדויק
2. הספק מתחייב לספק מוצרים באיכות גבוהה
3. הספק מסכים לעמלת הפלטפורמה כפי שתוסכם
4. הספק מבין כי גישה למערכת תינתן רק לאחר אישור מנהל
5. הספק מתחייב לעדכן מלאי ומחירים באופן שוטף
`.trim()

const AGREEMENT_VERSION = 'v1.0'

function hashAgreementText(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

async function getClientIP(): Promise<string> {
  const headersList = await headers()
  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    '127.0.0.1'
  )
}

/**
 * Submit supplier application with click-wrap agreement and card verification
 */
export async function submitSupplierApplication(
  input: SupplierApplicationInput,
): Promise<{ success: boolean; applicationId?: string; error?: string }> {
  try {
    const supabase = await createClient()

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return { success: false, error: 'יש להתחבר כדי להגיש בקשה' }
    }

    // Check if user already has a pending application
    const { data: existingApp } = await supabase
      .from('supplier_applications')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single()

    if (existingApp) {
      return { success: false, error: 'כבר קיימת בקשה ממתינה עבור משתמש זה' }
    }

    // Validate agreement acceptance
    if (!input.agreementAccepted) {
      return { success: false, error: 'יש לאשר את תנאי השימוש' }
    }

    // Create supplier application
    const { data: application, error: appError } = await supabase
      .from('supplier_applications')
      .insert({
        user_id: user.id,
        business_name: input.businessName,
        contact_name: input.businessName, // Same for now
        contact_email: input.email,
        contact_phone: input.phone,
        business_id: '', // Will be filled later by admin or in form
        status: 'pending',
      })
      .select()
      .single()

    if (appError || !application) {
      console.error('Failed to create application:', appError)
      return { success: false, error: 'שגיאה ביצירת בקשה' }
    }

    // Card verification - for now, we'll mark as pending and admin will verify manually
    // TODO: Implement actual Cardcom 1 ILS charge verification
    const chargeId: string | null = null
    const verificationStatus: 'pending' | 'verified' | 'failed' = 'pending'

    // Get client IP
    const clientIP = await getClientIP()

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex')

    // Create agreement record
    const agreementHash = hashAgreementText(AGREEMENT_TEXT_V1)

    const admin = createAdminClient()
    const { error: agreementError } = await admin.from('supplier_agreements').insert({
      application_id: application.id,
      cardcom_terminal_id: input.cardcomTerminalId,
      agreement_version: AGREEMENT_VERSION,
      agreement_hash: agreementHash,
      accepted_ip: clientIP,
      verification_charge_id: chargeId,
      verification_status: verificationStatus,
      verification_token: verificationToken,
    })

    if (agreementError) {
      console.error('Failed to create agreement:', agreementError)
      // Don't fail - application was created
    }

    // TODO: Send verification email with token
    // await sendVerificationEmail(input.email, verificationToken)

    return { success: true, applicationId: application.id }
  } catch (error) {
    console.error('Supplier application error:', error)
    return { success: false, error: 'שגיאה בהגשת בקשה' }
  }
}

/**
 * Verify email with token
 */
export async function verifySupplierEmail(
  token: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = createAdminClient()

    const { data: agreement, error: fetchError } = await admin
      .from('supplier_agreements')
      .select('*')
      .eq('verification_token', token)
      .single()

    if (fetchError || !agreement) {
      return { success: false, error: 'קישור אימות לא תקין' }
    }

    if (agreement.email_verified_at) {
      return { success: false, error: 'האימייל כבר אומת' }
    }

    const { error: updateError } = await admin
      .from('supplier_agreements')
      .update({
        email_verified_at: new Date().toISOString(),
        verification_token: null, // Clear token after use
      })
      .eq('id', agreement.id)

    if (updateError) {
      console.error('Failed to verify email:', updateError)
      return { success: false, error: 'שגיאה באימות אימייל' }
    }

    return { success: true }
  } catch (error) {
    console.error('Email verification error:', error)
    return { success: false, error: 'שגיאה באימות אימייל' }
  }
}

/**
 * Get supplier application with agreement details (for admin review)
 */
export async function getSupplierApplicationDetails(applicationId: string) {
  const admin = createAdminClient()

  const [{ data: application }, { data: agreement }] = await Promise.all([
    admin
      .from('supplier_applications')
      .select('*, profiles:user_id(full_name, email)')
      .eq('id', applicationId)
      .single(),
    admin.from('supplier_agreements').select('*').eq('application_id', applicationId).single(),
  ])

  return { application, agreement }
}

/**
 * Get pending supplier applications for admin review
 */
export async function getPendingSupplierApplications() {
  const admin = createAdminClient()

  const { data: applications } = await admin
    .from('supplier_applications')
    .select('*, profiles:user_id(full_name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return applications ?? []
}

/**
 * Approve supplier application (creates supplier + grants access)
 */
export async function approveSupplierApplication(
  applicationId: string,
  _approvedBy: string,
): Promise<{ success: boolean; supplierId?: string; error?: string }> {
  try {
    const admin = createAdminClient()

    // Call the existing approve function from migration 027
    const { data, error } = await admin.rpc('approve_supplier_application', {
      p_application_id: applicationId,
    })

    if (error) {
      console.error('Failed to approve application:', error)
      return { success: false, error: 'שגיאה באישור בקשה' }
    }

    return { success: true, supplierId: data }
  } catch (error) {
    console.error('Approval error:', error)
    return { success: false, error: 'שגיאה באישור בקשה' }
  }
}

/**
 * Reject supplier application
 */
export async function rejectSupplierApplication(
  applicationId: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const admin = createAdminClient()

    // Call the existing reject function from migration 027
    const { error } = await admin.rpc('reject_supplier_application', {
      p_application_id: applicationId,
      p_reason: reason,
    })

    if (error) {
      console.error('Failed to reject application:', error)
      return { success: false, error: 'שגיאה בדחיית בקשה' }
    }

    return { success: true }
  } catch (error) {
    console.error('Rejection error:', error)
    return { success: false, error: 'שגיאה בדחיית בקשה' }
  }
}

export { AGREEMENT_TEXT_V1, AGREEMENT_VERSION }
