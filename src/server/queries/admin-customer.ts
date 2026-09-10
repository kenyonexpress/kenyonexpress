import 'server-only'

import { ilsColumnToAgorot } from '@/lib/account/format'
import {
  type CustomerSearchTerm,
  classifyCustomerTerm,
  phoneExactVariants,
  phoneLoosePattern,
} from '@/lib/admin/customer-search'
import {
  CUSTOMER_TIMELINE_CAP,
  type TimelineEvent,
  buildCustomerTimeline,
  timelineEvent,
} from '@/lib/admin/customer-timeline'
import { ORDER_STATUS_LABELS, labelFor } from '@/lib/admin/labels'
import { VOUCHER_STATUS_LABELS, type VoucherStatus } from '@/lib/admin/voucher-view'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { likeContains, sanitizeOrTerm } from '@/lib/utils/search-escape'
import { walletReasonLabel } from '@/server/queries/account'

/**
 * The reads behind the support console. Every one of them goes through the
 * SERVICE CLIENT, and that is a deliberate departure from `getAdminWalletView`
 * next door, which uses the request-scoped client on purpose.
 *
 * The difference is the question being asked. `getAdminWalletView` asks "this
 * customer's wallet", which RLS states exactly (`is_admin() OR it is yours`),
 * so the database can be the authority and a non-admin caller reading it gets
 * their own rows and nothing else. These ask "which customer is this phone
 * number" and "everything that ever happened to this person", which are not
 * per-row permissions at all: `notification_outbox` and `user_addresses` carry
 * no `is_admin()` read policy, so a request-scoped read would return zero rows
 * to an admin and the console would report a customer with no history rather
 * than refuse. The authority here is the page gate, `requireSection('users')`,
 * and every caller in this file is behind one.
 */

export interface CustomerHit {
  userId: string
  email: string | null
  fullName: string | null
  role: string | null
  createdAt: string | null
  /** Hebrew, for the results list: why this row came back for that term. */
  matchedOnHe: string
}

export interface CustomerSearchResult {
  term: CustomerSearchTerm
  hits: CustomerHit[]
  /** True when the narrow reading found nobody and a name search was run instead. */
  widened: boolean
}

const PROFILE_COLUMNS = 'id, email, full_name, role, created_at'

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  created_at: string | null
}

function toHit(row: ProfileRow, matchedOnHe: string): CustomerHit {
  return {
    userId: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    createdAt: row.created_at,
    matchedOnHe,
  }
}

async function profilesByIds(ids: readonly string[], matchedOnHe: string): Promise<CustomerHit[]> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select(PROFILE_COLUMNS).in('id', unique)
  if (error) {
    log.warn('admin.customer_search_profiles_failed', { reason: error.message })
    return []
  }
  return (data ?? []).map((row) => toHit(row as ProfileRow, matchedOnHe))
}

async function searchByName(term: string, matchedOnHe: string): Promise<CustomerHit[]> {
  const safe = sanitizeOrTerm(term)
  if (!safe) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
    .order('created_at', { ascending: false })
    .limit(25)
  if (error) {
    log.warn('admin.customer_search_name_failed', { reason: error.message })
    return []
  }
  return (data ?? []).map((row) => toHit(row as ProfileRow, matchedOnHe))
}

/**
 * The order-reference read, which is a PREFIX MATCH and has to be.
 *
 * `orders.id` is a uuid and PostgREST will not `ilike` one, so the eight
 * characters the confirmation email printed cannot be compared against the
 * column directly. `id::text LIKE 'abc12345%'` is what is needed and the way to
 * ask for it through PostgREST is a range on the uuid itself: every uuid
 * beginning with those eight hex characters sorts between `<ref>0000-...` and
 * `<ref>ffff-...`, inclusive. That is an INDEX RANGE on the primary key, not a
 * scan, and it needs no function and no migration.
 *
 * `invoice_number` is tried in the same call because it is the other thing
 * printed on a document a customer might be holding. Measured on production
 * 2026-09-10: **0 of 4 orders carry one**, so today this half always misses --
 * which is precisely why it must not be the only half.
 */
