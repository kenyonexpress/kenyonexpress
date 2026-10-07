import { log } from '@/lib/observability/log'
import {
  RETURN_REASONS,
  type ReturnDestination,
  type ReturnReasonCode,
  isReturnDestination,
  isReturnReasonCode,
  refundDueBy,
  rmaNumber,
} from '@/lib/returns/policy'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { RefundGround, RefundState } from '@/server/payments/refund-record'

/**
 * Reads of the return request (`public.refunds`, STEP 44).
 *
 * Two clients, on purpose. The customer's reads run on the REQUEST client:
 * 131's `refunds_owner_read` policy admits the rows of orders the caller
 * owns and nothing else, so a forged order id reads as "no request" and never
 * as someone else's RMA. The admin reads run on the service role behind
 * `requireSection`, like the rest of the admin area.
 *
 * `select('*')` everywhere: `rma_number` and `reason_code` ship in pending
 * 259 and are absent in production today. Naming them would 42703 the whole
 * read; reading the row and looking for them tolerates both schemas, and
 * the RMA is derived from the id when the column is not there.
 */

export const OPEN_RETURN_STATES: readonly RefundState[] = ['requested', 'approved', 'executing']

export interface ReturnRequest {
  id: string
  orderId: string
  rma: string
  state: RefundState
  ground: RefundGround
  reasonCode: ReturnReasonCode | null
  destination: ReturnDestination
  /** The customer's note, without the reason line the pre-259 fallback prepends. */
  note: string | null
  requestedAgorot: number
  grantedAgorot: number | null
  cancellationFeeAgorot: number
  requestedAt: string
  decidedAt: string | null
  completedAt: string | null
  /** The statutory 14-day deadline; derived when the row does not carry it. */
  refundDueBy: string
  internalNote: string | null
}

type RefundRow = Record<string, unknown>

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function int(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Math.trunc(Number(value))
  }
  return null
}

/**
 * Before 259 the code is folded into `reason_he` as its first line, as the
 * Hebrew label. Reading it back maps the label to the code so the account
 * page shows the same chip whether or not the column exists.
 */
function splitReason(reasonHe: string | null): {
  code: ReturnReasonCode | null
  note: string | null
} {
  if (!reasonHe) return { code: null, note: null }
  const [first, ...rest] = reasonHe.split('\n')
  const code = (Object.keys(RETURN_REASONS) as ReturnReasonCode[]).find(
    (c) => RETURN_REASONS[c].label === first?.trim(),
  )
  if (!code) return { code: null, note: reasonHe }
  const note = rest.join('\n').trim()
  return { code, note: note.length > 0 ? note : null }
}

export function returnFromRow(row: RefundRow): ReturnRequest | null {
  const id = str(row.id)
  const orderId = str(row.order_id)
  const requestedAt = str(row.requested_at) ?? str(row.created_at)
  const state = str(row.state) as RefundState | null
  const ground = str(row.ground) as RefundGround | null
  if (!id || !orderId || !requestedAt || !state || !ground) return null
  const split = splitReason(str(row.reason_he))
  const storedCode = row.reason_code
  const destination = row.destination
  return {
    id,
    orderId,
    rma: str(row.rma_number) ?? rmaNumber(id, requestedAt),
    state,
    ground,
    reasonCode: isReturnReasonCode(storedCode) ? storedCode : split.code,
    destination: isReturnDestination(destination) ? destination : 'original_method',
    note: split.note,
    requestedAgorot: int(row.requested_agorot) ?? 0,
    grantedAgorot: int(row.granted_agorot),
    cancellationFeeAgorot: int(row.cancellation_fee_agorot) ?? 0,
    requestedAt,
    decidedAt: str(row.decided_at),
    completedAt: str(row.completed_at),
    refundDueBy: str(row.refund_due_by) ?? refundDueBy(requestedAt).toISOString(),
    internalNote: str(row.internal_note),
  }
}

function rows(data: unknown): ReturnRequest[] {
  if (!Array.isArray(data)) return []
  return data
    .map((row) => returnFromRow(row as RefundRow))
    .filter((r): r is ReturnRequest => r !== null)
}

/** Every request of the signed-in customer, newest first. Owner-scoped by RLS. */
export async function getMyReturnRequests(): Promise<ReturnRequest[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('refunds')
    .select('*')
    .order('requested_at', { ascending: false })
  if (error) {
    log.warn('returns.my_requests_read_failed', { code: error.code ?? null })
    return []
  }
  return rows(data)
}

/** The latest request on one of the customer's orders, or null. */
export async function getMyReturnForOrder(orderId: string): Promise<ReturnRequest | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('refunds')
    .select('*')
    .eq('order_id', orderId)
    .order('requested_at', { ascending: false })
    .limit(1)
  if (error) {
    log.warn('returns.my_order_request_read_failed', { orderId, code: error.code ?? null })
    return null
  }
  return rows(data)[0] ?? null
}

/**
 * The open row (requested / approved / executing) for an order, on the
 * service role. The action uses it to refuse a second request, the admin
 * page to show the one awaiting a decision. The partial UNIQUE in 131
 * guarantees at most one.
 */
export async function getOpenReturnForOrder(orderId: string): Promise<ReturnRequest | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('refunds')
    .select('*')
    .eq('order_id', orderId)
    .in('state', [...OPEN_RETURN_STATES])
    .limit(1)
  if (error) {
    log.warn('returns.open_request_read_failed', { orderId, code: error.code ?? null })
    return null
  }
  return rows(data)[0] ?? null
}

export interface AdminReturnRequest extends ReturnRequest {
  customerEmail: string | null
  customerName: string | null
}

/** The admin queue: requests awaiting a decision, oldest notice first (the clock runs on it). */
export async function listReturnRequestsForAdmin(input: {
  states?: readonly RefundState[]
  limit?: number
}): Promise<AdminReturnRequest[]> {
  const admin = createAdminClient()
  const states = input.states ?? ['requested', 'approved']
  const { data, error } = await admin
    .from('refunds')
    .select('*')
    .in('state', [...states])
    .order('requested_at', { ascending: true })
    .limit(input.limit ?? 100)
  if (error) {
    log.warn('returns.admin_list_read_failed', { code: error.code ?? null })
    return []
  }
  const requests = rows(data)
  const userIds = [
    ...new Set(
      (Array.isArray(data) ? data : [])
        .map((row) => str((row as RefundRow).requested_by))
        .filter((v): v is string => v !== null),
    ),
  ]
  const profiles = new Map<string, { email: string | null; full_name: string | null }>()
  if (userIds.length > 0) {
    const { data: profileRows } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .in('id', userIds)
    for (const p of profileRows ?? [])
      profiles.set(p.id, { email: p.email, full_name: p.full_name })
  }
  const byRow = new Map<string, string | null>()
  for (const row of Array.isArray(data) ? (data as RefundRow[]) : []) {
    const id = str(row.id)
    if (id) byRow.set(id, str(row.requested_by))
  }
  return requests.map((r) => {
    const profile = profiles.get(byRow.get(r.id) ?? '')
    return {
      ...r,
      customerEmail: profile?.email ?? null,
      customerName: profile?.full_name ?? null,
    }
  })
}
