import { compromisedKeyMessage, scanEnvironmentForCompromisedKeys } from '@/lib/compromised-keys'
import { log } from '@/lib/observability/log'
import { z } from 'zod'

/**
 * Boot-time environment validation.
 *
 * WHY THIS EXISTS. loadCardcomEnv() throws `Missing required env` at REQUEST
 * time, so a deploy with a missing secret builds, goes green, and fails on the
 * first customer who tries to pay. Validation here runs from
 * instrumentation.ts register(), which Next calls before the server accepts a
 * request, so the same mistake fails the boot instead.
 */

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(40).optional(),
    SUPABASE_SECRET_KEY: z.string().min(20).optional(),

    CARDCOM_TERMINAL_NUMBER: z.string().optional(),
    CARDCOM_API_NAME: z.string().optional(),
    CARDCOM_API_PASSWORD: z.string().optional(),
    CARDCOM_WEBHOOK_SECRET: z.string().optional(),
    CARDCOM_SANDBOX: z.string().optional(),

    /**
     * The rate limiter's primary backend. OPTIONAL ON PURPOSE, and not because
     * it is unimportant: no environment this repo can see sets it today, and
     * `lib/rate-limit/limiter.ts` falls back to the Postgres `check_rate_limit`
     * the app already shipped with. Requiring it here would mean this branch
     * refuses to boot everywhere it is not provisioned yet, which is how a
     * security improvement lands as an outage.
     *
     * Both must be set for the Upstash path to engage; either one alone is
     * treated as absent, so a half-finished configuration degrades to Postgres
     * rather than failing every request.
     */
    UPSTASH_REDIS_REST_URL: z.string().url().optional().or(z.literal('')),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional().or(z.literal('')),
    /** Milliseconds. Defaults to 1000 in `lib/rate-limit/upstash.ts`. */
    UPSTASH_REDIS_REST_TIMEOUT_MS: z.string().optional(),

    VOUCHER_QR_SECRET: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    SENTRY_DSN: z.string().url().optional().or(z.literal('')),

    /** See the superRefine below. Only ever "true" on a developer's machine. */
    ALLOW_INCOMPLETE_ENV: z.string().optional(),
  })
  .superRefine((e, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (e.NODE_ENV !== 'production') return

    // `next start` on a laptop is ALSO NODE_ENV=production, and that is not a
    // detail: it is how the Lighthouse runs and the whole Playwright suite are
    // measured, because both must run against the real build rather than dev.
    // Without this escape hatch this file refuses to boot that server over
    // missing Cardcom secrets, and the observability merge silently takes the
    // E2E suite and the performance numbers with it. Verified, not assumed —
    // `pnpm start` answered 500 on every route with
    // "An error occurred while loading instrumentation hook".
    //
    // The waiver is opt-in, per-environment and loud. Vercel never sets it, so
    // a real deploy still refuses to serve a checkout it cannot charge through;
    // setting it there is an explicit act, not an omission, which is the
    // distinction NODE_ENV alone cannot make.
    if (e.ALLOW_INCOMPLETE_ENV === 'true') return

    for (const k of [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'CARDCOM_TERMINAL_NUMBER',
      'CARDCOM_API_NAME',
      'CARDCOM_API_PASSWORD',
      'CARDCOM_WEBHOOK_SECRET',
      'VOUCHER_QR_SECRET',
      'CRON_SECRET',
    ] as const) {
      if (!e[k]) fail(`${k} is required in production`)
    }

    if (!e.SUPABASE_SERVICE_ROLE_KEY && !e.SUPABASE_SECRET_KEY) {
      fail('one of SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY is required')
    }

    // The check that justifies the whole file. Sandbox left on in production
    // means real orders settle against a test terminal: the shop looks healthy,
    // customers are charged nothing, and the money never arrives anywhere.
    if (e.CARDCOM_SANDBOX === 'true') {
      fail('CARDCOM_SANDBOX must not be true in production')
    }
  })

/**
 * A secret exposed to the browser is not a warning, it is a leak that already
 * happened at build time: NEXT_PUBLIC_* is inlined into the client bundle.
 * Refusing to boot is the only response that helps.
 */
/**
 * A KNOWN-EXPOSED KEY MUST NOT SERVE PRODUCTION TRAFFIC.
 *
 * This throws, unlike `env-probe.ts`, and the difference is deliberate: the
 * probe makes a network call and a transient DNS failure must not become an
 * outage, while this is a hash comparison that cannot be wrong for an
 * environmental reason. If the digest matches, the key is the exposed one, and
 * the correct response is to refuse to serve.
 *
 * Outside production it warns instead. The exposed key is still the working key
 * for local development against this project until it is rotated, and bricking
 * every developer's `pnpm dev` over a credential they cannot rotate themselves
 * is how a security control gets commented out.
 */
function assertNoCompromisedKeys(isProduction: boolean): void {
  const findings = scanEnvironmentForCompromisedKeys()
  if (findings.length === 0) return

  for (const finding of findings) {
    const message = compromisedKeyMessage(finding)
    if (isProduction) throw new Error(`refusing to boot: ${message}`)
    log.warn('env.compromised_key', { variable: finding.variable, detail: message })
  }
}

function assertNoPublicSecrets(): void {
  const LEAKY = /^NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY)/i
  for (const key of Object.keys(process.env)) {
    if (LEAKY.test(key)) {
      throw new Error(
        `refusing to boot: ${key} would be inlined into the client bundle. Remove the NEXT_PUBLIC_ prefix.`,
      )
    }
  }
}

assertNoPublicSecrets()

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const detail = parsed.error.issues.map((i) => `  - ${i.message}`).join('\n')
  throw new Error(`invalid environment:\n${detail}`)
}

// Loud, because a silent waiver is the same hole this file was written to
// close. It is one line at boot, not per request.
if (parsed.data.NODE_ENV === 'production' && parsed.data.ALLOW_INCOMPLETE_ENV === 'true') {
  log.warn('env.checks_skipped', {
    detail:
      'ALLOW_INCOMPLETE_ENV=true. Correct for a local `next start`; wrong anywhere a customer can reach.',
  })
}

// After parsing, so the thrown message names a real NODE_ENV rather than
// guessing at one, and so a malformed environment fails on its own terms first.
assertNoCompromisedKeys(parsed.data.NODE_ENV === 'production')

export const env = parsed.data
export type Env = typeof env
