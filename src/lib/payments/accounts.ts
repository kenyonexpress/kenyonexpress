/**
 * Cardcom account registry.
 *
 * Cardcom has no OAuth and no per-request account scoping: every call carries a
 * TerminalNumber plus an ApiName, and money-moving calls add an ApiPassword.
 * Which terminal a call names is therefore the whole of "which account is this".
 *
 * The platform is the merchant of record (docs/CARDCOM-ARCHITECTURE.md section
 * 2): it clears everything on its own terminal and pays suppliers out. A second
 * terminal only enters the picture for an anchor supplier that clears directly.
 * That is why `platform` is mandatory and everything else is optional.
 *
 * The rule that forces this to be a registry rather than one set of env vars:
 * **a token created on terminal A cannot be charged on terminal B**, and the
 * same is true of a Low Profile id. Every stored artefact has to remember which
 * account produced it, or the re-verify call goes to the wrong terminal and
 * reports "not found" for a payment that really happened. `payments` and
 * `payment_tokens` carry `cardcom_account_id` for exactly this.
 */

export const PLATFORM_ACCOUNT_ID = 'platform'

/** Cardcom's shared test terminal (docs section 1: card 4580000000000000). */
export const SANDBOX_TERMINAL_NUMBER = '1000'

export type CardcomAccount = {
  /** Stable key stored on payments.cardcom_account_id. Never reuse an id. */
  id: string
  label: string
  terminalNumber: string
  apiName: string
  apiPassword: string
  /**
   * Test credentials. Not a different code path - the endpoints are identical.
   * It exists so a sandbox terminal cannot quietly serve real customers.
   */
  sandbox: boolean
}

export class CardcomAccountError extends Error {
  readonly code: 'UNKNOWN_ACCOUNT' | 'INVALID_CONFIG' | 'SANDBOX_IN_PRODUCTION'
  constructor(code: CardcomAccountError['code'], message: string) {
    super(message)
    this.name = 'CardcomAccountError'
    this.code = code
  }
}

export interface CardcomAccountRegistry {
  /** The merchant of record. Always present. */
  readonly platform: CardcomAccount
  /** Resolves an id; `null` / `undefined` means the platform account. */
  get(id?: string | null): CardcomAccount
  list(): CardcomAccount[]
}

type RawAccount = {
  id?: unknown
  label?: unknown
  terminalNumber?: unknown
  apiName?: unknown
  apiPassword?: unknown
  sandbox?: unknown
}

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

/**
 * A terminal number is Cardcom's account identity, and 1000 is their shared
 * test terminal. Treating it as sandbox regardless of what the flag says turns
 * "someone pasted the test terminal into production env" from a silent
 * no-money-ever-arrives outage into a startup error.
 */
function isSandbox(terminalNumber: string, flag: unknown): boolean {
  if (terminalNumber === SANDBOX_TERMINAL_NUMBER) return true
  return flag === true || flag === 'true'
}

