# G105 — Account area

Date: 2026-10-30. Audit of `/account` against the item list, plus the one missing feature (coupon transfer).

| Item | State | Where |
|---|---|---|
| Orders (list, detail) | existed | `src/app/(account)/account/orders/**` |
| Vouchers / coupons | existed | `/account/coupons` (`/account/vouchers` redirects), `/coupon/[id]` QR |
| Wallet | existed | `/account/wallet` |
| Addresses (shipping only) | existed | `/account/addresses` |
| Affiliate | existed | `/account/referrals`, `src/app/api/affiliate` |
| Club badge | existed | `/account/tier`, TierBadge (C11) |
| Invoice download | existed | `orders/[id]/invoice/route.ts`, `receipt/route.ts` (session + owner check) |
| Cancel order, 14-day rule | existed | `orders/[id]/cancel`, `computeCancellationFee` = min(5% of charge, 100 ILS) in integer agorot (`src/server/domain/orders/refund.ts`) |
| Transfer coupon | **added** | below |

## Coupon transfer (new)
- `src/lib/vouchers/transfer.ts`: pure email normalisation and `isTransferable` (status `issued`, not expired). Unit tests alongside.
- `src/server/actions/vouchers/transfer-voucher.ts`: server action. Caller comes from the session; 10 transfers/hour/user; recipient must be a registered profile; every refusal returns the same generic Hebrew message so it cannot probe which emails have accounts.
- `migrations/pending/314_voucher_transfer.sql`: `voucher_transfers` audit table (RLS: parties read) and `transfer_voucher(voucher, from, to)` which locks the row, re-checks owner/status/expiry, moves `vouchers.user_id`, writes the audit row. Execute granted to `service_role` only. No money moves, no fee.
- UI: `TransferCouponForm` on each transferable row of `/account/coupons`.

## Verification
- `tsc`: no errors in the new or edited files (the repo has unrelated pre-existing errors elsewhere).
- `vitest src/lib/vouchers`: pass. `auth-coverage.test.ts` has one failure, `passkeys.ts:beginPasskeyLogin`, in a file this item did not touch.
- Visual gate (`compare.mjs`) covers home/product/category only; no such page was touched.

## Not done / caveats
- Migration 314 is written to `migrations/pending/` but **not applied**: Supabase MCP is unauthenticated in this session. Until it is applied, a transfer attempt returns the generic error (RPC missing). Apply via MCP `apply_migration` on ixvwfbuvfxxsjiywhbbb.
- Same pre-existing gap as C06: `vouchers.redemption_code` (migration 298) is not on live.
- No transfer notification email to the recipient yet.
- No forbidden files touched.
