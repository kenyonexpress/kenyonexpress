/**
 * Rules for handing a coupon to another customer. Pure, so the action and the
 * list page agree on what "transferable" means. The database function
 * `transfer_voucher` (migration 314) re-checks all of it under a row lock.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normaliseTransferEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase()
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null
}

export function isTransferable(
  voucher: { status: string; expires_at: string },
  now: Date = new Date(),
): boolean {
  if (voucher.status !== 'issued') return false
  const expires = Date.parse(voucher.expires_at)
  return Number.isFinite(expires) && expires > now.getTime()
}
