'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { MAX_MANUAL_CREDIT_AGOROT } from '@/lib/admin/manual-credit'
import { requireSection } from '@/lib/admin/rbac'
import {
  VIEW_AS_COOKIE,
  VIEW_AS_TTL_SECONDS,
  ViewAsSecretMissingError,
  mintViewAsGrant,
} from '@/lib/admin/view-as-token'
import { type agorot, agorotToIls, ilsToAgorot } from '@/lib/commerce/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * The three write tools on the customer console, and the one grant that opens
 * the read-only view.
 *
 * EVERY ONE OF THEM REQUIRES A REASON, and the requirement is not decoration.
 * `writeAuditLog` records who and what; a wallet credit for 50 shekels with no
 * `why` is a row that answers "an admin did it" to a question that was "should
 * they have". The reason is validated before anything moves and is stored in
 * the same audit row as the change.
 */

const MIN_REASON = 3
const MAX_REASON = 500

function readReason(formData: FormData): string | null {
  const reason = String(formData.get('reason') ?? '')
    .trim()
    .slice(0, MAX_REASON)
  return reason.length >= MIN_REASON ? reason : null
}

/* ======================================================================== */
/* Manual wallet credit                                                      */
/* ======================================================================== */

export type WalletCreditState = { error: string } | { success: string } | null

/** The ledger account a goodwill credit is paid out of. */
const ADJUSTMENTS_ACCOUNT_CODE = 'platform:adjustments'

/**
 * Credits a customer's wallet by hand.
 *
 * =========================================================================
 * `admin_credit` ALREADY HAD A HEBREW LABEL AND NO WRITER
 * =========================================================================
 *
 * `WALLET_REASON_LABELS` in `server/queries/account.ts` has mapped
 * `admin_credit` to "זיכוי ידני" since it was written, and a grep of the whole
 * tree finds that string in exactly one place: the label. Nothing has ever
 * produced such an entry. The customer-facing wallet screen was already
 * prepared to render a manual credit that no code path could create. This is
 * the writer, and it uses that exact reason code rather than inventing a
 * second spelling that the label would not match.
 *
 * =========================================================================
 * MONEY MOVES THROUGH `fn_wallet_transfer` AND NOWHERE ELSE
 * =========================================================================
 *
 * Not an INSERT into `wallet_entries`, and not an UPDATE of a cached balance.
 * The function is the only writer the ledger has, it keeps the cached column
 * and the entries in step, and `v_wallet_balance_drift` exists precisely
 * because a second writer would put them out of step invisibly.
 *
 * `platform:adjustments` is the debit side. It is one of three platform
 * accounts on production (`revenue`, `cashback_reserve`, `adjustments`) and it
 * is the only one that means "the platform decided to give this away" --
 * charging goodwill to `revenue` would make the revenue account read as though
 * the customer had spent the money.
 *
 * THE IDEMPOTENCY KEY IS FRESH PER SUBMISSION, deliberately, unlike every other
 * caller of this RPC. `order:<id>:cashback` is stable because a replayed
 * webhook must not pay twice. Here a second submission is a second DECISION by
 * a person who is looking at the balance they just changed, and silently
 * swallowing it would show them a screen that says the credit was made while
 * the money did not move. Double-submission of one form is guarded by the rate
 * limit and by the operator, not by collapsing two intentions into one.
 */
