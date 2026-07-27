import { type CardcomAccountRegistry, loadCardcomAccounts } from '@/lib/payments/accounts'
import { CardcomProvider } from '@/lib/payments/cardcom'
import { loadCardcomEnv } from '@/lib/payments/env'
import { getSharedMockCardcom } from '@/lib/payments/mock-cardcom'
import type { PaymentProvider } from '@/lib/payments/types'

export type { PaymentProvider } from '@/lib/payments/types'
export { loadCardcomEnv } from '@/lib/payments/env'
export { MockCardcomProvider, getSharedMockCardcom } from '@/lib/payments/mock-cardcom'
export { CardcomProvider } from '@/lib/payments/cardcom'
export {
  type CardcomAccount,
  type CardcomAccountRegistry,
  CardcomAccountError,
  PLATFORM_ACCOUNT_ID,
  SANDBOX_TERMINAL_NUMBER,
  loadCardcomAccounts,
} from '@/lib/payments/accounts'

/** The configured accounts, with mock credentials filled in for dev and tests. */
export function getCardcomAccounts(): CardcomAccountRegistry {
  return loadCardcomAccounts(process.env, { mock: loadCardcomEnv().useMock })
}

/**
 * The provider for one Cardcom account.
 *
 * Pass the id stored next to whatever you are acting on - `payments
 * .cardcom_account_id` for a verify or refund, `payment_tokens
 * .cardcom_account_id` for a token charge. Omitting it means the platform
 * account, which is correct for a new checkout and for every row written before
 * multi-account existed (they are all platform rows).
 *
 * An unknown id throws rather than falling back: quietly verifying against the
 * platform terminal would report a real payment as missing, and quietly
 * refunding from it would take the money out of the wrong account.
 */
export function getPaymentProvider(accountId?: string | null): PaymentProvider {
  const env = loadCardcomEnv()
  if (env.useMock) return getSharedMockCardcom()
  return new CardcomProvider(getCardcomAccounts().get(accountId))
}
