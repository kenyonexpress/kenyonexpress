# C06: Account, wallet, vouchers (live verification)

Date: 2026-10-30. Follows docs/C05-ACCOUNT.md (static audit). This pass verified the live DB over PostgREST
(read-only; anon key vs service-role key). No code or migration changes.

## RLS verified on live (anon read)
Service-role row counts vs anon-key `select=id&limit=1` on project ixvwfbuvfxxsjiywhbbb:

| Table | Rows (service) | Rows visible to anon |
|---|---|---|
| vouchers | 207 | 0 |
| wallet_accounts | 19 | 0 |
| wallet_entries | 236 | 0 |
| orders | 286 | 0 |
| order_items | 322 | 0 |
| invoices | 221 | 0 |

RLS is on and nothing leaks to anon. Not covered: cross-user isolation between two authenticated users
(needs two user JWTs) and exact policy text (pg_policies is not exposed over REST).

Live schema facts: `orders.user_id` exists, `orders.customer_id` does not (the invoice route filters
`user_id`, so it is correct; the 001 policy text is stale).

## Feature state
Orders list, order detail, invoice download (session + owner check), voucher list, `/coupon/[id]` QR with
10-char code, wallet balance and cashback ledger all exist (see C05 table).

## Blocker: 8-digit vouchers are not live
`vouchers.redemption_code` and `redemption_code_signature` do not exist on the live DB. Migration
`298_voucher_8digit_redemption_codes.sql` is filed under `migrations/applied/` but was never applied.
`/voucher/code/[id]` reads that column, so it fails in production. Linking it from the account list now
would ship a broken link, so the list was left unchanged.

To finish: apply 298 (run preflight_298.sql first; it shares the number with 298_admin_users_rls.sql) via
Supabase MCP `apply_migration` once that connector is authorized, then link `/voucher/code/[id]` from
`account/coupons/page.tsx` for vouchers with a non-null `redemption_code`, and backfill existing 207 vouchers.

RESULT: BLOCKED Supabase MCP unauthenticated, migration 298 (8-digit redemption_code) not applied on live DB
