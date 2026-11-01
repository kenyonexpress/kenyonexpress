/**
 * Per-batch inventory of printed QR codes, computed from the code rows.
 *
 * 217's header promised the sweep would buy "truthful inventory: an admin
 * counting unspent codes in a batch does not count dead ones". This is that
 * count. It reads the code rows (not `coupon_qr_batches.quantity`, which is
 * what was ASKED for, not what is left) and answers four numbers per batch.
 *
 * `expired` includes codes past `expires_at` that the nightly sweep has not
 * stamped yet, so the table does not show a code as available for the hours
 * between its deadline and the sweep. `redeem_coupon_qr` refuses them under
 * its own lock either way; this only keeps the screen from disagreeing.
 */

export type QrCodeInventoryRow = {
  batch_id: string
  expires_at: string | null
  expired_at: string | null
  redeemed_at: string | null
}

export type QrBatchInventory = {
  total: number
  redeemed: number
  expired: number
  available: number
  /** The deadline the batch was printed with, when every code shares one. */
  expires_at: string | null
}

export const EMPTY_INVENTORY: QrBatchInventory = {
  total: 0,
  redeemed: 0,
  expired: 0,
  available: 0,
  expires_at: null,
}

export function isCodeExpired(
  row: Pick<QrCodeInventoryRow, 'expires_at' | 'expired_at'>,
  now: Date,
): boolean {
  if (row.expired_at) return true
  if (!row.expires_at) return false
  return new Date(row.expires_at).getTime() <= now.getTime()
}

export function summarizeQrBatches(
  rows: QrCodeInventoryRow[],
  now: Date = new Date(),
): Map<string, QrBatchInventory> {
  const out = new Map<string, QrBatchInventory>()
  const deadlines = new Map<string, Set<string | null>>()

  for (const row of rows) {
    const current = out.get(row.batch_id) ?? { ...EMPTY_INVENTORY }
    current.total += 1
    if (row.redeemed_at) {
      current.redeemed += 1
    } else if (isCodeExpired(row, now)) {
      current.expired += 1
    } else {
      current.available += 1
    }
    out.set(row.batch_id, current)

    const seen = deadlines.get(row.batch_id) ?? new Set<string | null>()
    seen.add(row.expires_at)
    deadlines.set(row.batch_id, seen)
  }

  // One shared deadline is the batch's deadline; a mixed batch (which the
  // generator never produces) shows none rather than an arbitrary one.
  for (const [batchId, seen] of deadlines) {
    const inventory = out.get(batchId)
    if (!inventory) continue
    inventory.expires_at = seen.size === 1 ? ([...seen][0] ?? null) : null
  }

  return out
}
