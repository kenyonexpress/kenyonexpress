import { z } from 'zod'

/**
 * Cardcom Low Profile webhook payload (superset-tolerant).
 * Field names follow Cardcom's form-encoded callback conventions.
 *
 * `ResponseCode` IS OPTIONAL, and that is measured rather than lenient. The
 * legacy `IndicatorUrl` call carries `terminalnumber`, `lowprofilecode` and
 * `Operation` and nothing else: Cardcom's own article says "the parameters you
 * will get are terminalnumber and lowprofilecode", and the two public
 * integrations checked on 08.10.2026 (sheltermanager/asm3, thebarlev/app.ux)
 * both read exactly those and then ask the terminal what happened. A schema
 * that required a verdict field refused every real indicator as "unparsed",
 * which answered 200 and finalized nothing. The verdict, when it is absent,
 * comes from `GetLpResult`, which the route has to call anyway.
 */
export const cardcomWebhookPayloadSchema = z
  .object({
    terminalnumber: z.coerce.number(),
    lowprofilecode: z.string().min(1),
    Operation: z.string().optional(),
    ResponseCode: z.coerce.number().optional(),
    /** The indicator's own two verdict fields, when a terminal is configured to send them. */
    OperationResponse: z.coerce.number().optional(),
    DealResponse: z.coerce.number().optional(),
    InternalDealNumber: z.coerce.string().optional(),
    Amount: z.coerce.number().optional(),
    Token: z.string().optional(),
    CardValidityMonth: z.coerce.number().optional(),
    CardValidityYear: z.coerce.number().optional(),
    Last4CardDigits: z.coerce.string().optional(),
    CardBrand: z.coerce.string().optional(),
    ReturnValue: z.string().optional(),
  })
  .passthrough()

export type CardcomWebhookPayload = z.infer<typeof cardcomWebhookPayloadSchema>

/**
 * What the callback itself claims, before anything is verified.
 *
 * `failure` is the only verdict the route acts on without asking the terminal:
 * a declined card is marked failed and Cardcom is never called about it.
 * `success` and `unknown` both go to `GetLpResult`, because neither is trusted
 * for money; the difference is only how a verify that says "not charged" is
 * read afterwards: a contradiction worth an alarm when the callback claimed
 * success, an ordinary decline when the callback claimed nothing.
 */
export type CardcomCallbackVerdict = 'success' | 'failure' | 'unknown'

export function cardcomCallbackVerdict(payload: CardcomWebhookPayload): CardcomCallbackVerdict {
  const codes = [payload.ResponseCode, payload.OperationResponse, payload.DealResponse].filter(
    (code): code is number => typeof code === 'number' && Number.isFinite(code),
  )
  if (codes.length === 0) return 'unknown'
  return codes.every((code) => code === 0) ? 'success' : 'failure'
}

/** True only when the callback carries a verdict and every verdict field says 0. */
export function isCardcomSuccess(payload: CardcomWebhookPayload): boolean {
  return cardcomCallbackVerdict(payload) === 'success'
}

/** The query key that carries OUR secret; it is authentication, not payload. */
export const CARDCOM_WEBHOOK_SECRET_PARAM = 's'

/**
 * The callback as a flat object, from whichever shape Cardcom delivered it in.
 *
 * Three shapes arrive at the IndicatorUrl, and the old route read one of them:
 *
 *   GET  ?s=…&terminalnumber=…&lowprofilecode=…     the legacy indicator (measured)
 *   POST application/x-www-form-urlencoded           asm3 parses the body with parse_qs
 *   POST application/json                            the mock and every test
 *
 * Precedence is body over query: a key present in both is taken from the body,
 * so a GET that for some reason also posts a body cannot have its deal number
 * overridden by a query string an attacker controls more easily. The secret
 * parameter is dropped from the merge so it is never journalled in `payload`.
 * A body that is neither JSON nor form-encoded is kept under `raw`, which is
 * what makes a scanner's garbage fail the schema rather than crash the route.
 */
export function parseCardcomCallback(
  rawBody: string,
  query: URLSearchParams,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const [key, value] of query.entries()) {
    if (key === CARDCOM_WEBHOOK_SECRET_PARAM) continue
    merged[key] = value
  }

  const body = rawBody.trim()
  if (body.length === 0) return merged

  const asJson = tryJsonObject(body)
  if (asJson) return { ...merged, ...asJson }

  if (looksFormEncoded(body)) {
    for (const [key, value] of new URLSearchParams(body).entries()) {
      if (key === CARDCOM_WEBHOOK_SECRET_PARAM) continue
      merged[key] = value
    }
    return merged
  }

  return { ...merged, raw: rawBody }
}

function tryJsonObject(text: string): Record<string, unknown> | null {
  if (!text.startsWith('{')) return null
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

/**
 * `key=value(&key=value)*` and nothing else. `URLSearchParams` would happily
 * read the word "garbage" as a key with an empty value, which would make a
 * scanner's body look like a half-formed callback instead of noise.
 */
function looksFormEncoded(text: string): boolean {
  return /^[^=&\s]+=[^&\s]*(&[^=&\s]+=[^&\s]*)*$/.test(text)
}
