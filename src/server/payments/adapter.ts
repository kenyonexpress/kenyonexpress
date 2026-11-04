import { type PaymentProvider, getPaymentProvider, loadCardcomEnv } from '@/lib/payments'
import { SANDBOX_TERMINAL_NUMBER } from '@/lib/payments/accounts'
import type { CreateLowProfileInput, CreateLowProfileResult } from '@/lib/payments/types'
import {
  type SettlementEvent,
  type SettlementState,
  canTransition,
  transition,
} from '@/server/domain/orders/state-machine'
import type { Json } from '@/types/database'

/**
 * The payment adapter (S08): one entry point that says which provider is live,
 * whether a checkout may open on it, and the three guarded moves every caller
 * needs - open a payment, journal a callback exactly once, move an order line.
 *
 * It composes what already exists rather than replacing it. The provider is
 * still `getPaymentProvider`, the journal is still `payment_webhook_events`
 * (deduped on `(provider, external_event_id)`), the legal moves are still
 * `state-machine.ts`, and `finalize.ts` is still the only writer of
 * `payment_tokens`. What was missing was a single place that answers "are we
 * live or in sandbox, and may this checkout charge anyone", without throwing
 * when the production credentials are absent.
 */

export type PaymentMode = 'live' | 'sandbox'

export type PaymentModeReport = {
  mode: PaymentMode
  /** May a new payment be opened right now. False never means "the site is down". */
  checkoutAllowed: boolean
  /** Why checkout is closed, when it is; null when it is open or closed on purpose. */
  reason: string | null
  /** Credential names that are unset. Empty in live mode. */
  missing: string[]
}

const LIVE_CREDENTIALS = [
  'CARDCOM_TERMINAL_NUMBER',
  'CARDCOM_API_NAME',
  'CARDCOM_API_PASSWORD',
  'CARDCOM_WEBHOOK_SECRET',
] as const

/**
 * Live or sandbox, from the environment alone. NEVER throws.
 *
 * Sandbox is: the mock provider (no credentials, `CARDCOM_USE_MOCK=true`, or a
 * test run), or Cardcom's shared test terminal. A partial credential set that
 * `loadCardcomEnv` refuses is reported as sandbox with checkout closed, so a
 * status screen can name the missing variable instead of answering 500.
 */
export function resolvePaymentMode(source: NodeJS.ProcessEnv = process.env): PaymentModeReport {
  const missing = LIVE_CREDENTIALS.filter((name) => !source[name]?.trim())
  let env: ReturnType<typeof loadCardcomEnv>
  try {
    env = loadCardcomEnv(source)
  } catch (error) {
    return {
      mode: 'sandbox',
      checkoutAllowed: false,
      reason: `incomplete Cardcom credentials: ${(error as Error).message}`,
      missing,
    }
  }

  const sandboxTerminal =
    env.terminalNumber === SANDBOX_TERMINAL_NUMBER || source.CARDCOM_SANDBOX === 'true'
  const mode: PaymentMode = env.useMock || sandboxTerminal ? 'sandbox' : 'live'

  return {
    mode,
    checkoutAllowed: env.checkoutEnabled,
    reason: env.refusedReason,
    missing: mode === 'live' ? [] : missing,
  }
}

export type CreatePaymentResult =
  | { ok: true; mode: PaymentMode; lowProfile: CreateLowProfileResult }
  | { ok: false; mode: PaymentMode; code: 'CHECKOUT_DISABLED'; reason: string | null }
  | { ok: false; mode: PaymentMode; code: 'PROVIDER_FAILED'; reason: string }

/**
 * Open a hosted payment page, or refuse before the provider is called.
 *
 * The refusal is checked HERE and not only in `beginCheckout`, so no future
 * caller can open a page on a configuration that `resolvePaymentMode` closed.
 */
export async function createPayment(
  input: CreateLowProfileInput,
  deps: {
    source?: NodeJS.ProcessEnv
    provider?: PaymentProvider
    accountId?: string | null
  } = {},
): Promise<CreatePaymentResult> {
  const report = resolvePaymentMode(deps.source)
  if (!report.checkoutAllowed) {
    return { ok: false, mode: report.mode, code: 'CHECKOUT_DISABLED', reason: report.reason }
  }
  try {
    const provider = deps.provider ?? getPaymentProvider(deps.accountId)
    const lowProfile = await provider.createLowProfile(input)
    return { ok: true, mode: report.mode, lowProfile }
  } catch (error) {
    return {
      ok: false,
      mode: report.mode,
      code: 'PROVIDER_FAILED',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}

/** Postgres: unique_violation. The only insert failure that means "replay". */
const UNIQUE_VIOLATION = '23505'

export type WebhookJournalRow = {
  provider: 'cardcom'
  external_event_id: string
  signature_valid: boolean
  verified_against_api: boolean
  payload: Json
}

/** Structural, so tests write through a fake and callers keep their own client type. */
export type WebhookJournalClient = {
  from(table: 'payment_webhook_events'): {
    insert(row: WebhookJournalRow): PromiseLike<{
      error: { code?: string; message: string } | null
    }>
  }
}

export type WebhookJournalOutcome =
  | { kind: 'new' }
  | { kind: 'replay' }
  | { kind: 'failed'; code: string | null; message: string }

/**
 * Write the callback to the journal BEFORE acting on it. Idempotent by the
 * table's UNIQUE(provider, external_event_id).
 *
 * `replay` is a duplicate delivery: answer 200 and do nothing. `failed` is
 * anything else and MUST become a 5xx, so Cardcom retries; answering 200 there
 * loses a charged order with nothing left to replay it from.
 */
export async function journalWebhookEvent(
  admin: WebhookJournalClient,
  row: WebhookJournalRow,
): Promise<WebhookJournalOutcome> {
  const { error } = await admin.from('payment_webhook_events').insert(row)
  if (!error) return { kind: 'new' }
  if (error.code === UNIQUE_VIOLATION) return { kind: 'replay' }
  return { kind: 'failed', code: error.code ?? null, message: error.message }
}

export type GuardedTransition =
  | { ok: true; from: SettlementState; to: SettlementState }
  | { ok: false; from: SettlementState; event: SettlementEvent; code: 'ILLEGAL_TRANSITION' }

/** The state machine as a result instead of a throw, for callers on the money path. */
export function guardOrderTransition(
  from: SettlementState,
  event: SettlementEvent,
): GuardedTransition {
  if (!canTransition(from, event)) return { ok: false, from, event, code: 'ILLEGAL_TRANSITION' }
  return { ok: true, from, to: transition(from, event) }
}

/**
 * Should the hosted page mint a Cardcom token.
 *
 * The token is what makes the NEXT purchase one-click, so it is minted on the
 * first purchase made with a new card: whenever the shopper pays on the hosted
 * page and left "save card" on (the schema defaults it on). Charging an
 * existing token cannot mint another one. A 3DS fallback re-mints regardless,
 * because the saved card that sent us there demands a challenge on every
 * server-to-server charge. `finalize.ts` stores the token, verified through
 * GetLpResult, and never the card number.
 */
export function planTokenization(input: {
  saveCardOptIn: boolean
  chargingSavedToken: boolean
  threeDSFallback: boolean
}): boolean {
  if (input.threeDSFallback) return true
  if (input.chargingSavedToken) return false
  return input.saveCardOptIn
}
