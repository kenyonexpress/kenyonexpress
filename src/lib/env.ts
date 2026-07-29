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

    VOUCHER_QR_SECRET: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    SENTRY_DSN: z.string().url().optional().or(z.literal('')),
  })
  .superRefine((e, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (e.NODE_ENV !== 'production') return

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

export const env = parsed.data
export type Env = typeof env
