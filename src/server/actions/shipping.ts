'use server'

import { agorot } from '@/lib/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { rateLimit } from '@/lib/rate-limit'
import type { ShippingOption } from '@/lib/shipping/quote'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/utils/rate-limit'
import { getCart } from '@/server/actions/cart'
import { quoteCheckoutOptions } from '@/server/shipping/quotes'
import { z } from 'zod'

/**
 * Carrier quotes for the checkout form (STEP 43).
 *
 * The parcel is the server-built cart, never the browser's description of
 * it: the form sends a city and a postal code and nothing else, so a forged
 * request can at most ask what shipping to Eilat costs. Rate-limited per IP
 * because each call fans out to every offered carrier.
 *
 * Never fails loudly: an empty list with `degraded: true` is a valid answer
 * the form renders as "the courier is chosen when the parcel is prepared".
 */

const inputSchema = z.object({
  city: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  zip: z
    .string()
    .trim()
    .max(10)
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export type ShippingQuotesState = {
  options: ShippingOption[]
  degraded: boolean
  zone: string | null
}

const EMPTY: ShippingQuotesState = { options: [], degraded: true, zone: null }

async function runGetShippingQuotes(raw: unknown): Promise<ShippingQuotesState> {
  const parsed = inputSchema.safeParse(raw ?? {})
  if (!parsed.success) return EMPTY

  const decision = await rateLimit('shipping-quote', await getClientIp())
  if (!decision.allowed) return EMPTY

  const cart = await getCart()
  const physical = cart.items.filter((item) => item.type === 'physical')
  if (physical.length === 0) return { options: [], degraded: false, zone: null }

  const admin = createAdminClient()
  try {
    const result = await quoteCheckoutOptions(admin, {
      cityName: parsed.data.city ?? null,
      zip: parsed.data.zip ?? null,
      lines: physical.map((item) => ({
        quantity: item.quantity,
        weightGrams: null,
        lineTotalAgorot: agorot(item.line_total),
      })),
    })
    return { options: result.options, degraded: result.degraded, zone: result.zone }
  } catch (error) {
    log.warn('shipping.quotes_action_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return EMPTY
  }
}

export async function getShippingQuotes(raw: unknown): Promise<ShippingQuotesState> {
  return withActionContext('shipping.quotes', () => runGetShippingQuotes(raw))
}
