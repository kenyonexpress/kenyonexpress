import type { CostKind } from '@/lib/costs/model'

/**
 * The four providers this shop pays, and what each one would need before its
 * bill could be read automatically.
 *
 * MEASURED 2026-09-09: NONE OF THEM CAN BE PULLED TODAY. `src/lib/env.ts`
 * declares twenty-seven variables and not one is a billing credential. There is
 * no Vercel token (and no project link either -- the CLI is installed and
 * unauthenticated), no Supabase management key, no Upstash management API key,
 * and no Cloudflare token. The goal asked for the pull "where available", and
 * available is currently nowhere.
 *
 * SO THE MANUAL ENTRY IS NOT A FALLBACK. It is the working path, and this file
 * exists to say which credential would replace it rather than to imply the
 * automatic path is one flag away. Each entry names the exact variable and the
 * exact endpoint, so wiring one up later is a small, checkable change instead
 * of an afternoon of finding out that Upstash's REST token is for Redis data
 * and not for billing.
 *
 * WHY THE UPSTASH ENTRY IS THE ONE WORTH READING. `UPSTASH_REDIS_REST_TOKEN`
 * IS set in this project, and it is the obvious thing to reach for. It grants
 * access to the DATABASE, not to the account: billing is behind a separate
 * management API key from the Upstash console. A cost pull written against the
 * variable that happens to exist would 401 forever, and the natural next step
 * would be to assume the variable was wrong rather than that it was the wrong
 * kind of credential.
 */

export interface ProviderSpec {
  /** Stable key, and what `infra_costs.provider` holds. */
  id: 'vercel' | 'supabase' | 'upstash' | 'cloudflare' | 'twilio' | 'resend'
  label: string
  /**
   * Whether this provider's bill is a subscription or accrues with use.
   *
   * The default `kind` for a line entered against this provider. A manual entry
   * may override it, because a plan can carry both -- a Vercel Pro seat is
   * fixed and its bandwidth overage is not.
   */
  defaultKind: CostKind
  /** The env var whose absence is why this cannot be pulled. */
  credentialEnvVar: string
  /** Where the number would come from, so nobody has to search for it. */
  endpoint: string
  /** The thing worth knowing before writing the client. */
  note: string
}

export const PROVIDERS: readonly ProviderSpec[] = [
  {
    id: 'vercel',
    label: 'Vercel',
    defaultKind: 'fixed',
    credentialEnvVar: 'VERCEL_API_TOKEN',
    endpoint: 'GET https://api.vercel.com/v1/teams/{teamId}/billing',
    note: 'There is no project link here either: the CLI is installed and unauthenticated, so even a token would need the team and project ids supplying separately.',
  },
  {
    id: 'supabase',
    label: 'Supabase',
    defaultKind: 'fixed',
    credentialEnvVar: 'SUPABASE_MANAGEMENT_TOKEN',
    endpoint: 'GET https://api.supabase.com/v1/organizations/{slug}/billing/subscription',
    note: 'NOT the service role key. That one is scoped to the database and cannot see an invoice; the management token is issued from the Supabase account settings.',
  },
  {
    id: 'upstash',
    label: 'Upstash',
    defaultKind: 'variable',
    credentialEnvVar: 'UPSTASH_MANAGEMENT_API_KEY',
    endpoint: 'GET https://api.upstash.com/v2/redis/database/{id}',
    note: 'NOT UPSTASH_REDIS_REST_TOKEN, which IS set here and grants access to the DATABASE rather than the account. A pull written against it 401s forever.',
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    defaultKind: 'variable',
    credentialEnvVar: 'CLOUDFLARE_API_TOKEN',
    endpoint:
      'GraphQL https://api.cloudflare.com/client/v4/graphql (R2 storage + Class A/B operations)',
    note: 'R2 bills on storage and on two classes of operation, so a single number needs three figures added together; the dashboard total is the simpler manual entry.',
  },
  {
    id: 'twilio',
    label: 'Twilio',
    defaultKind: 'variable',
    credentialEnvVar: 'TWILIO_AUTH_TOKEN',
    endpoint: 'local: sum(sms_messages.price_micro)',
    note: 'THE ONE COST THIS SYSTEM ALREADY MEASURES EXACTLY, per message, from the delivery receipts 216 stores. It needs no API call: the number is in our own table and is the real spend rather than a plan.',
  },
  {
    id: 'resend',
    label: 'Resend',
    defaultKind: 'variable',
    credentialEnvVar: 'RESEND_API_KEY',
    endpoint: 'no billing endpoint; the dashboard only',
    note: 'Resend publishes no usage or billing API. This one can never be automated and is manual by the vendor’s design, not by ours.',
  },
]

export type ProviderId = ProviderSpec['id']

export interface ProviderAvailability {
  id: ProviderId
  label: string
  /** True when the credential exists. Never true today; see the header. */
  canPull: boolean
  /** Why not, phrased for somebody deciding whether to go and get a token. */
  reason: string
}

/**
 * Which providers could be pulled with the environment as it stands.
 *
 * It reports on the CREDENTIAL and makes no network call. A function that
 * tried the endpoint to find out would turn a page render into six outbound
 * requests that all fail the same way.
 */
export function providerAvailability(env: NodeJS.ProcessEnv = process.env): ProviderAvailability[] {
  return PROVIDERS.map((provider) => {
    const value = env[provider.credentialEnvVar]
    const present = typeof value === 'string' && value.trim() !== ''

    // Twilio is the exception in both directions: its credential IS usually
    // present, and it needs no billing API anyway because 216 records the real
    // per-message price locally.
    if (provider.id === 'twilio') {
      return {
        id: provider.id,
        label: provider.label,
        canPull: true,
        reason: 'measured locally from sms_messages.price_micro, not from an API',
      }
    }

    return {
      id: provider.id,
      label: provider.label,
      canPull: present,
      reason: present
        ? `${provider.credentialEnvVar} is set`
        : `${provider.credentialEnvVar} is not set — ${provider.note}`,
    }
  })
}

/** The spec for one provider, or null. */
export function providerById(id: string): ProviderSpec | null {
  return PROVIDERS.find((provider) => provider.id === id) ?? null
}
