import { type CarrierId, isCarrierId } from '@/lib/shipping/carrier-registry'
import { type ShippingEnv, loadShippingEnv, offeredCarrierIds } from '@/lib/shipping/env'
import { HttpCarrierProvider } from '@/lib/shipping/providers/http'
import { MockCarrierProvider } from '@/lib/shipping/providers/mock'
import type { CarrierProvider } from '@/lib/shipping/providers/types'

/**
 * Provider selection, the same shape as `lib/payments/index.ts`: the env
 * decides, the mock is the default, and a caller never constructs an adapter.
 */

const mocks = new Map<CarrierId, MockCarrierProvider>()

export function getCarrierProvider(
  carrierId: CarrierId,
  env: ShippingEnv = loadShippingEnv(),
): CarrierProvider {
  const credentials = env.carriers[carrierId]
  if (env.useMock || !credentials) {
    let mock = mocks.get(carrierId)
    if (!mock) {
      mock = new MockCarrierProvider(carrierId)
      mocks.set(carrierId, mock)
    }
    return mock
  }
  return new HttpCarrierProvider(carrierId, credentials, env.timeoutMs)
}

/** Every provider a shopper may be quoted by, in registry order. */
export function offeredCarrierProviders(env: ShippingEnv = loadShippingEnv()): CarrierProvider[] {
  return offeredCarrierIds(env).map((id) => getCarrierProvider(id, env))
}

/** A provider for a stored carrier text (registry id or legacy alias), or null. */
export function providerForStoredCarrier(
  value: string | null | undefined,
  env: ShippingEnv = loadShippingEnv(),
): CarrierProvider | null {
  return isCarrierId(value) ? getCarrierProvider(value, env) : null
}

export function __resetCarrierProviders(): void {
  mocks.clear()
}
