import { describe, expect, it } from 'vitest'
import {
  CardcomAccountError,
  PLATFORM_ACCOUNT_ID,
  SANDBOX_TERMINAL_NUMBER,
  loadCardcomAccounts,
} from './accounts'

const LIVE_ENV = {
  CARDCOM_TERMINAL_NUMBER: '172204',
  CARDCOM_API_NAME: 'live-api',
  CARDCOM_API_PASSWORD: 'live-password',
} as unknown as NodeJS.ProcessEnv

const EXTRA = JSON.stringify([
  { id: 'anchor-supplier', terminalNumber: '990001', apiName: 'anchor-api', apiPassword: 'pw' },
])

describe('loadCardcomAccounts', () => {
  it('always exposes the platform account, and resolves it for a missing id', () => {
    const registry = loadCardcomAccounts(LIVE_ENV)
    expect(registry.platform.id).toBe(PLATFORM_ACCOUNT_ID)
    expect(registry.platform.terminalNumber).toBe('172204')
    expect(registry.get()).toBe(registry.platform)
    expect(registry.get(null)).toBe(registry.platform)
    expect(registry.get('')).toBe(registry.platform)
  })

  it('adds accounts from CARDCOM_ACCOUNTS and keeps them addressable by id', () => {
    const registry = loadCardcomAccounts({ ...LIVE_ENV, CARDCOM_ACCOUNTS: EXTRA })
    expect(registry.list().map((a) => a.id)).toEqual([PLATFORM_ACCOUNT_ID, 'anchor-supplier'])
    expect(registry.get('anchor-supplier').terminalNumber).toBe('990001')
    // Label defaults to the id rather than to the platform's label, so an
    // admin screen cannot show two accounts both called "KenyonExpress".
    expect(registry.get('anchor-supplier').label).toBe('anchor-supplier')
  })

  it('throws UNKNOWN_ACCOUNT rather than silently charging the platform terminal', () => {
    const registry = loadCardcomAccounts(LIVE_ENV)
    try {
      registry.get('supplier-that-left')
      expect.unreachable('unknown account must throw')
    } catch (error) {
      expect(error).toBeInstanceOf(CardcomAccountError)
      expect((error as CardcomAccountError).code).toBe('UNKNOWN_ACCOUNT')
    }
  })

  it('rejects config that redefines the platform account', () => {
    expect(() =>
      loadCardcomAccounts({
        ...LIVE_ENV,
        CARDCOM_ACCOUNTS: JSON.stringify([
          { id: PLATFORM_ACCOUNT_ID, terminalNumber: '1', apiName: 'x' },
        ]),
      }),
    ).toThrowError(CardcomAccountError)
  })

  it('rejects duplicate ids, malformed JSON and incomplete entries', () => {
    const dupe = JSON.stringify([
      { id: 'a', terminalNumber: '1', apiName: 'x' },
      { id: 'a', terminalNumber: '2', apiName: 'y' },
    ])
    expect(() => loadCardcomAccounts({ ...LIVE_ENV, CARDCOM_ACCOUNTS: dupe })).toThrowError(
      /duplicates account id/,
    )
    expect(() => loadCardcomAccounts({ ...LIVE_ENV, CARDCOM_ACCOUNTS: '{oops' })).toThrowError(
      /not valid JSON/,
    )
    expect(() =>
      loadCardcomAccounts({ ...LIVE_ENV, CARDCOM_ACCOUNTS: JSON.stringify({ id: 'a' }) }),
    ).toThrowError(/must be a JSON array/)
    expect(() =>
      loadCardcomAccounts({
        ...LIVE_ENV,
        CARDCOM_ACCOUNTS: JSON.stringify([{ id: 'a', apiName: 'x' }]),
      }),
    ).toThrowError(/needs id, terminalNumber and apiName/)
  })

  it('requires platform credentials when not mocking', () => {
    expect(() => loadCardcomAccounts({} as unknown as NodeJS.ProcessEnv)).toThrowError(
      /CARDCOM_TERMINAL_NUMBER and CARDCOM_API_NAME are required/,
    )
    // Mock mode is what lets dev and tests build a registry with no secrets.
    const mocked = loadCardcomAccounts({} as unknown as NodeJS.ProcessEnv, { mock: true })
    expect(mocked.platform.sandbox).toBe(true)
    expect(mocked.platform.terminalNumber).toBe('mock-terminal')
  })

  it('infers sandbox from the shared test terminal, whatever the flag says', () => {
    const registry = loadCardcomAccounts({
      ...LIVE_ENV,
      CARDCOM_TERMINAL_NUMBER: SANDBOX_TERMINAL_NUMBER,
      CARDCOM_SANDBOX: 'false',
    })
    expect(registry.platform.sandbox).toBe(true)
  })

  it('honours CARDCOM_SANDBOX for a real terminal number', () => {
    expect(loadCardcomAccounts({ ...LIVE_ENV, CARDCOM_SANDBOX: 'true' }).platform.sandbox).toBe(
      true,
    )
    expect(loadCardcomAccounts(LIVE_ENV).platform.sandbox).toBe(false)
  })

  it('refuses to start in production with sandbox credentials', () => {
    const env = {
      ...LIVE_ENV,
      NODE_ENV: 'production',
      CARDCOM_TERMINAL_NUMBER: SANDBOX_TERMINAL_NUMBER,
    } as unknown as NodeJS.ProcessEnv
    try {
      loadCardcomAccounts(env)
      expect.unreachable('sandbox credentials in production must throw')
    } catch (error) {
      expect((error as CardcomAccountError).code).toBe('SANDBOX_IN_PRODUCTION')
    }
    // The escape hatch exists for production-like staging.
    expect(() => loadCardcomAccounts({ ...env, CARDCOM_ALLOW_SANDBOX: 'true' })).not.toThrow()
  })

  it('catches a sandbox terminal hiding among the extra accounts', () => {
    const env = {
      ...LIVE_ENV,
      NODE_ENV: 'production',
      CARDCOM_ACCOUNTS: JSON.stringify([
        { id: 'anchor', terminalNumber: SANDBOX_TERMINAL_NUMBER, apiName: 'x' },
      ]),
    } as unknown as NodeJS.ProcessEnv
    expect(() => loadCardcomAccounts(env)).toThrowError(/anchor/)
  })
})