async function searchByOrderRef(ref: string): Promise<CustomerHit[]> {
  const admin = createAdminClient()
  const low = `${ref}-0000-0000-0000-000000000000`
  const high = `${ref}-ffff-ffff-ffff-ffffffffffff`

  const [byId, byInvoice] = await Promise.all([
    admin.from('orders').select('user_id').gte('id', low).lte('id', high).limit(25),
    admin.from('orders').select('user_id').eq('invoice_number', ref).limit(25),
  ])

  if (byId.error) log.warn('admin.customer_search_order_failed', { reason: byId.error.message })
  if (byInvoice.error) {
    log.warn('admin.customer_search_invoice_failed', { reason: byInvoice.error.message })
  }

  const ids = [...(byId.data ?? []), ...(byInvoice.data ?? [])]
    .map((row) => (row as { user_id: string | null }).user_id)
    .filter((id): id is string => Boolean(id))

  return profilesByIds(ids, 'מספר הזמנה')
}

/**
 * Phone, which lives in `user_addresses` and NOT on `profiles`.
 *
 * Both are read. `profiles.phone` exists, is what the phone-OTP flow would
 * populate, and holds **0 values across all 10 rows** on production today; the
 * one phone that does exist is on the single `user_addresses` row. Searching
 * only the column that is currently populated would break the day OTP sign-in
 * starts filling the other one, and searching only `profiles` would have
 * shipped a field that matches nothing.
 *
 * Exact spellings first, the separator-blind pattern only on zero rows. See
 * `phoneLoosePattern` for why the scan is acceptable and why it is second.
 */
async function searchByPhone(intl: string): Promise<CustomerHit[]> {
  const admin = createAdminClient()
  const variants = phoneExactVariants(intl)

  const exact = await Promise.all([
    admin.from('user_addresses').select('user_id').in('phone', variants).limit(25),
    admin.from('profiles').select(PROFILE_COLUMNS).in('phone', variants).limit(25),
  ])

  const addressIds = (exact[0].data ?? [])
    .map((row) => (row as { user_id: string | null }).user_id)
    .filter((id): id is string => Boolean(id))
  const direct = (exact[1].data ?? []).map((row) => toHit(row as ProfileRow, 'טלפון'))

  const fromAddresses = await profilesByIds(addressIds, 'טלפון בכתובת')
  const merged = dedupeHits([...direct, ...fromAddresses])
  if (merged.length > 0) return merged

  // Nothing matched a spelling we predicted. One scan, with `%` between every
  // digit, so any separator arrangement still resolves.
  const loose = phoneLoosePattern(intl)
  const { data, error } = await admin
    .from('user_addresses')
    .select('user_id')
    .ilike('phone', loose)
    .limit(25)
  if (error) {
    log.warn('admin.customer_search_phone_loose_failed', { reason: error.message })
    return []
  }
  const looseIds = (data ?? [])
    .map((row) => (row as { user_id: string | null }).user_id)
    .filter((id): id is string => Boolean(id))
  return profilesByIds(looseIds, 'טלפון בכתובת')
}

function dedupeHits(hits: readonly CustomerHit[]): CustomerHit[] {
  const seen = new Map<string, CustomerHit>()
  for (const hit of hits) if (!seen.has(hit.userId)) seen.set(hit.userId, hit)
  return [...seen.values()]
}

/**
 * One box, four kinds of thing a customer can say.
 *
 * A `uuid` is tried as BOTH a profile id and an order id, in that order,
 * because an operator pasting a uuid out of a log or a URL has no reason to
 * know which table it came from and would otherwise get "not found" for an id
 * that is sitting right there.
 */
