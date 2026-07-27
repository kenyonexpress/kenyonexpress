import type { CardcomAccount } from '@/lib/payments/accounts'
import { CardcomProvider } from '@/lib/payments/cardcom'
import { loadCardcomEnv } from '@/lib/payments/env'
import { getSharedMockCardcom } from '@/lib/payments/mock-cardcom'
import type { PaymentProvider } from '@/lib/payments/types'

export type { PaymentProvider } from '@/lib/payments/types'
export { loadCardcomEnv } from '@/lib/payments/env'
export { MockCardcomProvider, getSharedMockCardcom } from '@/lib/payments/mock-cardcom'
export { CardcomProvider } from '@/lib/payments/cardcom'
export {
  PLATFORM_ACCOUNT_KEY,
  platformAccountFromEnv,
  resolveAccountForSupplier,
  resolveAccountByKey,
  resolveAccountByTerminal,
  type CardcomAccount,
} from '@/lib/payments/accounts'
export {
  WEBHOOK_SIGNATURE_HEADER,
  computeWebhookSignature,
  verifyWebhookSignature,
} from '@/lib/payments/signature'

/**
 * Provider bound to one Cardcom account. Omitting the account binds the
 * platform terminal. Under mock mode the shared in-memory provider answers for
 * every account: mock deals are keyed by low-profile id, so tests exercise the
 * multi-account flow without terminal-specific state.
 */
export function getPaymentProvider(account?: CardcomAccount): PaymentProvider {
  const env = loadCardcomEnv()
  if (env.useMock) return getSharedMockCardcom()
  return new CardcomProvider(account)
}
