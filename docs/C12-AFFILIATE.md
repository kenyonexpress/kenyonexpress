# C12 Affiliate program

Status: already built before C12 (F12). This item audited it and wrote this note. No new code, no new migration.

## Migration 165

The queue named `migrations/pending/165_affiliate.sql`. Migration 165 is permanently cancelled (iron rule), so no 165 file was created. The program ships in `migrations/applied/189_affiliate_program.sql` and `migrations/applied/283_affiliate_campaigns.sql`.

## Requirement map

| Requirement | Where |
|---|---|
| Campaigns table, admin-settable commission % | `affiliate_campaigns.commission_bp` (integer basis points, 0..5000); admin UI `/admin/affiliates/campaigns` takes a percent and stores bp |
| Referral cookie, 30 days | `?ref=<code>` sets `ke_aff` in `src/proxy.ts`; `AFFILIATE_COOKIE_MAX_AGE_S = 30*24*60*60` in `src/lib/affiliate/rules.ts` |
| Rate snapshot | `affiliate_attributions.commission_bp` and `commission_agorot`, written once per order (same idea as `platform_percent` in `order_items`) |
| Payout to wallet | Daily cron `/api/cron/affiliate-payouts`, `fn_wallet_transfer`, idempotency key `affiliate:<order_id>`, 14-day hold, reversed on cancel or refund, never on own order |
| Dashboard | `/account/affiliate` (`src/app/(store)/account/affiliate/page.tsx`) |
| Money | Integer agorot, `applyBp` from `src/lib/money.ts` |

## Verification

- `vitest run src/lib/affiliate`: 7 of 7 pass.
- Live DB state of 283 not verified: the Supabase MCP is unauthenticated in this session. See `docs/AFFILIATE-DESIGN.md`.
- No forbidden files touched.
