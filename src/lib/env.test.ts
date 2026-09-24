import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Boot-time environment validation. The module runs at import, so each case
 * stubs the environment and imports a fresh copy. What is proven is which
 * environments refuse to boot and with what message, and which are waved
 * through with a warning.
 */

const logWarn = vi.fn()
const findings = vi.fn<() => { variable: string; key: { prefix: string } }[]>(() => [])

vi.mock('@/lib/observability/log', () => ({
  log: { warn: (...a: unknown[]) => logWarn(...a), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/compromised-keys', () => ({
  scanEnvironmentForCompromisedKeys: () => findings(),
  compromisedKeyMessage: (f: { variable: string }) => `compromised:${f.variable}`,
}))

const PRODUCTION_COMPLETE: Record<string, string> = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-that-is-long-enough',
  SUPABASE_SECRET_KEY: 'sb_secret_that_is_long_enough',
  CARDCOM_TERMINAL_NUMBER: '1000',
  CARDCOM_API_NAME: 'api',
  CARDCOM_API_PASSWORD: 'pw',
  CARDCOM_WEBHOOK_SECRET: 'hook',
  VOUCHER_QR_SECRET: 'qr',
  CRON_SECRET: 'cron',
}

const CLEARED = [
  ...Object.keys(PRODUCTION_COMPLETE),
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_READ_REPLICA_URL',
  'CARDCOM_SANDBOX',
  'ALLOW_INCOMPLETE_ENV',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'CF_ASYNC_WORKER_URL',
  'CF_ASYNC_WORKER_SECRET',
  'WISHLIST_UNSUB_SECRET',
  'SENTRY_DSN',
  'TELEGRAM_BOT_TOKEN',
  'UPTIMEROBOT_WEBHOOK_SECRET',
  'AXIOM_TOKEN',
  'VERCEL',
  'VERCEL_ENV',
]

function stubAll(values: Record<string, string | undefined>): void {
  for (const key of CLEARED) vi.stubEnv(key, undefined)
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value)
}

async function boot() {
  vi.resetModules()
  return import('./env')
}

beforeEach(() => {
  logWarn.mockReset()
  findings.mockReset()
  findings.mockReturnValue([])
  stubAll({ NODE_ENV: 'test' })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('outside production', () => {
  it('boots with nothing set and exposes the parsed environment', async () => {
    const { env } = await boot()
    expect(env.NODE_ENV).toBe('test')
    expect(env.CRON_SECRET).toBeUndefined()
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('still refuses a secret under a NEXT_PUBLIC_ prefix, which is already in the bundle', async () => {
    vi.stubEnv('NEXT_PUBLIC_CARDCOM_API_PASSWORD', 'oops')
    await expect(boot()).rejects.toThrow(
      /refusing to boot: NEXT_PUBLIC_CARDCOM_API_PASSWORD would be inlined/,
    )
  })

  it('still refuses a malformed optional value', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'not a url')
    await expect(boot()).rejects.toThrow(/invalid environment/)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    await expect(boot()).resolves.toBeDefined()
  })

  it('warns about a compromised key on a laptop instead of refusing', async () => {
    findings.mockReturnValue([{ variable: 'SUPABASE_SECRET_KEY', key: { prefix: 'sb_secret_Gd' } }])
    await expect(boot()).resolves.toBeDefined()
    expect(logWarn).toHaveBeenCalledWith('env.compromised_key', {
      variable: 'SUPABASE_SECRET_KEY',
      detail: 'compromised:SUPABASE_SECRET_KEY',
    })
  })
})

describe('in production', () => {
  it('names every missing required variable at once', async () => {
    stubAll({ NODE_ENV: 'production' })
    const error = await boot().catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain('invalid environment')
    for (const key of [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'CARDCOM_TERMINAL_NUMBER',
      'CARDCOM_API_NAME',
      'CARDCOM_API_PASSWORD',
      'CARDCOM_WEBHOOK_SECRET',
      'VOUCHER_QR_SECRET',
      'CRON_SECRET',
    ]) {
      expect(message).toContain(`${key} is required in production`)
    }
    expect(message).toContain('one of SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY is required')
  })

  it('boots when everything is set, and accepts the service role key as the admin key', async () => {
    stubAll(PRODUCTION_COMPLETE)
    await expect(boot()).resolves.toBeDefined()

    stubAll({
      ...PRODUCTION_COMPLETE,
      SUPABASE_SECRET_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key-that-is-at-least-forty-chars-long',
    })
    const { env } = await boot()
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe('service-role-key-that-is-at-least-forty-chars-long')
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('refuses a sandbox terminal, because real orders would settle against nothing', async () => {
    stubAll({ ...PRODUCTION_COMPLETE, CARDCOM_SANDBOX: 'true' })
    await expect(boot()).rejects.toThrow(/CARDCOM_SANDBOX must not be true in production/)
    stubAll({ ...PRODUCTION_COMPLETE, CARDCOM_SANDBOX: 'false' })
    await expect(boot()).resolves.toBeDefined()
  })

  it('waives the checks for a local next start, loudly', async () => {
    stubAll({ NODE_ENV: 'production', ALLOW_INCOMPLETE_ENV: 'true' })
    const { env } = await boot()
    expect(env.ALLOW_INCOMPLETE_ENV).toBe('true')
    expect(logWarn).toHaveBeenCalledWith('env.checks_skipped', {
      detail: expect.stringContaining('ALLOW_INCOMPLETE_ENV=true'),
    })
  })

  it('refuses to boot a deployment on a compromised key', async () => {
    stubAll({ ...PRODUCTION_COMPLETE, VERCEL: '1' })
    findings.mockReturnValue([{ variable: 'CRON_SECRET', key: { prefix: 'x' } }])
    await expect(boot()).rejects.toThrow(/refusing to boot: compromised:CRON_SECRET/)
  })

  it('treats a waived local next start as not deployed, so the same key only warns', async () => {
    stubAll({ NODE_ENV: 'production', ALLOW_INCOMPLETE_ENV: 'true' })
    findings.mockReturnValue([{ variable: 'CRON_SECRET', key: { prefix: 'x' } }])
    await expect(boot()).resolves.toBeDefined()
    expect(logWarn).toHaveBeenCalledWith('env.compromised_key', expect.anything())
  })
})
