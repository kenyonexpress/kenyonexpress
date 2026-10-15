'use server'

import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { isR2StorageConfigured } from '@/lib/storage/r2-service'
import { createR2SignedUploadUrl } from '@/lib/storage/r2-service'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { bankSecretPayload, checkBankDetails } from '@/lib/suppliers/bank-account'
import { checkCompanyId, companyIdMessage } from '@/lib/suppliers/company-id'
import { CONTRACT_VERSION, contractHash, contractVersionMatches } from '@/lib/suppliers/contract'
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

/**
 * Applying to be a supplier.
 *
 * AN APPLICANT IS NOT A SUPPLIER, and that is the shape of the whole flow. No
 * `suppliers` row exists until an admin approves, so a half-finished
 * application cannot appear in the directory, the admin pickers, the publish
 * gate or the payout run - none of which had to be changed for that to be true.
 * `migrations/pending/204` records the measurement behind the decision: of 19
 * `from('suppliers')` call sites, about half do not filter on status.
 *
 * THE BANK ACCOUNT NEVER TOUCHES A COLUMN. It goes to `store_supplier_bank_secret`,
 * a SECURITY DEFINER wrapper over `vault.create_secret` granted to nobody but
 * the service role, and the row keeps the returned uuid plus the bank code,
 * branch and last four - which a payout operator needs and which cannot move
 * money.
 */

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703', 'PGRST202', '42883'])
const NOT_APPLIED = 'טופס ההצטרפות עדיין לא פעיל. כתבו לנו ונחזור אליכם.'

function notApplied(code: string | undefined): boolean {
  return MISSING.has(code ?? '')
}

export type OnboardingState = {
  ok: boolean
  message?: string
  error?: string
  applicationId?: string
  /** Which field to focus, when the refusal is about one. */
  field?: string
}

const applySchema = z.object({
  business_name: z.string().trim().min(2, 'נא למלא שם עסק').max(200),
  business_id: z.string().trim().min(1, 'נא למלא מספר ח"פ או עוסק מורשה'),
  legal_form: z.enum(['company', 'association', 'individual', 'partnership']),
  contact_name: z.string().trim().min(2, 'נא למלא שם איש קשר').max(120),
  email: z.string().trim().email('כתובת מייל לא תקינה').max(254),
  phone: z.string().trim().min(9, 'מספר טלפון לא תקין').max(20),
  city: z.string().trim().min(2, 'נא למלא עיר').max(80),
  address: z.string().trim().max(200).optional().default(''),
  website: z.string().trim().max(200).optional().default(''),
  category: z.string().trim().max(80).optional().default(''),
  bank_code: z.string().trim().min(1, 'נא לבחור בנק'),
  bank_branch: z.string().trim().min(1, 'נא למלא מספר סניף'),
  bank_account: z.string().trim().min(1, 'נא למלא מספר חשבון'),
  bank_holder: z.string().trim().min(2, 'נא למלא את שם בעל החשבון'),
  contract_version: z.string().trim(),
  accept_contract: z.string().optional(),
})

