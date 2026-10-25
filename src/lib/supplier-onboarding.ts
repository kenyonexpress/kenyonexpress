/**
 * Supplier onboarding: application submission, Cardcom verification, email verification
 */

import crypto from 'node:crypto'
import { agorot } from '@/lib/commerce/money'
import { sendBuiltEmail } from '@/lib/email/templates'
import { buildSupplierVerificationEmail } from '@/lib/email/templates/supplier-verification'
import { log } from '@/lib/observability/log'
import { CardcomProvider } from '@/lib/payments/cardcom'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export interface SupplierApplicationInput {
  businessName: string
  phone: string
  email: string
  cardcomTerminalId: string
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
): Promise<{ success: boolean; applicationId?: string; redirectUrl?: string; error?: string }> {
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
    const { data: existingApp, error: existingAppError } = await supabase
      .from('supplier_applications')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single()

    // PGRST116 is `.single()` finding no row, which is the answer we want here.
    if (existingAppError && existingAppError.code !== 'PGRST116') {
      log.error('existing_application_lookup_failed', { err: existingAppError })
      return { success: false, error: 'שגיאה בהגשת בקשה' }
    }

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
      log.error('failed_to_create_application', { err: appError })
      return { success: false, error: 'שגיאה ביצירת בקשה' }
    }

    // Get client IP
    const clientIP = await getClientIP()

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex')

    // Create Cardcom Low Profile payment for 1 ILS verification
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://kenyonexpress.co.il'
    const cardcom = new CardcomProvider()

    let lowProfileId: string | null = null
    let paymentRedirectUrl: string | null = null
    let verificationStatus: 'pending' | 'verified' | 'failed' = 'pending'

    try {
      const lowProfileResult = await cardcom.createLowProfile({
        paymentId: `supplier-verification-${application.id}`,
        orderId: application.id,
        orderNumber: application.id.slice(0, 8),
        amountAgorot: agorot(100), // 1 ILS
        currency: 'ILS',
        saveToken: false,
        successRedirectUrl: `${siteUrl}/supplier/apply/verify-payment?app=${application.id}&token=${verificationToken}&status=success`,
        failedRedirectUrl: `${siteUrl}/supplier/apply/verify-payment?app=${application.id}&token=${verificationToken}&status=failed`,
        webhookUrl: `${siteUrl}/api/webhooks/cardcom/supplier-verification`,
        description: `Supplier Verification - ${input.businessName}`,
      })

      lowProfileId = lowProfileResult.lowProfileId
      paymentRedirectUrl = lowProfileResult.redirectUrl
    } catch (error) {
      log.error('failed_to_create_low_profile_payment', { err: error })
      verificationStatus = 'failed'
      // Don't fail the application - mark as failed for manual verification
    }

    // Create agreement record
    const agreementHash = hashAgreementText(AGREEMENT_TEXT_V1)

    const admin = createAdminClient()
    const { error: agreementError } = await admin.from('supplier_agreements').insert({
      application_id: application.id,
      cardcom_terminal_id: input.cardcomTerminalId,
      agreement_version: AGREEMENT_VERSION,
      agreement_hash: agreementHash,
      accepted_ip: clientIP,
      verification_charge_id: lowProfileId,
      verification_status: verificationStatus,
      verification_token: verificationToken,
    })

    if (agreementError) {
      log.error('failed_to_create_agreement', { err: agreementError })
      // Don't fail - application was created
    }

    // Send verification email
    const verificationUrl = `${siteUrl}/supplier/verify-email?token=${verificationToken}`

    const emailTemplate = buildSupplierVerificationEmail({
      businessName: input.businessName,
      verificationUrl,
    })

    const emailResult = await sendBuiltEmail(emailTemplate, {
      to: input.email,
      idempotencyKey: `supplier-verification-${application.id}`,
    })

    if (!emailResult.ok) {
      log.error('failed_to_send_verification_email', { err: emailResult })
      // Don't fail the application - admin can resend
    }

    // If Low Profile was created successfully, return redirect URL
    if (paymentRedirectUrl) {
      return { success: true, applicationId: application.id, redirectUrl: paymentRedirectUrl }
    }

    return { success: true, applicationId: application.id }
  } catch (error) {
    log.error('supplier_application_error', { err: error })
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
      log.error('failed_to_verify_email', { err: updateError })
      return { success: false, error: 'שגיאה באימות אימייל' }
    }

    return { success: true }
  } catch (error) {
    log.error('email_verification_error', { err: error })
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

  const { data: applications, error } = await admin
    .from('supplier_applications')
    .select('*, profiles:user_id(full_name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    log.error('pending_applications_list_failed', { err: error })
  }

  return applications ?? []
}

/**
 * Approve supplier application (creates supplier + grants access)
 */
export async function approveSupplierApplication(
  applicationId: string,
): Promise<{ success: boolean; supplierId?: string; error?: string }> {
  try {
    const admin = createAdminClient()

    // Call the existing approve function from migration 027
    const { data, error } = await admin.rpc('approve_supplier_application', {
      p_application_id: applicationId,
    })

    if (error) {
      log.error('failed_to_approve_application', { err: error })
      return { success: false, error: 'שגיאה באישור בקשה' }
    }

    return { success: true, supplierId: data }
  } catch (error) {
    log.error('approval_error', { err: error })
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
      log.error('failed_to_reject_application', { err: error })
      return { success: false, error: 'שגיאה בדחיית בקשה' }
    }

    return { success: true }
  } catch (error) {
    log.error('rejection_error', { err: error })
    return { success: false, error: 'שגיאה בדחיית בקשה' }
  }
}

export { AGREEMENT_TEXT_V1, AGREEMENT_VERSION }
