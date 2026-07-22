export type StripeEnv = {
  secretKey: string
  webhookSecret: string
  publishableKey: string
  appUrl: string
}

export type PayoneerEnv = {
  /** Placeholder until live adapter ships */
  enabled: false
}

export type CheckoutPaymentsEnv = {
  provider: 'stripe' | 'payoneer' | 'mock'
  checkoutEnabled: boolean
  stripe: StripeEnv | null
  payoneer: PayoneerEnv
}

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env: ${name}`)
  }
  return value.trim()
}

export function loadCheckoutPaymentsEnv(
  source: NodeJS.ProcessEnv = process.env,
): CheckoutPaymentsEnv {
  const checkoutEnabled = source.CHECKOUT_ENABLED !== 'false'
  const raw = (source.PAYMENT_PROVIDER ?? 'stripe').trim().toLowerCase()
  const provider: CheckoutPaymentsEnv['provider'] =
    raw === 'payoneer' || raw === 'mock' || raw === 'stripe' ? raw : 'stripe'

  if (provider === 'mock' || source.NODE_ENV === 'test') {
    return {
      provider: 'mock',
      checkoutEnabled,
      stripe: null,
      payoneer: { enabled: false },
    }
  }

  if (provider === 'payoneer') {
    return {
      provider: 'payoneer',
      checkoutEnabled,
      stripe: null,
      payoneer: { enabled: false },
    }
  }

  return {
    provider: 'stripe',
    checkoutEnabled,
    stripe: {
      secretKey: required('STRIPE_SECRET_KEY', source.STRIPE_SECRET_KEY),
      webhookSecret: required('STRIPE_WEBHOOK_SECRET', source.STRIPE_WEBHOOK_SECRET),
      publishableKey: required(
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
        source.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      ),
      appUrl: required('NEXT_PUBLIC_APP_URL', source.NEXT_PUBLIC_APP_URL),
    },
    payoneer: { enabled: false },
  }
}
