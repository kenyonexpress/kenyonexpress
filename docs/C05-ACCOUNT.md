# C05: Account, wallet, vouchers

Date: 2026-10-29. Static audit only. No code changes.

## What exists
| Requirement | Where | State |
|---|---|---|
| Orders list | `src/app/(account)/account/orders/page.tsx` | present |
| Order detail + invoice link | `orders/[id]/page.tsx` | present |
| Invoice download | `orders/[id]/invoice/route.ts` | present; session check, `user_id` + `deleted_at` filter via admin client, 404 on foreign id, redirect to document URL |
| Voucher list | `/account/coupons` (`/account/vouchers`, `/account/my-vouchers` redirect to it) | present; shows 10-char code `XXXXX-XXXXX`, no QR per row (deliberate, see page comment) |
| Voucher QR | `/coupon/[id]` | present; QR + 10-char code |
| Voucher QR + 8-digit code | `/voucher/code/[id]` | present; reads `redemption_code`; NOT linked from the list |
| Wallet balance + cashback ledger | `/account/wallet`, `getWalletSummary`/`getWalletLedger` | present; `order_cashback` and `cashback_earn` labelled |

## RLS (migration files only)
- `vouchers_owner_read`: `user_id = auth.uid()` (073).
- `wallet_entries_owner_read`: via `wallet_accounts.user_id = auth.uid()` (055).
- `invoices`: RLS on, no policies, service role only (107); access gated in the route above.
- `orders: customer select own`: `customer_id = auth.uid()` (001). The invoice route filters `orders.user_id`. Whether both columns exist on the live table was not checked.

## Gaps
1. RLS not verified on the live DB: Supabase MCP is unauthenticated in this non-interactive session, so no policy/column query could run.
2. The list links to `/coupon/[id]` (10-char code), not `/voucher/code/[id]` (8-digit code). Needs a product call on vouchers with no `redemption_code`.
3. No compare.mjs/Lighthouse run; no browser session.

RESULT: BLOCKED RLS not verifiable on live DB (Supabase MCP unauthenticated); list does not surface 8-digit code
