import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * One-time backup codes for the staff MFA (G6, 05.11.2026).
 *
 * WHAT A CODE DOES HERE, STATED PLAINLY. Supabase's native MFA has no backup
 * code concept: only a verified factor can lift a session to aal2. A backup
 * code therefore cannot sign an admin in at aal2. What it can do, and what
 * `redeemBackupCode` does, is prove the account owner without the lost
 * authenticator and RESET the factor: every TOTP factor is removed, the
 * session stays aal1, and the gate sends the person to enrol a new one. That
 * is recovery, not a second factor, and the UI says so.
 *
 * STORAGE. Hashes live in `auth.users.app_metadata.mfa_backup` (server-only,
 * never in the JWT's user_metadata, never editable by the user), written with
 * the admin client. No table, no migration: `migrations/pending/` cannot be
 * applied without approval, and a feature whose table is not live is a
 * feature that does not exist.
 *
 * FORMAT. Eight codes of ten characters from an alphabet without 0/O/1/I,
 * shown once as `XXXXX-XXXXX`; compared after normalising case and dashes.
 * Hash is sha256(salt || code) with a per-user 16-byte salt: the codes are
 * 50 bits each, so a rainbow table over the alphabet is cheap without the
 * salt and pointless with it.
 */

export const BACKUP_CODE_COUNT = 8
export const BACKUP_CODE_LENGTH = 10
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type BackupCodeStore = {
  /** hex, 16 bytes */
  salt: string
  /** sha256 hex per unused code; a redeemed code is removed, never marked. */
  hashes: string[]
  issued_at: string
}

export function normalizeBackupCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function formatBackupCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`
}

function randomCode(): string {
  let out = ''
  // Rejection sampling keeps every character equally likely; 32 symbols fit
  // in 5 bits so one byte masked to 0..31 is unbiased.
  while (out.length < BACKUP_CODE_LENGTH) {
    const byte = randomBytes(1)[0] as number
    out += ALPHABET[byte & 31] as string
  }
  return out
}

export function hashBackupCode(code: string, saltHex: string): string {
  return createHash('sha256')
    .update(Buffer.from(saltHex, 'hex'))
    .update(normalizeBackupCode(code))
    .digest('hex')
}

/** Fresh codes (plaintext, to show ONCE) and the store to persist. */
export function generateBackupCodes(
  now: Date = new Date(),
  count: number = BACKUP_CODE_COUNT,
): { codes: string[]; store: BackupCodeStore } {
  const salt = randomBytes(16).toString('hex')
  const codes = Array.from({ length: count }, randomCode)
  return {
    codes: codes.map(formatBackupCode),
    store: {
      salt,
      hashes: codes.map((c) => hashBackupCode(c, salt)),
      issued_at: now.toISOString(),
    },
  }
}

export type RedeemResult =
  | { ok: true; store: BackupCodeStore; remaining: number }
  | { ok: false; reason: 'no_codes' | 'no_match' }

/** Consumes one code. The returned store no longer contains it. */
export function redeemFromStore(
  store: BackupCodeStore | null | undefined,
  input: string,
): RedeemResult {
  if (!store || !Array.isArray(store.hashes) || store.hashes.length === 0) {
    return { ok: false, reason: 'no_codes' }
  }
  const code = normalizeBackupCode(input)
  if (code.length !== BACKUP_CODE_LENGTH) return { ok: false, reason: 'no_match' }
  const given = Buffer.from(hashBackupCode(code, store.salt), 'hex')
  // Every stored hash is compared, no early exit, so the response time says
  // nothing about which position (if any) matched.
  let matchIndex = -1
  store.hashes.forEach((hash, index) => {
    const stored = Buffer.from(hash, 'hex')
    if (stored.length === given.length && timingSafeEqual(stored, given)) matchIndex = index
  })
  if (matchIndex < 0) return { ok: false, reason: 'no_match' }
  const hashes = store.hashes.filter((_, index) => index !== matchIndex)
  return { ok: true, store: { ...store, hashes }, remaining: hashes.length }
}

/** Parses whatever sits in app_metadata; anything malformed reads as "no codes". */
export function parseBackupCodeStore(value: unknown): BackupCodeStore | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.salt !== 'string' || !/^[0-9a-f]{32}$/.test(v.salt)) return null
  if (!Array.isArray(v.hashes) || !v.hashes.every((h) => typeof h === 'string')) return null
  return {
    salt: v.salt,
    hashes: v.hashes as string[],
    issued_at: typeof v.issued_at === 'string' ? v.issued_at : '',
  }
}