export async function searchCustomers(
  rawTerm: string | null | undefined,
): Promise<CustomerSearchResult> {
  const term = classifyCustomerTerm(rawTerm)
  if (term.kind === 'empty') return { term, hits: [], widened: false }

  const admin = createAdminClient()
  let hits: CustomerHit[] = []

  switch (term.kind) {
    case 'uuid': {
      hits = await profilesByIds([term.value], 'מזהה משתמש')
      if (hits.length === 0) {
        const { data, error } = await admin
          .from('orders')
          .select('user_id')
          .eq('id', term.value)
          .limit(1)
        if (error) log.warn('admin.customer_search_order_uuid_failed', { reason: error.message })
        const ids = (data ?? [])
          .map((row) => (row as { user_id: string | null }).user_id)
          .filter((id): id is string => Boolean(id))
        hits = await profilesByIds(ids, 'מזהה הזמנה')
      }
      break
    }
    case 'email': {
      const { data, error } = await admin
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .ilike('email', likeContains(term.value))
        .limit(25)
      if (error) log.warn('admin.customer_search_email_failed', { reason: error.message })
      hits = (data ?? []).map((row) => toHit(row as ProfileRow, 'אימייל'))
      break
    }
    case 'order_ref':
      hits = await searchByOrderRef(term.value)
      break
    case 'phone':
      hits = await searchByPhone(term.value)
      break
    case 'name':
      hits = await searchByName(term.value, 'שם או אימייל')
      break
  }

  hits = dedupeHits(hits)
  if (hits.length > 0) return { term, hits, widened: false }

  // The narrowing was a guess and it found nobody. Widen rather than report a
  // customer who is on the screen behind the wrong classification.
  if (term.fallbackToName) {
    const widened = dedupeHits(await searchByName(term.raw, 'שם או אימייל'))
    if (widened.length > 0) return { term, hits: widened, widened: true }
  }

  return { term, hits: [], widened: false }
}

/* ======================================================================== */
/* The timeline                                                              */
/* ======================================================================== */

/** Bounded per source. The merge caps the whole list; these cap the reads. */
const PER_SOURCE_CAP = 60

function orderRef(id: string, invoiceNumber: string | null): string {
  return invoiceNumber ?? id.slice(0, 8).toUpperCase()
}

/**
 * Every event this customer has, from the five tables that hold them.
 *
 * WHAT IT READS AND WHAT IT DOES NOT. `orders`, `vouchers`, `refunds`,
 * `v_wallet_ledger`, `notifications` and `notification_outbox`. Measured on
 * production 2026-09-10 the last four hold **zero rows in total** and `orders`
 * holds four, so this console renders almost empty today. That is a fact about
 * the data, not about the reads, and it is written down here so a future
 * session does not read "the timeline shows nothing" as a bug in the merge.
 *
 * A FAILED READ IS NOT AN EMPTY SECTION. Each read logs and yields `[]` on
 * error, and the caller is handed `partial` so the page can say which sources
 * did not answer. "This customer has no refunds" and "the refunds table did not
 * respond" are different sentences and support acts differently on each.
 */
export interface CustomerTimelineResult {
  events: TimelineEvent[]
  /** Source names that failed to read. Empty when everything answered. */
  partial: string[]
}

