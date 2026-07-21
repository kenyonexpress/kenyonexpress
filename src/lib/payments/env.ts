export type CardcomEnv = {
  terminalNumber: string
  apiName: string
  apiPassword: string
  webhookSecret: string
  appUrl: string
  checkoutEnabled: boolean
  useMock: boolean
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

  const checkoutEnabled = source.CHECKOUT_ENABLED !== 'false'

  if (useMock) {
    return {
      terminalNumber: source.CARDCOM_TERMINAL_NUMBER ?? 'mock-terminal',
      apiName: source.CARDCOM_API_NAME ?? 'mock-api',
      apiPassword: source.CARDCOM_API_PASSWORD ?? 'mock-password',
      webhookSecret: source.CARDCOM_WEBHOOK_SECRET ?? 'mock-webhook-secret',
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
    appUrl: required('NEXT_PUBLIC_APP_URL', source.NEXT_PUBLIC_APP_URL),
    checkoutEnabled,
    useMock: false,
  }
}
