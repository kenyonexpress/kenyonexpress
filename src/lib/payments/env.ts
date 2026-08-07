export type CardcomEnv = {
  terminalNumber: string
  apiName: string
  apiPassword: string
  /** The secret put into every NEW IndicatorUrl. Only this one is ever handed out. */
  webhookSecret: string
  /**
   * The secret being retired, accepted on the way IN and never handed out.
   *
   * WHY ROTATION NEEDS TWO
   *
   * `?s=<secret>` is the only thing authenticating a Cardcom callback — there is
   * no HMAC and no signature header, measured and recorded in [50]'s brief.
   * The secret is baked into the IndicatorUrl at the moment a Low Profile page
   * is created, so at any instant there are live payment pages in shoppers'
   * browsers carrying the OLD one. Replacing the variable with a single new
   * value drops every one of those callbacks, and drops them the way this route
   * used to drop everything: with a 200, so Cardcom never retries.
   *
   * With two, a rotation is: set PREVIOUS to the current value, set the current
   * to the new one, and remove PREVIOUS once the longest checkout has expired.
   * Same shape as `VOUCHER_QR_SECRET_PREVIOUS`, which already exists here for
   * the same reason.
   */
  webhookSecretPrevious: string | null
  appUrl: string
  checkoutEnabled: boolean
  useMock: boolean
}

/**
 * Every secret a callback may present, current first.
 *
 * Empty strings are dropped rather than compared: `?s=` with no value must not
 * match an unset PREVIOUS, which is the direction that turns a missing variable
 * into an open endpoint.
 */
export function acceptedWebhookSecrets(env: CardcomEnv): string[] {
  return [env.webhookSecret, env.webhookSecretPrevious].filter(
    (secret): secret is string => typeof secret === 'string' && secret.length > 0,
  )
}

/** Trimmed, or null. Whitespace is absence: `CARDCOM_WEBHOOK_SECRET_PREVIOUS=" "` must not become a secret a caller can guess. */
function optional(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env: ${name}`)
  }
  return value.trim()
}

/**
 * Load Cardcom-related env. When CARDCOM_USE_MOCK=true (tests/dev), secrets may be placeholders.
 */
export function loadCardcomEnv(source: NodeJS.ProcessEnv = process.env): CardcomEnv {
  const useMock =
    source.CARDCOM_USE_MOCK === 'true' ||
    source.NODE_ENV === 'test' ||
    (!source.CARDCOM_TERMINAL_NUMBER && source.NODE_ENV !== 'production')

  // Fail closed in production, open everywhere else.
  //
  // This read `!== 'false'`, so a MISSING or empty variable enabled checkout.
  // GO-LIVE lists that as a launch blocker for the obvious reason: the one
  // deployment where somebody forgets to set it is the one taking real cards,
  // and the failure is silent in the direction that charges people.
  //
  // Outside production the default stays open, because a developer running the
  // mock provider should not have to set a variable to see a checkout, and no
  // real card can be charged there.
  const checkoutEnabled =
    source.NODE_ENV === 'production'
      ? source.CHECKOUT_ENABLED === 'true'
      : source.CHECKOUT_ENABLED !== 'false'

  if (useMock) {
    return {
      terminalNumber: source.CARDCOM_TERMINAL_NUMBER ?? 'mock-terminal',
      apiName: source.CARDCOM_API_NAME ?? 'mock-api',
      apiPassword: source.CARDCOM_API_PASSWORD ?? 'mock-password',
      webhookSecret: source.CARDCOM_WEBHOOK_SECRET ?? 'mock-webhook-secret',
      webhookSecretPrevious: optional(source.CARDCOM_WEBHOOK_SECRET_PREVIOUS),
      appUrl: source.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      checkoutEnabled,
      useMock: true,
    }
  }

  return {
    terminalNumber: required('CARDCOM_TERMINAL_NUMBER', source.CARDCOM_TERMINAL_NUMBER),
    apiName: required('CARDCOM_API_NAME', source.CARDCOM_API_NAME),
    apiPassword: required('CARDCOM_API_PASSWORD', source.CARDCOM_API_PASSWORD),
    webhookSecret: required('CARDCOM_WEBHOOK_SECRET', source.CARDCOM_WEBHOOK_SECRET),
    webhookSecretPrevious: optional(source.CARDCOM_WEBHOOK_SECRET_PREVIOUS),
    appUrl: required('NEXT_PUBLIC_APP_URL', source.NEXT_PUBLIC_APP_URL),
    checkoutEnabled,
    useMock: false,
  }
}