export async function getCustomerTimeline(
  userId: string,
  cap: number = CUSTOMER_TIMELINE_CAP,
): Promise<CustomerTimelineResult> {
  const admin = createAdminClient()
  const partial: string[] = []

  const note = (source: string, error: { message: string } | null): boolean => {
    if (!error) return false
    log.warn('admin.customer_timeline_source_failed', { source, userId, reason: error.message })
    partial.push(source)
    return true
  }

  // ORDERS FIRST, ON PURPOSE, and the refunds read is why.
  //
  // `refunds.requested_by` is the ACTOR, not the customer: a refund an operator
  // files on a phone call carries the operator's id, and a timeline filtered on
  // that column would hide from the customer's own history exactly the refunds
  // support created for them -- the ones most likely to be asked about. There
  // is no `user_id` on `refunds`; the link to a person is `order_id`, so the
  // orders have to be in hand before the refunds can be asked for.
  const ordersResult = await admin
    .from('orders')
    .select('id, invoice_number, status, total_ils, created_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(PER_SOURCE_CAP)

  const orderIds = (ordersResult.data ?? []).map((row) => (row as { id: string }).id)

  const [vouchers, refunds, wallet, notifications, emails] = await Promise.all([
    admin
      .from('vouchers')
      .select('id, code, status, face_value_agorot, issued_at, created_at, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_CAP),
    orderIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin
          .from('refunds')
          .select(
            'id, order_id, state, ground, requested_agorot, granted_agorot, requested_at, reason_he',
          )
          .in('order_id', orderIds)
          .order('requested_at', { ascending: false })
          .limit(PER_SOURCE_CAP),
    admin
      .from('v_wallet_ledger')
      .select('id, direction, amount_ils, reason, order_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_CAP),
    admin
      // `notifications` is absent from the generated types (verified against
      // src/types/database.ts, which is the pre-059 lineage the hosted project
      // actually runs). The table is live and holds the in-app bell rows; the
      // cast is how every other reader of an un-generated table spells it.
      .from('notifications' as never)
      .select('id, kind, title_he, body_he, href, read_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_CAP),
    admin
      .from('notification_outbox')
      .select('id, kind, recipient_email, status, attempts, last_error, sent_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(PER_SOURCE_CAP),
  ])

  const events = buildCustomerTimeline(
    {
      orders: note('orders', ordersResult.error)
        ? []
        : (ordersResult.data ?? []).map((row): TimelineEvent => {
            const order = row as {
              id: string
              invoice_number: string | null
              status: string
              total_ils: number | string | null
              created_at: string
            }
            return timelineEvent('order', {
              id: order.id,
              at: order.created_at,
              titleHe: `הזמנה ${orderRef(order.id, order.invoice_number)}`,
              statusHe: labelFor(ORDER_STATUS_LABELS, order.status),
              amountAgorot: ilsColumnToAgorot(order.total_ils),
              href: `/admin/orders/${order.id}`,
            })
          }),
      vouchers: note('vouchers', vouchers.error)
        ? []
        : (vouchers.data ?? []).map((row): TimelineEvent => {
            const voucher = row as {
              id: string
              code: string
              status: string
              face_value_agorot: number | null
              issued_at: string | null
              created_at: string
            }
            return timelineEvent('voucher', {
              id: voucher.id,
              // `issued_at` is when the customer got it; `created_at` is when
              // the row appeared. They are usually the same instant and when
              // they are not, the customer's date is the true one.
              at: voucher.issued_at ?? voucher.created_at,
              titleHe: `שובר ${voucher.code}`,
              statusHe: labelFor(VOUCHER_STATUS_LABELS, voucher.status as VoucherStatus),
              amountAgorot: voucher.face_value_agorot ?? null,
            })
          }),
      refunds: note('refunds', refunds.error)
        ? []
        : (refunds.data ?? []).map((row): TimelineEvent => {
            const refund = row as {
              id: string
              order_id: string | null
              state: string
              ground: string | null
              requested_agorot: number | null
              granted_agorot: number | null
              requested_at: string
              reason_he: string | null
            }
            return timelineEvent('refund', {
              id: refund.id,
              at: refund.requested_at,
              titleHe: 'בקשת החזר',
              detailHe: refund.reason_he,
              statusHe: REFUND_STATE_LABELS[refund.state] ?? refund.state,
              // What was actually granted when a decision exists, what was
              // asked for while it does not. Showing the request as though it
              // were the payout is how a customer gets told a wrong number.
              amountAgorot: refund.granted_agorot ?? refund.requested_agorot ?? null,
              href: refund.order_id ? `/admin/orders/${refund.order_id}` : null,
            })
          }),
      wallet: note('wallet', wallet.error)
        ? []
        : (wallet.data ?? []).map((row): TimelineEvent => {
            const entry = row as {
              id: string
              direction: string
              amount_ils: number | string | null
              reason: string | null
              order_id: string | null
              created_at: string
            }
            const amount = ilsColumnToAgorot(entry.amount_ils)
            return timelineEvent('wallet', {
              id: entry.id,
              at: entry.created_at,
              titleHe: walletReasonLabel(entry.reason ?? ''),
              statusHe: entry.direction === 'credit' ? 'זיכוי' : 'חיוב',
              // Signed, so the column reads as money moving in a direction
              // rather than as two unrelated positive numbers.
              amountAgorot: entry.direction === 'credit' ? amount : -amount,
              href: entry.order_id ? `/admin/orders/${entry.order_id}` : null,
            })
          }),
      notifications: note('notifications', notifications.error)
        ? []
        : (notifications.data ?? []).map((row): TimelineEvent => {
            const n = row as {
              id: string
              kind: string
              title_he: string | null
              body_he: string | null
              read_at: string | null
              created_at: string
            }
            return timelineEvent('notification', {
              id: n.id,
              at: n.created_at,
              titleHe: n.title_he ?? n.kind,
              detailHe: n.body_he,
              statusHe: n.read_at ? 'נקראה' : 'לא נקראה',
            })
          }),
      emails: note('emails', emails.error)
        ? []
        : (emails.data ?? []).map((row): TimelineEvent => {
            const mail = row as {
              id: string
              kind: string
              recipient_email: string
              status: string
              attempts: number
              last_error: string | null
              sent_at: string | null
              created_at: string
            }
            return timelineEvent('email', {
              id: mail.id,
              at: mail.sent_at ?? mail.created_at,
              titleHe: mail.kind,
              detailHe: mail.last_error,
              statusHe: OUTBOX_STATUS_LABELS[mail.status] ?? mail.status,
            })
          }),
    },
    cap,
  )

  return { events, partial }
}

/**
 * `refund_state` as applied in migration 131, in the deployed vocabulary.
 * `src/server/payments/refund-wallet.ts` explains at length why these six and
 * not the four the brief named.
 */
const REFUND_STATE_LABELS: Record<string, string> = {
  requested: 'התבקש',
  approved: 'אושר',
  rejected: 'נדחה',
  executing: 'בביצוע',
  completed: 'הושלם',
  failed: 'נכשל',
}

const OUTBOX_STATUS_LABELS: Record<string, string> = {
  pending: 'ממתין',
  sent: 'נשלח',
  failed: 'נכשל',
  dead: 'נכשל סופית',
}

/* ======================================================================== */
/* The mail history, for the resend button                                   */
/* ======================================================================== */

export interface CustomerEmailRow {
  id: string
  kind: string
  recipientEmail: string
  status: string
  statusHe: string
  attempts: number
  lastError: string | null
  sentAt: string | null
  createdAt: string
}

/**
 * The customer's outbox rows, which are what "resend any transactional email"
 * actually operates on.
 *
 * A resend re-enqueues THE ROW THAT WAS ALREADY BUILT, payload and all, rather
 * than rebuilding the mail from today's code and today's data. That is the
 * whole reason this read exists as its own function: the customer is asking for
 * the mail they were promised, and an order that has since been refunded, or a
 * template that has since been reworded, would otherwise produce a "resend"
 * that says something the original never said.
 */
export async function listCustomerEmails(userId: string, limit = 30): Promise<CustomerEmailRow[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('notification_outbox')
    .select('id, kind, recipient_email, status, attempts, last_error, sent_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    log.warn('admin.customer_emails_read_failed', { userId, reason: error.message })
    return []
  }

  return (data ?? []).map((row) => {
    const mail = row as {
      id: string
      kind: string
      recipient_email: string
      status: string
      attempts: number
      last_error: string | null
      sent_at: string | null
      created_at: string
    }
    return {
      id: mail.id,
      kind: mail.kind,
      recipientEmail: mail.recipient_email,
      status: mail.status,
      statusHe: OUTBOX_STATUS_LABELS[mail.status] ?? mail.status,
      attempts: mail.attempts,
      lastError: mail.last_error,
      sentAt: mail.sent_at,
      createdAt: mail.created_at,
    }
  })
}