async function runSubmitApplication(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר כדי להגיש בקשה' }

  if (!(await checkRateLimit(`supplier-apply:${user.id}`, 5, 3600))) {
    return { ok: false, error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' }
  }

  const parsed = applySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'בדקו את הפרטים ונסו שוב',
      field: issue?.path[0]?.toString(),
    }
  }
  const input = parsed.data

  // The check digit, before anything is written. Catches the transposed pair
  // and the dropped digit; it does NOT establish that the business exists,
  // which is what the uploaded certificate is for.
  const companyId = checkCompanyId(input.business_id)
  if (!companyId.ok) {
    return { ok: false, error: companyIdMessage(companyId) ?? 'מספר לא תקין', field: 'business_id' }
  }

  const bank = checkBankDetails({
    bankCode: input.bank_code,
    branch: input.bank_branch,
    accountNumber: input.bank_account,
    accountHolder: input.bank_holder,
  })
  if (!bank.ok) return { ok: false, error: bank.message, field: `bank_${bank.field}` }

  /**
   * THE VERSION IS CHECKED, THE HASH IS COMPUTED HERE.
   *
   * A hash the browser sends is a hash the browser chose, and a contract
   * acceptance is exactly the record somebody would want to forge. The client
   * says which version it was shown; a mismatch means the terms changed between
   * rendering and submitting, and the right answer is to show the new ones
   * rather than record an acceptance of text nobody read.
   */
  if (input.accept_contract !== 'on') {
    return { ok: false, error: 'יש לאשר את הסכם הספק', field: 'accept_contract' }
  }
  if (!contractVersionMatches(input.contract_version)) {
    return {
      ok: false,
      error: 'תנאי ההסכם עודכנו. רעננו את העמוד, קראו את הגרסה החדשה ואשרו שוב.',
      field: 'accept_contract',
    }
  }

  const admin = createAdminClient()

  // The vault, before the row: an application row carrying no bank secret is a
  // half-application somebody has to chase, while a vault secret with no row is
  // an orphan nobody sees. The cheaper failure is the second one.
  const { data: secretId, error: secretError } = await admin.rpc(
    'store_supplier_bank_secret' as never,
    { p_label: `supplier-bank-${companyId.normalized}`, p_value: bankSecretPayload(bank) } as never,
  )
  if (secretError || !secretId) {
    if (notApplied(secretError?.code)) return { ok: false, error: NOT_APPLIED }
    log.error('supplier_onboarding.vault_write_failed', { reason: secretError?.message })
    return { ok: false, error: 'שמירת פרטי הבנק נכשלה, נסו שוב' }
  }
  const bankSecretId = secretId as unknown as string

  const now = new Date().toISOString()
  const { data: created, error: insertError } = await admin
    .from('supplier_applications')
    .insert({
      user_id: user.id,
      business_name: input.business_name,
      business_id: companyId.normalized,
      legal_form: input.legal_form,
      contact_name: input.contact_name,
      email: input.email,
      phone: input.phone,
      city: input.city,
      address: input.address || null,
      website: input.website || null,
      category: input.category || null,
      bank_secret_id: bankSecretId,
      bank_code: bank.bankCode,
      bank_branch: bank.branch,
      bank_last4: bank.last4,
      status: 'submitted',
      submitted_at: now,
    } as never)
    .select('id')
    .single()

  if (insertError || !created) {
    if (notApplied(insertError?.code)) return { ok: false, error: NOT_APPLIED }
    // 23505 on the partial unique index: this business number already has a
    // live application. Named, because "שמירה נכשלה" would have them submit
    // again and hit the same wall.
    if (insertError?.code === '23505') {
      return {
        ok: false,
        error: 'כבר קיימת בקשה פעילה למספר העסק הזה. פנו אלינו לבדיקת הסטטוס.',
        field: 'business_id',
      }
    }
    log.error('supplier_onboarding.insert_failed', { reason: insertError?.message })
    return { ok: false, error: 'שמירת הבקשה נכשלה, נסו שוב' }
  }

  const applicationId = (created as { id: string }).id

  // The acceptance log, after the application exists so it has something to
  // point at. Failing here does not fail the application: the applicant has
  // submitted, and losing the acceptance record is a problem for us to chase
  // rather than a reason to throw their form away.
  const ip = await getClientIp()
  const { error: contractError } = await admin.from('supplier_contract_acceptances').insert({
    application_id: applicationId,
    accepted_by: user.id,
    contract_version: CONTRACT_VERSION,
    contract_sha256: contractHash(),
    client_ip: ip && ip !== 'unknown' ? ip : null,
  } as never)
  if (contractError) {
    log.error('supplier_onboarding.contract_log_failed', {
      applicationId,
      reason: contractError.message,
    })
  }

  revalidatePath('/suppliers/apply')
  return {
    ok: true,
    applicationId,
    message: 'הבקשה נשלחה. נבדוק אותה ונחזור אליכם. אפשר להעלות מסמכים עכשיו.',
  }
}

// ── Document uploads ───────────────────────────────────────────────────────

const uploadSchema = z.object({
  application_id: z.string().uuid(),
  kind: z.enum([
    'business_certificate',
    'bank_confirmation',
    'id_document',
    'vat_certificate',
    'insurance',
    'other',
  ]),
  content_type: z.enum(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
  bytes: z.coerce
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, 'הקובץ גדול מ-10MB'),
  original_name: z.string().trim().max(200).optional().default(''),
})

export type UploadTicket =
  | { ok: true; uploadUrl: string; key: string }
  | { ok: false; error: string }

