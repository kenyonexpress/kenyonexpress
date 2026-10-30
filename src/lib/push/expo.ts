/**
 * The Expo Push Service client.
 *
 * WHY EXPO AND NOT APNs/FCM DIRECTLY. Talking to Apple needs a p8 key and a JWT
 * refreshed every hour; talking to Google needs a service account. Expo already
 * holds both credentials for the app that was built with its credentials, and
 * exposes one HTTPS endpoint that fans out to whichever transport a token
 * belongs to. The cost is one hop; the saving is two credential lifecycles that
 * nobody here is going to rotate on time.
 *
 * WHAT A TICKET IS AND IS NOT. `/push/send` returns a TICKET per message, not a
 * delivery. A ticket with `status: 'ok'` means Expo accepted the message and
 * will attempt it; the real outcome lands later in a RECEIPT, fetched by ticket
 * id. This module returns tickets and classifies the errors that arrive with
 * them, because those are the ones that say something about the TOKEN - above
 * all `DeviceNotRegistered`, which is the app being uninstalled and the only
 * signal that a stored token should stop being used.
 *
 * NO API KEY IS NOT A FAILURE. Expo accepts unauthenticated sends for most
 * projects, so the absence of `EXPO_ACCESS_TOKEN` is normal and not a skip. The
 * skip that does exist is `PUSH_ENABLED`: with push turned off, or with no
 * tokens to send to, this returns `skipped` and the caller must NOT count an
 * attempt. Same distinction the notification outbox already draws for Resend.
 */

/** Expo's documented ceiling for one request. Larger arrays are chunked. */
export const EXPO_PUSH_CHUNK = 100

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export type ExpoPushMessage = {
  to: string
  title: string
  body: string
  /** Arbitrary JSON the app reads on tap. Carries the deep link path. */
  data?: Record<string, unknown>
  sound?: 'default' | null
  badge?: number
  /** Android channel; must match a channel the app created. */
  channelId?: string
  priority?: 'default' | 'normal' | 'high'
}

export type ExpoTicket =
  | { status: 'ok'; id: string; to: string }
  | { status: 'error'; to: string; message: string; code: string | null }

export type ExpoSendResult =
  | { ok: true; tickets: ExpoTicket[]; invalidTokens: string[] }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; reason: string }

/**
 * Shape check only. It does not prove the token is live - only Expo can say
 * that - but it catches the two things that actually happen: an emulator
 * handing back a placeholder, and a device id being stored in the token column.
 */
export function isExpoPushToken(value: unknown): value is string {
  if (typeof value !== 'string') return false
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value.trim())
}

export function chunkPushMessages(
  messages: readonly ExpoPushMessage[],
  size: number = EXPO_PUSH_CHUNK,
): ExpoPushMessage[][] {
  const step = Math.max(1, Math.floor(size))
  const chunks: ExpoPushMessage[][] = []
  for (let i = 0; i < messages.length; i += step) {
    chunks.push(messages.slice(i, i + step))
  }
  return chunks
}

/**
 * The error codes that mean "this token is dead, stop storing it". Everything
 * else - a rate limit, a provider outage, a malformed message - is about this
 * ATTEMPT and must be retried rather than used to disable a customer's device.
 */
const DEAD_TOKEN_CODES = new Set(['DeviceNotRegistered', 'InvalidCredentials'])

export function isDeadTokenCode(code: string | null | undefined): boolean {
  return code !== null && code !== undefined && DEAD_TOKEN_CODES.has(code)
}

type RawTicket = {
  status?: string
  id?: string
  message?: string
  details?: { error?: string } | null
}

/**
 * Pairs Expo's positional ticket array back to the tokens that produced it.
 * Expo guarantees order and length; a response that breaks either is treated as
 * a transport failure rather than silently mis-attributing an error to the
 * wrong device.
 */
export function parseTickets(
  raw: unknown,
  sentTo: readonly string[],
): { tickets: ExpoTicket[]; invalidTokens: string[] } | null {
  const data = (raw as { data?: unknown } | null)?.data
  if (!Array.isArray(data) || data.length !== sentTo.length) return null

  const tickets: ExpoTicket[] = []
  const invalidTokens: string[] = []

  for (let i = 0; i < data.length; i++) {
    const entry = (data[i] ?? {}) as RawTicket
    const to = sentTo[i] as string
    if (entry.status === 'ok' && typeof entry.id === 'string') {
      tickets.push({ status: 'ok', id: entry.id, to })
      continue
    }
    const code = entry.details?.error ?? null
    tickets.push({
      status: 'error',
      to,
      message: entry.message ?? 'unknown push error',
      code,
    })
    if (isDeadTokenCode(code)) invalidTokens.push(to)
  }

  return { tickets, invalidTokens }
}

/** Push is off unless explicitly on, so a misconfigured preview cannot notify real customers. */
export function pushEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PUSH_ENABLED === 'true' || env.PUSH_ENABLED === '1'
}

/**
 * Sends a batch. Never throws: every caller is a queue drain that has to record
 * an outcome for the row either way.
 */
export async function sendExpoPush(
  messages: readonly ExpoPushMessage[],
  options: { accessToken?: string; fetchImpl?: typeof fetch } = {},
): Promise<ExpoSendResult> {
  if (!pushEnabled()) return { ok: false, skipped: true, reason: 'push disabled' }
  if (messages.length === 0) return { ok: false, skipped: true, reason: 'no recipients' }

  const doFetch = options.fetchImpl ?? fetch
  const accessToken = options.accessToken ?? process.env.EXPO_ACCESS_TOKEN
  const tickets: ExpoTicket[] = []
  const invalidTokens: string[] = []

  for (const chunk of chunkPushMessages(messages)) {
    const sentTo = chunk.map((m) => m.to)
    let response: Response
    try {
      response = await doFetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(chunk),
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'network error'
      return { ok: false, skipped: false, reason }
    }

    if (!response.ok) {
      return { ok: false, skipped: false, reason: `expo push HTTP ${response.status}` }
    }

    const body = await response.json().catch(() => null)
    const parsed = parseTickets(body, sentTo)
    if (!parsed) {
      return { ok: false, skipped: false, reason: 'expo push returned an unreadable ticket array' }
    }
    tickets.push(...parsed.tickets)
    invalidTokens.push(...parsed.invalidTokens)
  }

  return { ok: true, tickets, invalidTokens }
}