async function runCreditCustomerWallet(
  _: WalletCreditState,
  formData: FormData,
): Promise<WalletCreditState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    // `payments`, not `users`. This is money leaving the platform, and the
    // support role reads users but has no access to payments at all.
    session = await requireSection('payments', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const allowed = await checkRateLimit(`admin-wallet-credit:${session.userId}`, 20, 3600)
  if (!allowed) return { error: 'יותר מדי זיכויים, נסו שוב בעוד רגע' }

  const userId = String(formData.get('user_id') ?? '').trim()
  const reason = readReason(formData)
  const rawAmount = String(formData.get('amount_ils') ?? '').trim()

  if (!userId) return { error: 'לא נבחר לקוח' }
  if (!reason) return { error: 'חובה לציין סיבה לזיכוי' }

  let amount: ReturnType<typeof agorot>
  try {
    // `ilsToAgorot` parses the string; it never multiplies a float by 100.
    amount = ilsToAgorot(rawAmount)
  } catch {
    return { error: 'סכום לא תקין' }
  }
  if (amount <= 0) return { error: 'הסכום חייב להיות גדול מאפס' }
  if (amount > MAX_MANUAL_CREDIT_AGOROT) {
    return { error: 'הסכום חורג מהתקרה לזיכוי ידני' }
  }

  const admin = createAdminClient()

  const [profileResult, adjustmentsResult] = await Promise.all([
    admin.from('profiles').select('id, email').eq('id', userId).maybeSingle(),
    admin.from('wallet_accounts').select('id').eq('code', ADJUSTMENTS_ACCOUNT_CODE).maybeSingle(),
  ])

  if (profileResult.error || !profileResult.data) return { error: 'הלקוח לא נמצא' }
  if (adjustmentsResult.error || !adjustmentsResult.data) {
    log.error('admin.wallet_credit_adjustments_account_missing', {
      reason: adjustmentsResult.error?.message ?? 'no row',
    })
    return { error: 'חשבון ההתאמות של הפלטפורמה חסר' }
  }

  const target = await getOrCreateWalletAccount(admin, userId)
  if (!target) return { error: 'לא ניתן לפתוח ארנק ללקוח הזה' }

  const idempotency = `admin-credit:${crypto.randomUUID()}`
  const { error } = await admin.rpc('fn_wallet_transfer', {
    p_debit_account: adjustmentsResult.data.id,
    p_credit_account: target,
    p_amount_ils: agorotToIls(amount),
    p_reason: 'admin_credit',
    p_idempotency: idempotency,
    p_order_id: null as never,
  })

  // Audited whether or not it landed. "We tried to credit and the ledger
  // refused" is a fact support needs and a successes-only log cannot hold.
  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'wallet_accounts',
    entityId: target,
    changes: { reason, amount_agorot: amount, idempotency, credited: !error },
    metadata: { user_id: userId, source: 'admin_customer_console' },
    before: { credited_agorot: 0 },
    after: { credited_agorot: error ? 0 : amount },
  })

  if (error) {
    log.error('admin.wallet_credit_failed', { userId, reason: error.message })
    return { error: 'הזיכוי נכשל' }
  }

  return { success: 'הארנק זוכה' }
}

type AdminClient = ReturnType<typeof createAdminClient>

/**
 * The customer's ledger account, opened if this is their first credit.
 *
 * A private copy rather than an import: the one in `payments/finalize.ts` is
 * not exported, and exporting it would widen a module that is deliberately the
 * single writer of the paid transition. `wallet_accounts` has a unique index on
 * `user_id`, so the insert races safely -- a conflict means somebody else just
 * created it and the re-read finds it.
 */
async function getOrCreateWalletAccount(
  admin: AdminClient,
  userId: string,
): Promise<string | null> {
  const existing = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (existing.data?.id) return existing.data.id

  const created = await admin
    .from('wallet_accounts')
    .insert({ user_id: userId })
    .select('id')
    .maybeSingle()
  if (created.data?.id) return created.data.id

  const reread = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (reread.data?.id) return reread.data.id

  log.error('admin.wallet_account_open_failed', {
    userId,
    reason: created.error?.message ?? reread.error?.message ?? 'no row',
  })
  return null
}

/* ======================================================================== */
/* Resend a transactional email                                              */
/* ======================================================================== */

export type ResendEmailState = { error: string } | { success: string } | null

/**
 * Puts a mail the customer says never arrived back on the queue.
 *
 * =========================================================================
 * IT RE-ENQUEUES THE ROW. IT DOES NOT REBUILD THE MAIL.
 * =========================================================================
 *
 * The payload that was composed at the time is copied forward verbatim. The
 * alternative -- regenerate from today's order -- produces a "resend" that says
 * something the original did not: an order refunded since would be described in
 * the past tense, a template reworded since would arrive in the new words, and
 * the customer comparing it against what a friend received would be right to
 * say we sent two different things. What they are owed is the mail they were
 * promised.
 *
 * =========================================================================
 * THE DEDUPE KEY IS THE WHOLE MECHANISM
 * =========================================================================
 *
 * `fn_enqueue_notification` ends in `ON CONFLICT (dedupe_key) DO NOTHING`, and
 * that is exactly right for its ordinary callers: a replayed webhook and a
 * reconcile pass both finalizing one order must not mail twice. It also means
 * that re-inserting a row with its own key is a SILENT NO-OP -- the function
 * returns void, the action would report success, and nothing would be sent.
 * A resend must therefore mint a NEW key, and it derives it from the original
 * so the outbox still shows which mail this is a second copy of.
 *
 * SUPPRESSIONS STILL WIN. The insert goes through the same function, which
 * checks `email_suppressions` first. An address that hard-bounced is not
 * written to because an operator pressed a button; the audit row records the
 * attempt either way.
 *
 * TWO LIMITS, and the second is the one that protects the customer rather than
 * the platform: per operator so an account cannot be used as a mailer, and per
 * OUTBOX ROW so one person cannot be sent the same mail thirty times.
 */
