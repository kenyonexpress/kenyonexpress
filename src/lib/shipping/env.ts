import { CARRIER_IDS, CARRIER_REGISTRY, type CarrierId } from '@/lib/shipping/carrier-registry'

/**
 * Carrier credentials, read off a passed-in env the way `loadCardcomEnv` is.
 *
 * THE DEFAULT IS THE MOCK, AND THAT IS A STATEMENT ABOUT WHAT IS KNOWN. None of
 * the three couriers publishes a developer contract: Israel Post hands out
 * keys by email against a whitelisted server IP, Chita and Yamit integrate
 * through account managers. No account exists for any of them on 2026-10-08,
 * so the HTTP adapter's wire shape (providers/http.ts) is a documented
 * assumption and not a measured fact. Until a real account answers a real
 * call, the mock is the only provider that can be trusted, and it is the one
 * every environment runs unless a carrier is explicitly configured.
 *
 * A carrier is "configured" only when its BASE URL and KEY are both set. Half
 * a configuration is treated as absent, same contract as Upstash and Axiom:
 * degrading to the mock is a quote that says "free, 3-7 days" and a label the
 * admin prints from our own PDF, never a 500 on the checkout.
 */

export interface CarrierCredentials {
  baseUrl: string
  apiKey: string
  /** Account / customer number some carriers want on every call; optional. */
  accountId: string | null
}

export interface ShippingEnv {
  /** True when every carrier call goes to the in-process mock. */
  useMock: boolean
  /** Per carrier: credentials when configured, null otherwise. */
  carriers: Record<CarrierId, CarrierCredentials | null>
  /** Milliseconds a carrier call may take before it is abandoned. */
  timeoutMs: number
}

const DEFAULT_TIMEOUT_MS = 8000

function trimmed(value: string | undefined): string | null {
  const t = value?.trim()
  return t ? t : null
}

function credentialsFor(prefix: string, source: NodeJS.ProcessEnv): CarrierCredentials | null {
  const baseUrl = trimmed(source[`${prefix}_API_BASE_URL`])
  const apiKey = trimmed(source[`${prefix}_API_KEY`])
  if (!baseUrl || !apiKey) return null
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    apiKey,
    accountId: trimmed(source[`${prefix}_ACCOUNT_ID`]),
  }
}

export function loadShippingEnv(source: NodeJS.ProcessEnv = process.env): ShippingEnv {
  const carriers = {} as Record<CarrierId, CarrierCredentials | null>
  for (const id of CARRIER_IDS) {
    carriers[id] = credentialsFor(CARRIER_REGISTRY[id].envPrefix, source)
  }
  const anyConfigured = CARRIER_IDS.some((id) => carriers[id] !== null)
  const useMock =
    source.SHIPPING_CARRIERS_USE_MOCK === 'true' || source.NODE_ENV === 'test' || !anyConfigured

  const parsedTimeout = Number.parseInt(source.SHIPPING_CARRIER_TIMEOUT_MS ?? '', 10)
  const timeoutMs =
    Number.isFinite(parsedTimeout) && parsedTimeout >= 1000 && parsedTimeout <= 30_000
      ? parsedTimeout
      : DEFAULT_TIMEOUT_MS

  return { useMock, carriers, timeoutMs }
}

/** The carriers a shopper can be offered: all of them under the mock, the configured ones otherwise. */
export function offeredCarrierIds(env: ShippingEnv): CarrierId[] {
  if (env.useMock) return [...CARRIER_IDS]
  return CARRIER_IDS.filter((id) => env.carriers[id] !== null)
}
