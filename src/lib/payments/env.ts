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
  /**
   * Set when checkout was forced off because the MOCK provider was configured
   * on the customer-facing deployment. Null on every healthy configuration.
   *
   * Carried as a field rather than only logged so the admin status screen and
   * the launch gate can state the reason instead of reporting a generic
   * "checkout disabled", which is the same string an operator sees when they
   * turned it off on purpose.
   */
  refusedReason: string | null
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

  /**
   * THE MOCK PROVIDER MAY NOT SERVE THE PRODUCTION DEPLOYMENT.
   *
   * Measured on 2026-09-10 against the Vercel project that actually serves
   * https://www.kenyonexpress.co.il: `CARDCOM_USE_MOCK="true"` and
   * `CHECKOUT_ENABLED="true"` were both set, and none of
   * CARDCOM_TERMINAL_NUMBER, CARDCOM_API_NAME or CARDCOM_API_PASSWORD existed
   * in any environment of any of the three projects.
   *
   * Read together with the block below, that configuration was not "checkout is
   * broken". `getPaymentProvider` returns the shared mock whenever `useMock` is
   * true, the mock approves on the happy path, and `checkoutEnabled` was true -
   * so a shopper on the real domain could complete a checkout, have NO card
   * charged, and have the order finalize and issue a voucher. The failure was
   * silent and in the direction that gives goods away.
   *
   * The guard is scoped to VERCEL_ENV === 'production' rather than to
   * `isDeployedRuntime`, deliberately: preview deployments legitimately run the
   * mock so the flows can be exercised, and widening it would take that away to
   * fix a problem preview does not have.
   *
   * It disables checkout rather than throwing. Throwing here would 500 the
   * storefront on a configuration mistake, and the whole point is that the safe
   * state is "no order is created", not "the site is down". `runBeginCheckout`
   * already answers CHECKOUT_DISABLED with Hebrew copy.
   */
  const mockOnCustomerFacingDeploy = useMock && source.VERCEL_ENV === 'production'

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
    !mockOnCustomerFacingDeploy &&
    (source.NODE_ENV === 'production'
      ? source.CHECKOUT_ENABLED === 'true'
      : source.CHECKOUT_ENABLED !== 'false')

  const refusedReason = mockOnCustomerFacingDeploy
    ? 'CARDCOM_USE_MOCK=true on the production deployment: checkout refused so no order can be created without a charge'
    : null

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
      refusedReason,
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
    refusedReason,
  }
}
