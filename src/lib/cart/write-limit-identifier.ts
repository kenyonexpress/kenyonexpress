import { localE2eScope } from '@/lib/rate-limit/local-e2e-scope'

/**
 * Who a cart write is charged to: `user:<uuid>` for a shopper who is signed
 * in, `ip:<address>` for a guest. The `cart_write` policy (120 an hour,
 * lib/rate-limit/policies.ts) is keyed on it by the cart actions and by
 * /api/cart/sync alike.
 *
 * In a local E2E build a signed-in shopper is charged per address as well
 * (`localE2eScope`, which says why): the suite drives ONE seeded customer,
 * the counters live in Postgres and outlive every server restart, and a day
 * of runs spent that one account's hour; the pay step then added nothing
 * ("נוסף לסל" never came, badge 1 item / 0 ₪) with a clean server log
 * (WRETRY-XF04, 15.10.2026).
 */
export async function cartWriteIdentifier(
  userId: string | null,
  ip: () => Promise<string>,
  source: Record<string, string | undefined> = process.env,
): Promise<string> {
  if (!userId) return `ip:${await ip()}`
  const scope = localE2eScope(await ip(), source)
  return `user:${userId}${scope}`
}
