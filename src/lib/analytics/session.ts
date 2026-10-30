// Client-side analytics session.
//
// Note on anonymous_id: the design doc has the SDK send it from the
// ke_session_id cookie. That cookie is httpOnly (src/lib/cart/guest-session.ts),
// so the browser cannot read it. The /api/a route reads it server-side and
// stamps anonymous_id itself, which is strictly better: the client can neither
// see nor forge another visitor's guest id. Only session_id is client-owned.

export const SESSION_STORAGE_KEY = 'ke_a_session'
export const SESSION_IDLE_MS = 30 * 60 * 1000 // rolling 30-minute session

// Web Vitals are sampled per session, not per event, so a sampled session
// reports every metric it produces and p75 stays comparable across routes.
export const WEB_VITALS_SAMPLE_RATE = 0.25

export type AnalyticsSession = {
  id: string
  expiresAt: number
  /** Decided once, when the session is created. */
  sampleWebVitals: boolean
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

function parse(raw: string | null): AnalyticsSession | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<AnalyticsSession>
    if (typeof value.id !== 'string' || !value.id) return null
    if (typeof value.expiresAt !== 'number') return null
    return {
      id: value.id,
      expiresAt: value.expiresAt,
      sampleWebVitals: value.sampleWebVitals === true,
    }
  } catch {
    return null
  }
}

/**
 * Returns the live session, creating or rotating it as needed, and extends the
 * idle window. `random` and `now` are injected so the rotation and sampling
 * rules are testable without faking globals.
 */
export function touchSession(
  storage: StorageLike,
  now: number = Date.now(),
  random: () => number = Math.random,
): AnalyticsSession {
  const existing = parse(storage.getItem(SESSION_STORAGE_KEY))
  const session: AnalyticsSession =
    existing && existing.expiresAt > now
      ? { ...existing, expiresAt: now + SESSION_IDLE_MS }
      : {
          id: newSessionId(),
          expiresAt: now + SESSION_IDLE_MS,
          sampleWebVitals: random() < WEB_VITALS_SAMPLE_RATE,
        }

  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  return session
}
