// scripts/seed/lib/voucher.mjs
//
// Voucher short codes and signed QR payloads, in the exact formats the running
// application already agrees on:
//
//   code       10 symbols of Crockford base32 without I, L, O, U, matching both
//              src/server/domain/vouchers/code.ts and the database CHECK
//              vouchers_code_format (^[0-9A-HJKMNP-TV-Z]{10}$).
//   qr_payload KEV1.<base64url(json)>.<base64url(HMAC-SHA256)>, matching
//              src/server/domain/vouchers/qr.ts, so a payload this seed writes
//              verifies in the supplier scanner without any special case.
//
// WHY THE CODES ARE DERIVED AND NOT RANDOM
//
// The application mints codes with randomBytes, because a guessable code is a
// free redemption at the counter. The seed derives them instead, by HMAC over
// the fixture key, so that a rebuild produces the same code for the same
// voucher and a test can assert on it. That is a deliberate trade the seed can
// make and the application cannot: these vouchers are worth nothing, they exist
// only on a development database, and guard.mjs refuses to write them anywhere
// that real ones live.
//
// The QR secret is the one input that is still read from the environment. It
// must match the VOUCHER_QR_SECRET of the app you are pointing at the seeded
// database, or the scanner will reject every seeded QR as unsigned. Unlike the
// connection string, putting it on the command line would leak it into shell
// history, which is the whole reason it is a secret.

import { createHmac } from 'node:crypto'

export const VOUCHER_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const VOUCHER_CODE_LENGTH = 10
export const VOUCHER_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/

const ALPHABET_SIZE = VOUCHER_CODE_ALPHABET.length // 32
const REJECTION_CEILING = 256 - (256 % ALPHABET_SIZE)

/**
 * The secret a development stack uses when none is configured. Public on
 * purpose: it is written here so that a developer who has not set
 * VOUCHER_QR_SECRET still gets scannable demo vouchers, and so that the value
 * they must copy into .env.local is stated in one place.
 */
export const DEV_QR_SECRET = 'ke-seed-development-voucher-qr-secret'

export function resolveQrSecret(env = process.env) {
  const configured = env.VOUCHER_QR_SECRET
  if (configured && configured.length >= 16) {
    return { secret: configured, isDevFallback: false }
  }
  return { secret: DEV_QR_SECRET, isDevFallback: true }
}

/**
 * A deterministic code for one fixture key. Rejection sampling over whole
 * bytes, exactly as the application does it, so the symbol distribution is the
 * same and no symbol is favoured by a modulo of a raw byte.
 */
export function deriveVoucherCode(seedSecret, key) {
  let code = ''
  let counter = 0
  while (code.length < VOUCHER_CODE_LENGTH) {
    const digest = createHmac('sha256', seedSecret).update(`${key}#${counter}`).digest()
    for (const byte of digest) {
      if (code.length >= VOUCHER_CODE_LENGTH) break
      if (byte >= REJECTION_CEILING) continue
      code += VOUCHER_CODE_ALPHABET[byte % ALPHABET_SIZE]
    }
    counter += 1
  }
  if (!VOUCHER_CODE_PATTERN.test(code)) {
    throw new Error(`derived an invalid voucher code "${code}" for ${key}`)
  }
  return code
}

/**
 * KEV1.<payload>.<mac>. The MAC covers the version prefix as well, so the
 * version cannot be swapped without breaking the signature.
 */
export function signQrPayload(secret, { code, supplierId, userId, expiresAt, keyId = 'v1' }) {
  const payload = {
    v: 1,
    c: code,
    s: supplierId,
    u: userId,
    e: Math.floor(new Date(expiresAt).getTime() / 1000),
    k: keyId,
  }
  if (!Number.isSafeInteger(payload.e) || payload.e <= 0) {
    throw new TypeError(`voucher ${code} has an unusable expiry: ${expiresAt}`)
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signingInput = `KEV1.${body}`
  const mac = createHmac('sha256', secret).update(signingInput).digest('base64url')
  return `${signingInput}.${mac}`
}

/** `XXXXX-XXXXX`, for anything that prints a code. Never stored. */
export function formatVoucherCode(code) {
  return `${code.slice(0, 5)}-${code.slice(5)}`
}
