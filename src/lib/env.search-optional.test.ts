import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * S36. Meilisearch is optional at boot, in every shape it can arrive in.
 *
 * `lib/env.ts` validates on import and throws, so each case stubs a complete
 * PRODUCTION environment (the only mode in which anything is required), then
 * imports the module fresh and asserts the import itself resolves.
 */

const warn = vi.fn()

vi.mock('@/lib/observability/log', () => ({
  log: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const REQUIRED: Record<string, string> = {
  NODE_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-long-enough-for-the-schema',
  SUPABASE_SECRET_KEY: 'secret-key-long-enough-for-the-schema',
  CARDCOM_TERMINAL_NUMBER: '123456',
  CARDCOM_API_NAME: 'api-name',
  CARDCOM_API_PASSWORD: 'api-password',
  CARDCOM_WEBHOOK_SECRET: 'webhook-secret',
  CARDCOM_SANDBOX: 'false',
  VOUCHER_QR_SECRET: 'voucher-secret',
  CRON_SECRET: 'cron-secret',
  ALLOW_INCOMPLETE_ENV: '',
}

async function boot(search: { host?: string; key?: string }) {
  vi.stubEnv('MEILISEARCH_HOST', search.host as string)
  vi.stubEnv('MEILISEARCH_API_KEY', search.key as string)
  vi.resetModules()
  return (await import('./env')).env
}

function searchWarnings(): string[] {
  return warn.mock.calls.map(([event]) => event as string).filter((e) => e.startsWith('env.search'))
}

beforeEach(() => {
  warn.mockClear()
  for (const [key, value] of Object.entries(REQUIRED)) vi.stubEnv(key, value)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('boot with Meilisearch optional', () => {
  it('boots in production with both unset, and says nothing', async () => {
    const env = await boot({})
    expect(env.MEILISEARCH_HOST).toBeUndefined()
    expect(env.MEILISEARCH_API_KEY).toBeUndefined()
    expect(searchWarnings()).toEqual([])
  })

  it('boots with both empty strings', async () => {
    await expect(boot({ host: '', key: '' })).resolves.toBeDefined()
    expect(searchWarnings()).toEqual([])
  })

  it('boots with both set, and says nothing', async () => {
    const env = await boot({ host: 'https://search.example.com', key: 'k' })
    expect(env.MEILISEARCH_HOST).toBe('https://search.example.com')
    expect(searchWarnings()).toEqual([])
  })

  it('boots with only the host, and warns once that the key is missing', async () => {
    await expect(boot({ host: 'https://search.example.com' })).resolves.toBeDefined()
    expect(warn).toHaveBeenCalledWith(
      'env.search_half_configured',
      expect.objectContaining({ missing: 'MEILISEARCH_API_KEY' }),
    )
    expect(searchWarnings()).toHaveLength(1)
  })

  it('boots with only the key, and warns once that the host is missing', async () => {
    await expect(boot({ key: 'k' })).resolves.toBeDefined()
    expect(warn).toHaveBeenCalledWith(
      'env.search_half_configured',
      expect.objectContaining({ missing: 'MEILISEARCH_HOST' }),
    )
    expect(searchWarnings()).toHaveLength(1)
  })

  it('boots with a host that is not a URL, and warns instead of refusing', async () => {
    await expect(boot({ host: 'search.example.com', key: 'k' })).resolves.toBeDefined()
    expect(searchWarnings()).toEqual(['env.search_host_malformed'])
  })

  it('still refuses a production boot that is missing a required secret', async () => {
    vi.stubEnv('CRON_SECRET', '')
    await expect(boot({})).rejects.toThrow('CRON_SECRET is required in production')
  })
})