/**
 * Mints a presigned PUT for one onboarding document.
 *
 * THE BUCKET IS THE EXISTING PRIVATE `user-uploads`, NOT A NEW ONE, and that is
 * a measured decision rather than laziness. R2 could not be verified from here
 * at all: the Cloudflare account this session can reach answers
 * `10042 Please enable R2 through the Cloudflare Dashboard`, and no `R2_*`
 * variables are configured in this environment. Declaring a
 * `supplier-documents` bucket would add a name to the infrastructure contract
 * that nobody can confirm exists, and uploads would fail with a 404 that reads
 * like a permissions problem. `user-uploads` is already private, already
 * accepts PDF, and is already reachable only through a signed URL - the
 * isolation that matters here is the key prefix and the signed-GET, and both
 * are identical either way.
 */
async function runRequestDocumentUpload(rawInput: unknown): Promise<UploadTicket> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'יש להתחבר' }

  if (!(await checkRateLimit(`supplier-doc-upload:${user.id}`, 30, 3600))) {
    return { ok: false, error: 'יותר מדי העלאות. נסו שוב מאוחר יותר.' }
  }

  const parsed = uploadSchema.safeParse(rawInput)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'קובץ לא תקין' }
  }

  if (!isR2StorageConfigured()) {
    // Said plainly rather than as a 500. An applicant told "try again" will.
    return { ok: false, error: 'העלאת מסמכים אינה מוגדרת בסביבה הזו. שלחו אותם במייל.' }
  }

  const admin = createAdminClient()
  const { data: application, error: appError } = await admin
    .from('supplier_applications')
    .select('id, user_id, status')
    .eq('id', parsed.data.application_id)
    .maybeSingle()
  if (appError) {
    if (notApplied(appError.code)) return { ok: false, error: NOT_APPLIED }
    log.error('supplier_onboarding.application_read_failed', { reason: appError.message })
    return { ok: false, error: 'לא ניתן לטעון את הבקשה כרגע' }
  }
  const row = application as unknown as { id: string; user_id: string; status: string } | null
  // Ownership on the service-role client, which does not consult RLS. Same
  // sentence either way, so a different message cannot confirm an id exists.
  if (!row || row.user_id !== user.id) return { ok: false, error: 'הבקשה לא נמצאה' }
  if (row.status === 'approved' || row.status === 'rejected') {
    return { ok: false, error: 'הבקשה כבר הוכרעה ולא ניתן להוסיף לה מסמכים.' }
  }

  // The key carries the application id, so one applicant's documents cannot
  // land under another's prefix even if the caller controls the filename -
  // which they do not: the name is generated here and the original is kept as
  // a separate column for display only.
  const key = `supplier-onboarding/${row.id}/${parsed.data.kind}-${crypto.randomUUID()}`

  let ticket: Awaited<ReturnType<typeof createR2SignedUploadUrl>>
  try {
    ticket = await createR2SignedUploadUrl('user-uploads', key, parsed.data.content_type)
  } catch (error) {
    log.error('supplier_onboarding.presign_failed', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, error: 'לא ניתן להעלות מסמך כרגע, נסו שוב' }
  }

  // Recorded BEFORE the browser uploads, so a file that lands in the bucket
  // always has a row naming it. The opposite order leaves objects nobody can
  // find, in a bucket nobody lists, holding somebody's identity document.
  const { error: docError } = await admin.from('supplier_application_documents').insert({
    application_id: row.id,
    kind: parsed.data.kind,
    r2_key: ticket.key,
    content_type: parsed.data.content_type,
    bytes: parsed.data.bytes,
    original_name: parsed.data.original_name || null,
    uploaded_by: user.id,
  } as never)
  if (docError) {
    if (notApplied(docError.code)) return { ok: false, error: NOT_APPLIED }
    log.error('supplier_onboarding.document_row_failed', { reason: docError.message })
    return { ok: false, error: 'רישום המסמך נכשל, נסו שוב' }
  }

  return { ok: true, uploadUrl: ticket.uploadUrl, key: ticket.key }
}

export async function submitSupplierApplication(
  prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  return withActionContext('supplier_onboarding.submit', () => runSubmitApplication(prev, formData))
}

export async function requestDocumentUpload(rawInput: unknown): Promise<UploadTicket> {
  return withActionContext('supplier_onboarding.upload_url', () =>
    runRequestDocumentUpload(rawInput),
  )
}