async function runResendTransactionalEmail(
  _: ResendEmailState,
  formData: FormData,
): Promise<ResendEmailState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('orders', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const allowed = await checkRateLimit(`admin-email-resend:${session.userId}`, 40, 3600)
  if (!allowed) return { error: 'יותר מדי שליחות, נסו שוב בעוד רגע' }

  const outboxId = String(formData.get('outbox_id') ?? '').trim()
  const reason = readReason(formData)
  if (!outboxId) return { error: 'לא נבחר מייל' }
  if (!reason) return { error: 'חובה לציין סיבה לשליחה חוזרת' }

  const perRow = await checkRateLimit(`email-resend:${outboxId}`, 3, 3600)
  if (!perRow) return { error: 'המייל הזה כבר נשלח שוב לאחרונה' }

  const admin = createAdminClient()
  const { data, error: readError } = await admin
    .from('notification_outbox')
    .select('id, kind, recipient_email, payload, user_id')
    .eq('id', outboxId)
    .maybeSingle()

  if (readError) {
    log.warn('admin.email_resend_read_failed', { outboxId, reason: readError.message })
    return { error: 'לא ניתן לקרוא את המייל כרגע' }
  }
  if (!data) return { error: 'המייל לא נמצא' }

  const original = data as {
    id: string
    kind: string
    recipient_email: string
    payload: unknown
    user_id: string | null
  }

  const dedupe = `resend:${original.id}:${crypto.randomUUID()}`
  const { error } = await admin.rpc('fn_enqueue_notification', {
    p_kind: original.kind,
    p_email: original.recipient_email,
    p_dedupe: dedupe,
    p_payload: original.payload as never,
    p_user_id: original.user_id,
  })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'manual_override',
    entityType: 'notification_outbox',
    entityId: original.id,
    changes: {
      reason,
      kind: original.kind,
      dedupe_key: dedupe,
      queued: !error,
      failure: error?.message ?? null,
    },
    metadata: { user_id: original.user_id, source: 'admin_customer_console' },
  })

  if (error) {
    log.error('admin.email_resend_failed', { outboxId, reason: error.message })
    return { error: 'השליחה החוזרת נכשלה' }
  }

  // "Queued", not "sent", and the wording is load bearing. The outbox is
  // drained by `/api/cron/notifications`; the mail leaves on that pass, not on
  // this button. An operator told "sent" would tell the customer to look now.
  return { success: 'המייל הוכנס לתור השליחה' }
}

/* ======================================================================== */
/* Read-only view as the customer                                            */
/* ======================================================================== */

export type ViewAsState = { error: string } | null

/**
 * Opens the read-only customer view, after writing down who opened it and why.
 *
 * The audit row is written BEFORE the grant is minted, and that ordering is the
 * feature. `lib/admin/view-as-token.ts` explains the rest: the cookie exists so
 * that reaching `/admin/users/<id>/view-as` by typing the URL is impossible,
 * which is what makes the audit row a complete record of who read whose history
 * rather than a record of the people who happened to use the button.
 *
 * `action: 'login'` out of the deployed `audit_action` enum. The enum has nine
 * values and none of them is `impersonate`; `login` is the closest true
 * statement (an actor entered a session as somebody) and adding a tenth value
 * would be a migration in `pending`, which means the audit row does not exist
 * until somebody approves a file. `manual_override` was the alternative and it
 * is already what every override in this file uses -- reusing it here would
 * make "who viewed this customer" unfilterable from "who changed something".
 */