function parseExtraAccounts(raw: string | undefined): RawAccount[] {
  if (!raw || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new CardcomAccountError('INVALID_CONFIG', 'CARDCOM_ACCOUNTS is not valid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new CardcomAccountError('INVALID_CONFIG', 'CARDCOM_ACCOUNTS must be a JSON array')
  }
  return parsed as RawAccount[]
}

function buildAccount(raw: RawAccount, index: number): CardcomAccount {
  const id = text(raw.id)
  const terminalNumber = text(raw.terminalNumber)
  const apiName = text(raw.apiName)
  if (!id || !terminalNumber || !apiName) {
    throw new CardcomAccountError(
      'INVALID_CONFIG',
      `CARDCOM_ACCOUNTS[${index}] needs id, terminalNumber and apiName`,
    )
  }
  if (id === PLATFORM_ACCOUNT_ID) {
    throw new CardcomAccountError(
      'INVALID_CONFIG',
      `CARDCOM_ACCOUNTS[${index}] may not redefine the '${PLATFORM_ACCOUNT_ID}' account; it comes from CARDCOM_TERMINAL_NUMBER`,
    )
  }
  return {
    id,
    label: text(raw.label) ?? id,
    terminalNumber,
    apiName,
    // Only refunds and other money-back calls need it; a charge-only account
    // is legitimately configured without one.
    apiPassword: text(raw.apiPassword) ?? '',
    sandbox: isSandbox(terminalNumber, raw.sandbox),
  }
}

/**
 * Builds the registry from env.
 *
 *   CARDCOM_TERMINAL_NUMBER / CARDCOM_API_NAME / CARDCOM_API_PASSWORD
 *     the platform account.
 *   CARDCOM_SANDBOX=true
 *     marks the platform account as test credentials.
 *   CARDCOM_ACCOUNTS
 *     JSON array of additional accounts:
 *     [{"id":"supplier-x","terminalNumber":"12345","apiName":"...","apiPassword":"..."}]
 *
 * `mock` is what the caller already decided from loadCardcomEnv().useMock; it
 * lets tests and local dev build a registry without real credentials.
 */
export function loadCardcomAccounts(
  source: NodeJS.ProcessEnv = process.env,
  options: { mock?: boolean } = {},
): CardcomAccountRegistry {
  const mock = options.mock ?? false
  const terminalNumber = text(source.CARDCOM_TERMINAL_NUMBER) ?? (mock ? 'mock-terminal' : null)
  const apiName = text(source.CARDCOM_API_NAME) ?? (mock ? 'mock-api' : null)

  if (!terminalNumber || !apiName) {
    throw new CardcomAccountError(
      'INVALID_CONFIG',
      'CARDCOM_TERMINAL_NUMBER and CARDCOM_API_NAME are required for the platform account',
    )
  }

  const platform: CardcomAccount = {
    id: PLATFORM_ACCOUNT_ID,
    label: text(source.CARDCOM_PLATFORM_LABEL) ?? 'KenyonExpress',
    terminalNumber,
    apiName,
    apiPassword: text(source.CARDCOM_API_PASSWORD) ?? (mock ? 'mock-password' : ''),
    sandbox: mock || isSandbox(terminalNumber, source.CARDCOM_SANDBOX),
  }

  const accounts = new Map<string, CardcomAccount>([[platform.id, platform]])
  for (const [index, raw] of parseExtraAccounts(source.CARDCOM_ACCOUNTS).entries()) {
    const account = buildAccount(raw, index)
    if (accounts.has(account.id)) {
      throw new CardcomAccountError(
        'INVALID_CONFIG',
        `CARDCOM_ACCOUNTS[${index}] duplicates account id '${account.id}'`,
      )
    }
    accounts.set(account.id, account)
  }

  // A sandbox terminal in production takes no money and issues no vouchers
  // worth anything, and it looks exactly like success from the outside. Fail at
  // load rather than at the first customer. CARDCOM_ALLOW_SANDBOX=true is the
  // deliberate escape hatch for a production-like staging deploy.
  const allowSandbox = source.CARDCOM_ALLOW_SANDBOX === 'true'
  if (source.NODE_ENV === 'production' && !mock && !allowSandbox) {
    const offenders = [...accounts.values()].filter((a) => a.sandbox)
    if (offenders.length > 0) {
      throw new CardcomAccountError(
        'SANDBOX_IN_PRODUCTION',
        `refusing to start: sandbox Cardcom credentials in production (${offenders
          .map((a) => a.id)
          .join(', ')}). Set CARDCOM_ALLOW_SANDBOX=true if this is intentional.`,
      )
    }
  }

  return {
    platform,
    get(id?: string | null): CardcomAccount {
      if (id === null || id === undefined || id === '') return platform
      const account = accounts.get(id)
      if (!account) {
        throw new CardcomAccountError(
          'UNKNOWN_ACCOUNT',
          `unknown Cardcom account '${id}'; known: ${[...accounts.keys()].join(', ')}`,
        )
      }
      return account
    },
    list(): CardcomAccount[] {
      return [...accounts.values()]
    },
  }
}
