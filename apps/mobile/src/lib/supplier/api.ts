import { siteUrl } from '@/lib/config'
import { supabase } from '@/lib/supabase'
import {
  type QueuedScan,
  type ScanOutcome,
  clearSettled,
  enqueueScan,
  newIdempotencyKey,
  pendingScans,
} from '@/lib/supplier/queue'

/**
 * Everything the till says to the server.
 *
 * ONE RULE RUNS THROUGH ALL OF IT: the server decides, the device records. The
 * app never concludes that a voucher is valid, never decides a scan succeeded
 * because it looked right, and never removes an item from the queue on its own
 * judgement - only on a settled verdict that came back.
 */

export type SupplierContext = {
  supplier_id: string
  supplier_name: string
  scanning_enabled: boolean
  member_role: string
  staff_count: number
}

async function accessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

async function post<T>(path: string, body: unknown): Promise<{ status: number; data: T } | null> {
  const token = await accessToken()
  if (!token) return null
  try {
    const response = await fetch(siteUrl(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const data = (await response.json().catch(() => null)) as T
    return { status: response.status, data }
  } catch {
    // A network failure and a server refusal are different facts and the
    // callers below act on the difference, so this returns null rather than a
    // synthesised error response.
    return null
  }
}

/**
 * Who this device works for, and whether it may scan at all.
 *
 * Read through the RPC rather than by selecting `suppliers`: the flag is on a
 * table with a PUBLIC read policy, so a plain select would happily answer for a
 * business the device does not belong to and the screen would gate on the wrong
 * row. The function derives everything from `auth.uid()`'s membership.
 */
export async function loadSupplierContext(): Promise<SupplierContext | null> {
  const { data, error } = await supabase.rpc('supplier_app_context')
  if (error) return null
  const row = (data as SupplierContext[] | null)?.[0]
  return row ?? null
}

export type PinResult =
  | { ok: true; staff: { id: string; display_name: string } }
  | { ok: false; reason: 'invalid' | 'locked' | 'offline' }

export async function verifyPin(pin: string): Promise<PinResult> {
  const response = await post<{ ok: boolean; staff?: { id: string; display_name: string } }>(
    '/api/supplier/app/pin',
    { pin },
  )
  if (!response) return { ok: false, reason: 'offline' }
  if (response.status === 423) return { ok: false, reason: 'locked' }
  if (!response.data?.ok || !response.data.staff) return { ok: false, reason: 'invalid' }
  return { ok: true, staff: response.data.staff }
}

export type ScanResult =
  | { kind: 'settled'; outcome: string; message: string; replayed: boolean; code: string | null }
  | { kind: 'queued'; pending: number }

/**
 * One scan.
 *
 * ONLINE FIRST, AND THE FALLBACK IS QUEUEING - NEVER ASSUMING. If the request
 * does not come back, the scan is stored and the cashier is told it is waiting,
 * not told it succeeded. The difference matters at the counter: a customer whose
 * voucher was actually expired must not walk out having been shown a green tick.
 *
 * A SERVER VERDICT IS FINAL, INCLUDING A REFUSAL. `already_redeemed` and
 * `expired` are answers, so they are never queued for a retry that would return
 * the same answer forever.
 */
export async function submitScan(args: {
  qrPayload?: string
  code?: string
  scanMethod: 'camera' | 'manual'
  staffId?: string
  label: string
}): Promise<ScanResult> {
  // Minted before the request, so a retry of THIS scan reuses it and the
  // database collapses the two into one redemption.
  const idempotencyKey = newIdempotencyKey()

  const response = await post<{
    outcome: string
    message: string
    replayed?: boolean
    voucher?: { code?: string | null }
  }>('/api/supplier/vouchers/redeem', {
    qr_payload: args.qrPayload,
    code: args.code,
    scan_method: args.scanMethod,
    idempotency_key: idempotencyKey,
    staff_id: args.staffId,
  })

  if (response?.data?.outcome) {
    return {
      kind: 'settled',
      outcome: response.data.outcome,
      message: response.data.message,
      replayed: response.data.replayed === true,
      code: response.data.voucher?.code ?? args.code ?? null,
    }
  }

  const queued: QueuedScan = {
    idempotencyKey,
    code: args.code,
    qrPayload: args.qrPayload,
    scanMethod: args.scanMethod,
    staffId: args.staffId,
    scannedAt: new Date().toISOString(),
    label: args.label,
  }
  await enqueueScan(queued)
  return { kind: 'queued', pending: (await pendingScans()).length }
}

export type DrainSummary = {
  attempted: number
  settled: ScanOutcome[]
  stillPending: number
}

/**
 * Sends the queue and clears only what the server settled.
 *
 * Items that came back as `error` stay. Everything else - success, replay,
 * expired, not found, bad signature - is a decision that will not change on a
 * second ask, and keeping it would make the cashier watch it fail forever.
 */
export async function drainQueue(): Promise<DrainSummary | null> {
  const items = await pendingScans()
  if (items.length === 0) return { attempted: 0, settled: [], stillPending: 0 }

  // Matches the route's ceiling. A larger backlog drains over consecutive taps
  // rather than in one request that can time out and lose the lot.
  const batch = items.slice(0, 50)

  const response = await post<{ ok: boolean; results: ScanOutcome[]; settled: string[] }>(
    '/api/supplier/vouchers/redeem-batch',
    {
      items: batch.map((item) => ({
        code: item.code,
        qr_payload: item.qrPayload,
        scan_method: item.scanMethod,
        idempotency_key: item.idempotencyKey,
        staff_id: item.staffId,
        scanned_at: item.scannedAt,
      })),
    },
  )

  if (!response?.data?.ok) return null

  await clearSettled(response.data.settled ?? [])
  return {
    attempted: batch.length,
    settled: response.data.results ?? [],
    stillPending: (await pendingScans()).length,
  }
}

export type TodayScan = {
  id: string
  code_entered: string | null
  outcome: string
  created_at: string
  staff_id: string | null
}

/**
 * Today's scans, read straight from `voucher_redemptions` under the supplier
 * read policy that already exists. No endpoint, because adding one would be a
 * second place for "which rows may this supplier see" to be got wrong.
 *
 * The day boundary is the DEVICE's midnight. That is correct here and not
 * sloppy: the cashier's question is "what did we scan today", and today is
 * whatever the clock on the wall says.
 */
export async function loadTodayScans(): Promise<TodayScan[]> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('voucher_redemptions')
    .select('id, code_entered, outcome, created_at, staff_id')
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return []
  return (data ?? []) as TodayScan[]
}
