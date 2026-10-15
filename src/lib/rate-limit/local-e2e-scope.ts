import { mockAllowedInProductionBuild } from '@/lib/payments/provider-gate'

/**
 * The suffix a local E2E build adds to a limiter key that is otherwise keyed
 * on ONE identity the whole suite shares (the seeded customer's user id,
 * email and phone), so that the budget is per address as well.
 *
 * Why: the counters live in Postgres (no Upstash on a laptop) and outlive
 * every server restart, and the suite's one customer spent the per-user
 * cart budget (120 an hour) and then the per-email order velocity (15 a
 * day) across a day of runs; the pay step answered "יותר מדי הזמנות בזמן
 * קצר" with a clean server log (WRETRY-XF04, 15.10.2026). Each run hands
 * its workers a fresh /24 (logs/xf04/run.sh), so with the address in the
 * key a run starts with the budget a real shopper has, and the limiters
 * themselves stay on. The allowance is the payment gate's
 * (`E2E_MOCK_CHECKOUT=local-build` and no `VERCEL`), inert on the deployed
 * site, where the key is the identity alone.
 */
export function localE2eScope(
  ip: string | null,
  source: Record<string, string | undefined> = process.env,
): string {
  if (!ip || !mockAllowedInProductionBuild(source)) return ''
  return `:ip:${ip}`
}