async function runStartCustomerViewAs(_: ViewAsState, formData: FormData): Promise<ViewAsState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    // WRITE on `users`, which no read-only role has. Impersonation is not a
    // read even though everything it shows is: the support and read_only tiers
    // can already see this customer's panels one page back, and what this grants
    // on top is the ability to do it without the customer's data being labelled
    // as somebody else's screen.
    session = await requireSection('users', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const allowed = await checkRateLimit(`admin-view-as:${session.userId}`, 30, 3600)
  if (!allowed) return { error: 'יותר מדי כניסות, נסו שוב בעוד רגע' }

  const userId = String(formData.get('user_id') ?? '').trim()
  const reason = readReason(formData)
  if (!userId) return { error: 'לא נבחר לקוח' }
  if (!reason) return { error: 'חובה לציין סיבה לצפייה כלקוח' }

  const admin = createAdminClient()
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  // Named separately: "the customer does not exist" sends the operator to check
  // the id, "the read failed" sends them to try again. Collapsing the two would
  // have them retyping an id that was right.
  if (profileError) {
    log.warn('admin.view_as_profile_read_failed', { userId, reason: profileError.message })
    return { error: 'לא ניתן לקרוא את הלקוח כרגע' }
  }
  if (!profile) return { error: 'הלקוח לא נמצא' }

  let grant: string
  try {
    grant = mintViewAsGrant(userId, session.userId)
  } catch (err) {
    if (err instanceof ViewAsSecretMissingError) {
      log.error('admin.view_as_secret_missing', {})
      return { error: 'צפייה כלקוח אינה זמינה בסביבה הזאת' }
    }
    throw err
  }

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'login',
    entityType: 'profiles',
    entityId: userId,
    changes: { reason, mode: 'read_only', ttl_seconds: VIEW_AS_TTL_SECONDS },
    metadata: { source: 'admin_customer_console' },
  })

  const store = await cookies()
  store.set(VIEW_AS_COOKIE, grant, {
    httpOnly: true,
    sameSite: 'lax',
    // Host-only and path-scoped to the panel. The grant has no meaning outside
    // /admin and there is no reason for the browser to attach it to a
    // storefront request.
    path: '/admin',
    secure: process.env.NODE_ENV === 'production',
    maxAge: VIEW_AS_TTL_SECONDS,
  })

  redirect(`/admin/users/${userId}/view-as`)
}

/**
 * Ends the view and says so in the log.
 *
 * The cookie is cleared even when the audit write fails -- `writeAuditLog` is
 * best effort by design and never throws -- because a grant that could not be
 * logged as closed must still be closed.
 */
async function runEndCustomerViewAs(_: ViewAsState, formData: FormData): Promise<ViewAsState> {
  let session: Awaited<ReturnType<typeof requireSection>>
  try {
    session = await requireSection('users', 'write')
  } catch {
    return { error: 'אין הרשאה' }
  }

  const userId = String(formData.get('user_id') ?? '').trim()

  const store = await cookies()
  store.delete({ name: VIEW_AS_COOKIE, path: '/admin' })

  await writeAuditLog({
    actorId: session.userId,
    actorRole: session.role,
    action: 'logout',
    entityType: 'profiles',
    entityId: userId || null,
    changes: { mode: 'read_only', ended: true },
    metadata: { source: 'admin_customer_console' },
  })

  redirect(userId ? `/admin/users/${userId}` : '/admin/users')
}

/* ======================================================================== */

export async function creditCustomerWallet(
  state: WalletCreditState,
  formData: FormData,
): Promise<WalletCreditState> {
  return withActionContext('admin.customer.wallet_credit', () =>
    runCreditCustomerWallet(state, formData),
  )
}

export async function resendTransactionalEmail(
  state: ResendEmailState,
  formData: FormData,
): Promise<ResendEmailState> {
  return withActionContext('admin.customer.email_resend', () =>
    runResendTransactionalEmail(state, formData),
  )
}

export async function startCustomerViewAs(
  state: ViewAsState,
  formData: FormData,
): Promise<ViewAsState> {
  return withActionContext('admin.customer.view_as_start', () =>
    runStartCustomerViewAs(state, formData),
  )
}

export async function endCustomerViewAs(
  state: ViewAsState,
  formData: FormData,
): Promise<ViewAsState> {
  return withActionContext('admin.customer.view_as_end', () =>
    runEndCustomerViewAs(state, formData),
  )
}
