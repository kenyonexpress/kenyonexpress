import { generateUniqueVoucherCode, generateVoucherPin } from './code'
import { signVoucherQrPayload } from './qr'

/**
 * A gift claim retires the buyer's voucher and issues the recipient a new one.
 *
 * Until S10 a claim rewrote `vouchers.user_id` in place. The code and the
 * signed QR did not change, and both had been mailed to the BUYER in
 * `voucher_issued`, so the buyer could still present that mail at a counter
 * after the recipient claimed. Hiding the code on the buyer's screens
 * (`withholdGiftedCode`) did nothing about the mail.
 *
 * Now the buyer's row moves to `transferred`, a terminal state, and the
 * recipient's row is new: new code, new QR signed to the recipient, new 8-digit
 * pin. Same order line, same money snapshot, same `expires_at`: a transfer
 * moves ownership, never value or time.
 *
 * Both writes happen in `transfer_voucher_on_claim` (254), one transaction with
 * the source row locked, so a failure leaves the buyer's voucher exactly as it
 * was. The code and QR are made here because the QR's HMAC secret lives in the
 * application env and must not be in SQL.
 */

export type TransferOnClaimFailure = 'NOT_FOUND' | 'CLAIMED' | 'NOT_ISSUED' | 'EXPIRED' | 'FAILED'

export type TransferOnClaimResult =
  | { ok: true; voucherId: string; code: string; partnerPin: string }
  | { ok: false; code: TransferOnClaimFailure; detail?: string }

export interface TransferOnClaimInput {
  voucherId: string
  tokenHash: string
  newUserId: string
  /** From the source row: the new QR is bound to the same supplier and expiry. */
  supplierId: string
  expiresAt: Date
}

type RpcError = { code?: string; message?: string } | null

/** The slice of the admin client this needs, so it can be tested with a fake. */
export interface TransferOnClaimClient {
  from(table: 'vouchers'): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): { maybeSingle(): Promise<{ data: { id: string } | null; error: unknown }> }
    }
  }
  rpc(
    fn: 'transfer_voucher_on_claim',
    args: {
      p_voucher_id: string
      p_token_hash: string
      p_new_user_id: string
      p_code: string
      p_qr_payload: string
      p_qr_key_id: string
      p_partner_pin: string
    },
  ): PromiseLike<{ data: string | null; error: RpcError }>
}

const UNIQUE_VIOLATION = '23505'
const MAX_ATTEMPTS = 5

/** Maps the RAISE messages in 254 to the caller's vocabulary. */
export function classifyTransferError(error: NonNullable<RpcError>): TransferOnClaimFailure {
  const message = error.message ?? ''
  if (message.includes('voucher_not_found')) return 'NOT_FOUND'
  if (message.includes('gift_already_claimed')) return 'CLAIMED'
  if (message.includes('voucher_not_issued')) return 'NOT_ISSUED'
  if (message.includes('voucher_expired')) return 'EXPIRED'
  return 'FAILED'
}

export async function transferVoucherOnClaim(
  client: TransferOnClaimClient,
  input: TransferOnClaimInput,
): Promise<TransferOnClaimResult> {
  const keyId = process.env.VOUCHER_QR_KEY_ID ?? 'v1'
  const codeExists = async (code: string): Promise<boolean> => {
    const { data } = await client.from('vouchers').select('id').eq('code', code).maybeSingle()
    return data !== null
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const code = await generateUniqueVoucherCode(codeExists)
    const partnerPin = generateVoucherPin()
    const qrPayload = signVoucherQrPayload({
      c: code,
      s: input.supplierId,
      u: input.newUserId,
      e: Math.floor(input.expiresAt.getTime() / 1000),
      k: keyId,
    })

    const { data, error } = await client.rpc('transfer_voucher_on_claim', {
      p_voucher_id: input.voucherId,
      p_token_hash: input.tokenHash,
      p_new_user_id: input.newUserId,
      p_code: code,
      p_qr_payload: qrPayload,
      p_qr_key_id: keyId,
      p_partner_pin: partnerPin,
    })

    if (!error && data) return { ok: true, voucherId: data, code, partnerPin }
    // Code or pin raced another insert. The whole transaction rolled back, so
    // the buyer's row is untouched and drawing again is safe.
    if (error?.code === UNIQUE_VIOLATION) continue
    if (error) return { ok: false, code: classifyTransferError(error), detail: error.message }
    return { ok: false, code: 'FAILED', detail: 'transfer_voucher_on_claim returned no id' }
  }

  return { ok: false, code: 'FAILED', detail: `unique collision ${MAX_ATTEMPTS} times` }
}
