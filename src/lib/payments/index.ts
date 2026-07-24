import { CardcomProvider } from '@/lib/payments/cardcom'
import { loadCardcomEnv } from '@/lib/payments/env'
import { getSharedMockCardcom } from '@/lib/payments/mock-cardcom'
import type { PaymentProvider } from '@/lib/payments/types'

export type { PaymentProvider } from '@/lib/payments/types'
export { loadCardcomEnv } from '@/lib/payments/env'
export { MockCardcomProvider, getSharedMockCardcom } from '@/lib/payments/mock-cardcom'
export { CardcomProvider } from '@/lib/payments/cardcom'

export function getPaymentProvider(): PaymentProvider {
  const env = loadCardcomEnv()
  if (env.useMock) return getSharedMockCardcom()
  return new CardcomProvider()
}
