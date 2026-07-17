# ARCHITECTURE-SECURITY.md

KenyonExpress security architecture, threat model, and hardening plan.
Stack: Next.js 16.2.4 (middleware = `src/proxy.ts`), Supabase (Postgres 17, RLS), Drizzle, Cardcom (Israeli PSP). Marketplace handling payments, internal wallet, and coupon redemption at physical businesses.

Companion migration: `supabase/migrations/035_security_hardening.sql` (idempotent, numbered after all existing drafts 026-034; renumbered 036 -> 035 on 2026-07-17 for a gapless sequence).

## 0. Scope, sources, and authority

This document is the binding security decision record. Where it conflicts with any other doc, this document wins for security controls.

Sources reviewed: all `docs/*.md` and all `supabase/migrations/*.sql` (001 through 034 plus `0075`), and the live `src/` code.

Ground truth of the codebase (this matters for every threat below):

- Applied to the dev DB: migrations 001-025. Drafts NOT applied: 026, 027, 028, 029, 030, 031, 032, 033, 034 (analytics_bi). Migration 035 (this plan) is authored to be safe whether or not 026-034 are applied.
- Implemented in `src/` today: Supabase auth (Google OAuth + email/magic-link) in `src/server/actions/auth.ts`; middleware auth gating in `src/proxy.ts`; RBAC helpers in `src/lib/admin/rbac.ts`; service-role client in `src/lib/supabase/admin.ts` (2 callers); IP rate limiting wired to auth only in `src/lib/utils/rate-limit.ts`.
- NOT implemented yet (design-only): all Cardcom code, all webhook routes (`src/app/api/` is empty), `src/server/actions/payments/`, coupon redemption endpoint, wallet spend, payout engine, cron jobs, `CRON_SECRET`, security headers/CSP, CI/CD.
- Doc authority conflict: `MASTER-ARCHITECTURE.md` (2026-07-09) declares itself binding; `BUSINESS-MODEL.md` + `ARCHITECTURE-COMMERCE.md` (2026-07-17, newer) declare themselves single source of truth but describe a simpler, less-secure coupon model (`coupons_issued`, plain `qr_payload`, "role supplier", migration number 032 colliding with WP import). Decision: the security model in this document is built on the Gen A mechanisms (`coupon_codes` + Ed25519 `qr_token` + `supplier_members` + `redeem_coupon`), because they are the only ones with a defined security design. The newer business docs are treated as product intent, not as a security schema. Anyone implementing the Gen B coupon model MUST re-run this threat model first (see SEC-15).

### 0.1 Findings register (severity-ordered)

| ID | Severity | Title | Where | Fixed in 035 |
|----|----------|-------|-------|--------------|
| SEC-01 | Critical | `fn_wallet_transfer` executable by any authenticated user, no ownership/admin check, platform accounts exempt from non-negative floor -> wallet minting | 026:335 | Yes (revoke to service_role only) |
| SEC-02 | High | `affiliates` self-UPDATE policy has no column restriction -> self-approve + inflate `total_earnings_ils` | 010 | Yes (drop policy) |
| SEC-03 | High | `profiles: admin all` has no WITH CHECK; any admin can set `role='super_admin'` on anyone -> privilege escalation within staff | 001/003 | Yes (WITH CHECK + role-elevation trigger) |
| SEC-04 | High | `coupon_codes` supplier UPDATE policy (`coupons_supplier_mark_used`) is column-unrestricted -> supplier can set `status='refunded'`, reset `used_at`, move `expires_at` | 008 | Yes (drop; redemption goes through definer only) |
| SEC-05 | High | `check_user_rate_limit(p_user_id, ...)` trusts caller-supplied `user_id` instead of `auth.uid()` -> pollute/bypass another user's bucket | 019 | Yes (add `check_my_rate_limit` wrapper, revoke raw from authenticated) |
| SEC-06 | High | Legacy over-permissive policies survive later migrations (vendors owner-manage ALL, products/categories/variants/images `*_admin_write` ALL) -> effective permissions wider than intended | 005/013 vs 012/014 | Yes (drop stale policies) |
| SEC-07 | Medium | `cleanup_rate_limits()` / `cleanup_user_rate_limits()` executable by PUBLIC -> any caller can purge the limiter tables | 002/019 | Yes (revoke, grant service_role) |
| SEC-08 | Medium | Rate-limit helpers fail-OPEN and `checkUserRateLimit` has zero callers; no limiter on the (planned) coupon-scan / checkout / webhook paths | `src/lib/utils/rate-limit.ts` | Partial (DB wrapper; app wiring is a code task, see SEC-08 note) |
| SEC-09 | Medium | `carts` WITH CHECK allows `profile_id IS NULL` for anyone; `session_id` unvalidated -> anon can write null-owner cart rows | 001 | Yes (tighten; guest carts run via service role) |
| SEC-10 | Medium | Two divergent coupon redemption codepaths (`fn_redeem_coupon` 026 vs `redeem_coupon` 027) with different authz and only one enforcing the `coupon_redemptions` UNIQUE barrier | 026/027 | Yes (revoke legacy `fn_redeem_coupon`, keep 027 canonical) |
| SEC-11 | Medium | `supplier_members` owner-INSERT can add any `user_id` as `owner` with no consent/target-role check -> supplier account takeover / peer escalation | 027 | Yes (constrain member_role on self-service insert) |
| SEC-12 | Medium | Full bank account numbers serialized into `audit_log.changes` by the generic audit trigger (payment_tokens got a redacting trigger; bank accounts did not) | 025/027 | Yes (dedicated redacting trigger for `supplier_bank_accounts`) |
| SEC-17 | Medium | `profiles: owner update` pins only `role`, not `supplier_id`; a vendor/content_uploader self-assigns any `supplier_id` and reads that supplier's coupons (names, codes, collect amounts) via the applied 008 `coupons_supplier_read_assigned` policy | 003/008 | Yes (pin `supplier_id` in the owner-update WITH CHECK) |
| SEC-13 | Medium | `audit_log` (011) has write-blocking policies but no populating writer wired in applied migrations; real writes went to `admin_audit_log` (dropped in draft 025). Audit trail is effectively dead until 025 is applied | 011/025 | Documented; 035 adds `security_events` + verifies writer |
| SEC-14 | Low | Seed migration 023 creates 6 login-capable demo vendor accounts with a hardcoded, in-repo password, pre-confirmed | 023 | Guard: block in production (see SEC-14) |
| SEC-15 | Low | Plaintext at rest: `cardcom_token` (until 029 applied), `vendors.bank_account`, `affiliates.payout_details`, `supplier_bank_accounts.account_number`; column encryption deferred | multiple | Documented decision (RLS + audit + deferral) |
| SEC-16 | Info | Gen B business docs reintroduce an unsigned coupon model and an undocumented subscription/recurring-billing surface with no security design | docs | Documented; must re-threat-model |

Critical + High (SEC-01..06) must be applied before any real money or real coupon flows through the system.

---

## 1. Threat model (STRIDE per critical flow)

Trust boundaries in this system, from least to most trusted:

1. Anonymous browser (no `auth.uid()`) -> can hold a guest cart only.
2. Authenticated browser (Supabase JWT, `anon` key + session) -> RLS-scoped reads/writes as `auth.uid()`.
3. Supplier member (authenticated + row in `supplier_members`) -> scoped to their supplier via `is_supplier_member()`.
4. Staff (`profiles.role` in content_uploader/admin/super_admin) -> admin surfaces via `is_admin()` / `requireAdminSession`.
5. Server actions with the service-role key (`SUPABASE_SERVICE_ROLE_KEY`) -> bypass RLS entirely. This is the crown jewel; its leak equals total DB compromise.
6. Postgres SECURITY DEFINER functions -> run as owner, are the ONLY sanctioned path for financial writes.

Core principle (inherited from the design docs and made binding here): RLS is the truth boundary; every financial mutation goes through a SECURITY DEFINER function with transition validation; there are zero client-facing write policies on any financial table. The server always calls `auth.getUser()`, never `getSession()`.

STRIDE legend: S poofing, T ampering, R epudiation, I nformation disclosure, D enial of service, E levation of privilege.

### 1.1 Guest cart

| STRIDE | Threat | Control |
|--------|--------|---------|
| S | Forge/steal `ke_session_id` to read/hijack another guest's cart | Cookie is httpOnly, SameSite=Lax, 30d, random UUID; cart carries no PII and no prices (a wishlist of product/variant ids), so a stolen cart id leaks nothing valuable. Identity is never derived from it. |
| T | Inject prices/quantities into the cart | No money field is client-writable: `cart_items` stores only ids + quantity (1-99, CHECK). Prices are resolved and snapshotted server-side at checkout. |
| R | Deny having created a cart | Non-issue; carts are not a financial record. |
| I | Enumerate carts | RLS scopes to `profile_id = auth.uid()`; guest carts are written only via the service-role client server-side. SEC-09 tightens the residual anon WITH CHECK. |
| D | Flood cart writes | SEC-09 removes the anon direct-write path; add IP rate limit on add-to-cart if abused (low priority, no money). |
| E | Guest -> user without login | Impossible: cart-to-user merge requires `auth.uid()` inside `fn_merge_guest_cart` (advisory lock + FOR UPDATE, race-safe). |

### 1.2 Google login at pay

| STRIDE | Threat | Control |
|--------|--------|---------|
| S | Spoof a session | Supabase Auth PKCE; server verifies with `getUser()` on every matched request in `proxy.ts`; JWT ~1h with refresh-token rotation + reuse detection. |
| T | Tamper `next` redirect (open redirect) | `safeNext()` only allows paths starting with `/`; validated again in `/auth/callback`. |
| R | Deny an action | `amr`/login events; sensitive ops gated by `requireRecentAuth(15m)`. |
| I | Leak profile via callback | Callback exchanges code server-side; tokens live only in httpOnly cookies. |
| D | Brute-force login | `check_rate_limit('login:'+ip, 10/3600)`, signup 5/3600, magic 5/3600, reset 5/3600 (implemented in `auth.ts`). Fail policy for auth is currently fail-open (SEC-08). |
| E | Self-escalate role at signup | `handle_new_user()` sets role default `customer` and never reads client input; role change blocked by `profiles` UPDATE WITH CHECK (role must equal stored role). |

### 1.3 Cardcom payment + webhook

| STRIDE | Threat | Control |
|--------|--------|---------|
| S | Forge a "paid" webhook | Two-layer: (1) verify `CARDCOM_WEBHOOK_SECRET` signature first, invalid -> log `signature_valid=false` + return 200 + drop; (2) even with a valid signature, server-to-server re-fetch the transaction from Cardcom by `cardcom_low_profile_id` and trust ONLY that for amount + status (`verified_against_api=true`). A forged "paid 1 ILS" on a 500 ILS order fails the amount match. |
| T | Replay a real webhook | `payment_webhook_events UNIQUE(provider, external_event_id)` -> replay is a no-op; `payments.cardcom_transaction_id UNIQUE` -> one Cardcom txn settles exactly one payment row ever. |
| R | Customer disputes payment | `payments.raw_response` + `payment_webhook_events.payload` retained; `payments` is admin-read, audit-triggered. |
| I | Steal card data / token | No PAN ever touches our servers (Cardcom Low Profile hosted page). Only `cardcom_token` + last4/brand/expiry stored. Raw token column is REVOKEd from all browser roles (029) -> `SELECT *` fails 42501 even for admins. |
| D | Hammer checkout | `begin_checkout` 10/min per user, fail-CLOSED (money path). Webhook route is service-role, IP rate-limited loosely, `force-dynamic`, no CSRF. |
| E | Get goods without paying | Everything valuable (coupon codes, wallet debit, cashback, stock decrement) is created ONLY on the verified `paid` transition, inside one webhook transaction. Browser redirect/success URLs never change order state. Reconcile cron catches missing webhooks by polling Cardcom for `redirected` payments >10 min. |

### 1.4 Coupon scan / redemption at business

| STRIDE | Threat | Control |
|--------|--------|---------|
| S | Present a forged QR | QR = `KE1.<payload>.<sig>`, Ed25519-signed; private key `SUPPLIER_QR_SIGNING_KEY` server-only; scanner verifies signature offline against the embedded public key (`qr_key_id` for rotation). Signature proves authenticity, NOT single-use. |
| T | Replay/screenshot a valid coupon (double redemption) | Single-use enforced in DB only: atomic compare-and-set `UPDATE ... WHERE status='issued' ...` (second scan updates 0 rows) plus `coupon_redemptions.coupon_code_id UNIQUE` as a second barrier. Offline scan shows "valid, needs online confirmation"; no goods before online confirm. See SEC-10 (both barriers must be on the live path). |
| R | Supplier denies a redemption happened, or claims a false one | `coupon_scan_events` logs every attempt (success + failure), append-only, RLS deny on all direct writes; `coupon_redemptions` is the truth record. |
| I | Enumerate the 8-digit code space or map other businesses' codes | `check_user_rate_limit('coupon_scan', 30/60s)`; anti-enumeration: `wrong_supplier` and `not_found` both return generic `not_found` to the scanner (exact reason recorded server-side for fraud). SEC-04/SEC-05 close the column-write and rate-limit-spoofing gaps. |
| D | Redemption denial (spam scans) | Rate limit above; `redeem_coupon` is `authenticated`-only and membership-scoped. |
| E | Non-member redeems, or admin override | Authorization is ONLY `supplier_members` (is_active); no admin override exists by design (an admin who must scan adds themselves as a member). SEC-11 constrains who can be made a member. |

### 1.5 Internal wallet credit / debit

| STRIDE | Threat | Control |
|--------|--------|---------|
| S | Impersonate the crediting authority | Wallet writes go only through `fn_wallet_transfer` (SECURITY DEFINER). SEC-01: this function must be service-role-only; today it is callable by any authenticated user -> CRITICAL, fixed in 035. |
| T | Mint credit / go negative | Double-entry ledger (`wallet_transactions`, append-only, no UPDATE/DELETE policy). `wallet_accounts_user_nonneg CHECK` floors user accounts at 0. But platform accounts are CHECK-exempt, so SEC-01 (open grant) lets a user debit `platform:cashback_reserve` and credit themselves without any floor. Fix = lock the function down. |
| R | Dispute a balance | Every transfer has an `idempotency_key`, `created_by`, and reason; nightly `v_wallet_ledger_drift` reconciles cache vs ledger. |
| I | Read another user's ledger | RLS: `wallet_accounts`/`wallet_transactions` SELECT scoped to owner via account ownership. |
| D | Exhaust a balance via races | `fn_wallet_transfer` locks both accounts FOR UPDATE in fixed uuid order; idempotency + ON CONFLICT handle concurrent replays. |
| E | Turn cashback into cash-out | Wallet is on-site credit only, never cashes out; refunds of the wallet portion return to wallet, never to card. |

### 1.6 Supplier payout

| STRIDE | Threat | Control |
|--------|--------|---------|
| S | Redirect a payout to attacker bank details | `supplier_bank_accounts` owner-managed; the account is frozen into `payout_statements.bank_snapshot` at mark-paid; changing bank details after a statement is approved does not retroactively change a frozen snapshot. |
| T | Inflate the payout amount | No amount is recomputed at statement time; `gross/platform_fee/payout` come from order-time `order_items` snapshots; `NOT EXISTS` guard + `order_item_id UNIQUE` prevent double-settling. |
| R | Dispute a settlement | `payout_statements`, `payout_statement_lines`, `supplier_disputes` audit-triggered; an open dispute blocks mark-paid (enforced inside `mark_payout_statement_paid`). |
| I | Leak another supplier's payout | RLS: members read only their own supplier's non-draft statements. |
| D | Block payouts | Admin-only functions; no anon surface. |
| E | Self-approve a payout | generate/approve are `is_admin()` inside the function; mark-paid (money leaving) is `super_admin`-only at the server-action layer; reconciliation against Cardcom required before paying. |

### 1.7 Admin panel

| STRIDE | Threat | Control |
|--------|--------|---------|
| S | Reach admin without staff role | `proxy.ts` gates `/admin*` reading `profiles.role` authoritatively (not stale `app_metadata`); `requireAdminSession`/`requireStaffSession` in every admin action. |
| T | Forge an admin write | RLS `is_admin()` policies + WITH CHECK. SEC-03: `profiles: admin all` lacks WITH CHECK and lets an admin mint a super_admin -> fixed. |
| R | Untraceable admin action | Generic audit trigger on admin-written tables into `audit_log` (SEC-13: confirm the writer is live). |
| I | Read card tokens / raw secrets via admin UI | Raw `cardcom_token` REVOKEd from admin too; no impersonation feature exists. |
| D | n/a | Staff-only surface. |
| E | Admin -> super_admin -> money-out | SEC-03 blocks role elevation to admin/super_admin except by an existing super_admin; mark-paid is super_admin-only. |

---

## 2. Attack scenarios with mitigations

Each scenario names the concrete exploit, the current state, and the decided mitigation.

### 2.1 Coupon double-redemption race
Exploit: two scanners (or a screenshot + the original) submit the same code within milliseconds.
Current: canonical `redeem_coupon` (027) uses a single atomic `UPDATE ... WHERE status='issued'`; the row lock serializes the second scan, which then updates 0 rows and is diagnosed as `already_used`. The 026 path additionally inserts into `coupon_redemptions` (UNIQUE `coupon_code_id`).
Gap (SEC-10): the 027 canonical path does NOT insert a `coupon_redemptions` row, so it relies solely on the CAS predicate; the 026 path (`fn_redeem_coupon`) is a second, differently-authorized entry that is still executable.
Decision: `redeem_coupon` (027, membership-scoped) is the single live path. 035 revokes execute on the legacy `fn_redeem_coupon` (026). The 027 path must be extended to also write the `coupon_redemptions` truth row inside the same transaction so the UNIQUE barrier is always in force (code task tracked here; DB barrier already exists via the CAS + status terminal states). The atomic CAS alone is sufficient for correctness; the UNIQUE row is defense-in-depth and the source of the redemption ledger.

### 2.2 Webhook replay / forgery (Cardcom signature)
Exploit: attacker POSTs a crafted "paid" event, or replays a captured real one.
Mitigation (binding): (1) signature check against `CARDCOM_WEBHOOK_SECRET` first; invalid -> record `signature_valid=false`, return 200, no state change. (2) Signature-valid events are re-verified server-to-server against the Cardcom API by transaction id; amount + status trusted only from that response. (3) `payment_webhook_events UNIQUE(provider, external_event_id)` makes replays idempotent no-ops. (4) `payments.cardcom_transaction_id UNIQUE` guarantees one settlement per transaction. The webhook handler is the only writer of `payments` state and must use the service-role client; there is no client-facing write policy on `payments`. `v_money_alarms` surfaces the count of `signature_valid=false` for monitoring.

### 2.3 Wallet balance manipulation (SEC-01, flagship)
Exploit: an authenticated user calls the RPC directly:
```sql
select public.fn_wallet_transfer(
  '<platform:cashback_reserve account id>'::uuid,   -- debit (platform, CHECK-exempt)
  '<my own wallet_account id>'::uuid,               -- credit
  100000, 'manual_adjust', 'anything-unique');
```
Because `fn_wallet_transfer` is SECURITY DEFINER, does no caller-ownership or `is_admin()` check, and (026:335) only `REVOKE ... FROM anon` (leaving the default PUBLIC EXECUTE that includes `authenticated`), the transfer succeeds. Platform accounts are exempt from the non-negative CHECK, so the debit floor never triggers. Result: unlimited self-credit of spendable wallet balance.
Decision (035): `REVOKE ALL ON FUNCTION fn_wallet_transfer(...) FROM PUBLIC, anon, authenticated;` and `GRANT EXECUTE ... TO service_role;` (existence-guarded, applied only if the function is present). Removing EXECUTE from `authenticated` fully closes the vulnerability: an attacker with only a user JWT can no longer invoke the function at all. Wallet transfers then happen only inside server-side webhook/admin flows using the service role, as the design already assumes. Defense-in-depth follow-up (a code task, not this migration, because it requires recreating the function body): add an in-function guard that rejects a transfer whose `credit_account` is a user account when `auth.uid()` is non-null and not admin, so any future accidental re-grant of EXECUTE stays safe.

### 2.4 RLS bypass attempts
Exploit vectors and rulings:
- Direct PostgREST write to a financial table (`payments`, `wallet_transactions`, `coupon_codes.status`, `payout_*`): no client write policy exists -> denied by RLS default-deny. Confirmed correct; keep it that way (never add a client write policy to a money table).
- Overlapping legacy policies (SEC-06): `products_admin_write`/`variants_admin_write`/`images_admin_write`/`categories_admin_write` (ALL, `is_admin()`) from 005/012 and the 001 `vendors: owner manage` (ALL) survive alongside newer, narrower policies. Because permissive policies OR together, effective write scope is the union. Decision (035): drop the stale ALL policies so the newer per-command policies are authoritative.
- Service-role leakage into the client bundle: CI check (planned) greps `next build` output for `SUPABASE_SERVICE_ROLE_KEY`; `src/lib/supabase/admin.ts` is server-only. Keep the 2-caller discipline.

### 2.5 IDOR on orders / coupons
- Orders: `orders_user_read USING (user_id = auth.uid())`, `order_items` scoped through the parent order. No user can read another user's order. Suppliers (027) read only orders containing their own items, and only for `paid`+ statuses.
- Coupons: `coupons_user_read_own USING (user_id = auth.uid())`; suppliers read only coupons of suppliers they are a member of. The 8-digit code is not an object id used in any GET; redemption is by RPC with membership + rate limit + anti-enumeration. No sequential/guessable id is exposed in a URL that returns another user's resource.

### 2.6 Card token theft
- No PAN stored. `payment_tokens.cardcom_token` is the only card reference; after 029 it is column-REVOKEd from `anon` and `authenticated` (only `id, profile_id, last_4, card_brand, expiry_*, is_default, created_at` are grantable), so a browser `SELECT *` fails 42501. Until 029 is applied, the 001 "owner all" policy still exposes the token column to the owner (SEC-15). Decision: do NOT write a real Cardcom token to the DB until 029 is applied (documented invariant); 035 does not duplicate 029 but records the dependency.
- The dedicated `audit_payment_tokens_fn` (029) logs only non-secret columns; the generic audit trigger must never be attached to `payment_tokens`.

### 2.7 Admin privilege escalation (SEC-03)
Exploit: a plain `admin` (not super_admin) updates `profiles` to set their own or a colleague's `role='super_admin'`, then performs super_admin-only money-out.
Cause: `profiles: admin all` is `FOR ALL USING (is_admin())` with NO WITH CHECK, so any admin can write any role.
Decision (035): recreate the policy with `WITH CHECK (is_admin())`, and add a BEFORE UPDATE/INSERT trigger `enforce_role_change_privilege()` that rejects setting `role` to `admin` or `super_admin` unless the acting user is a `super_admin` (via `current_user_role()`), and rejects self-elevation entirely. This keeps normal admin management working while making the staff tier non-self-widening.

---

## 3. RLS policy audit

Every table below has RLS ENABLED. The audit lists the effective policy set, the gap, and the decision. Financial tables intentionally have NO client write policy (writes via SECURITY DEFINER only); that is correct and is not a gap.

### 3.1 Confirmed-correct (keep as-is)
- `orders`, `order_items`: owner-read + admin-all; no user insert (checkout writes via service role). Correct.
- `wallet_accounts`, `wallet_transactions`, `payments`, `payment_webhook_events`, `coupon_redemptions`, `payout_statements`/`_lines`, `cardcom_settlements*`: read-scoped, no client write. Correct.
- `user_addresses`: full per-command owner policies + admin-all. Correct.
- `audit_log`: admin-select, INSERT/UPDATE/DELETE blocked with `false`. Correct (but see SEC-13 on the writer).
- `consent_events`, `coupon_scan_events`: append-only, explicit deny on direct writes. Correct.
- `supplier_bank_accounts`: owner + admin, no DELETE (deactivate via `is_active`). Correct (but see SEC-12 on audit redaction).

### 3.2 Gaps and decisions

| Table / object | Gap | Decision (035 unless noted) |
|----------------|-----|------------------------------|
| `affiliates` | `affiliates_user_update` (SEC-02): owner may UPDATE any column incl. `status`, `approved_by`, `total_earnings_ils` | Drop `affiliates_user_update`. Affiliate self-service edits (payout method) are re-added later via a scoped SECURITY DEFINER function, not a raw policy. Admin manages status/earnings. |
| `profiles` | `profiles: admin all` no WITH CHECK (SEC-03) | Recreate with `WITH CHECK (is_admin())` + role-elevation trigger. |
| `coupon_codes` | `coupons_supplier_mark_used` column-unrestricted (SEC-04) | Drop it. Redemption is only via `redeem_coupon`. (Draft 027 already drops it; 035 makes it true on the live DB now.) |
| `products`,`product_variants`,`product_images`,`categories` | Stale `*_admin_write` ALL policies from 005/012 (SEC-06) | Drop the stale ALL policies; keep the newer per-command policies. |
| `vendors` | 001 `vendors: owner manage` ALL survives under 013's super_admin-only intent (SEC-06); owner can still edit `bank_account`, `commission_rate`, `status` | Drop `vendors: owner manage`. Writes limited to super_admin (013) + owner read. |
| `carts` | WITH CHECK permits `profile_id IS NULL` for anyone (SEC-09) | Recreate: authenticated WITH CHECK requires `profile_id = auth.uid()`; guest carts continue via service role. |
| `supplier_members` | owner-insert can set `member_role='owner'` for any `user_id` (SEC-11) | Add a self-service INSERT/UPDATE constraint: a non-admin owner may only add members with `member_role IN ('manager','scanner')`; creating/elevating another `owner` requires admin. Enforced via trigger (RLS cannot see the target column cleanly across insert+update). |
| `profiles` | `profiles: owner update` WITH CHECK pins `role` but not `supplier_id` (SEC-17); a vendor/content_uploader self-assigns any `supplier_id` and reads that supplier's coupons via 008 `coupons_supplier_read_assigned` | Recreate the policy pinning `supplier_id IS NOT DISTINCT FROM` its current value. Closes the live read leak until 027 moves coupon authz onto `supplier_members`; only `approve_supplier_application`/admins set `supplier_id`. |
| `products: vendor read own` (014) | Dead policy: joins `products.supplier_id` to `vendors.id` (wrong keyspace) | Drop it (harmless but misleading); real supplier read comes from 027 `is_supplier_member`. |

Public-read `USING (true)` policies (`attribute_definitions`, `category_attributes`, `seo_redirects`) are catalog/SEO metadata with no sensitive rows: accepted, no change. The `analytics_*` policies omitting `TO authenticated` gate on `is_admin()` and are functionally safe: accepted, no change.

---

## 4. Secrets management

### 4.1 Classification and storage
Rule: any variable without a `NEXT_PUBLIC_` prefix is a server-only secret and must never appear in a client bundle.

| Secret | Sensitivity | Store | Notes |
|--------|-------------|-------|-------|
| `SUPABASE_SERVICE_ROLE_KEY` | Critical (RLS bypass = full DB) | Vercel env (server), Supabase dashboard | Only in `src/lib/supabase/admin.ts`; 2 callers; never imported by a client component. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Vercel env, client OK | RLS enforces safety. |
| `CARDCOM_TERMINAL` / `CARDCOM_USERNAME` / `CARDCOM_API_NAME` / `CARDCOM_API_PASSWORD` | Critical (money) | Vercel env (server) | Only in `src/server/actions/payments/`. |
| `CARDCOM_WEBHOOK_SECRET` | Critical (webhook auth) | Vercel env (server) | Signature verification of inbound webhooks. |
| `SUPPLIER_QR_SIGNING_KEY` | Critical (Ed25519 private, coupon authenticity) | Vercel env (server) | Never leaves server; rotate via `qr_key_id`. |
| `CRON_SECRET` | High (job auth) | Vercel env (server) | Every cron route checks it. |
| `ANTHROPIC_API_KEY` | High (cost) | Vercel env (server) | AI agents. |

Decision: add `src/lib/env.ts` with a zod schema that fails fast at boot if any required server secret is missing or if a secret is accidentally `NEXT_PUBLIC_`. Add the CI grep that asserts `SUPABASE_SERVICE_ROLE_KEY` is absent from the built client bundle. Three Vercel scopes (Production / Preview / Development) with distinct values; Preview shares the dev Supabase project, never prod.

### 4.2 Rotation plan

| Secret | Cadence | Procedure | Zero-downtime? |
|--------|---------|-----------|----------------|
| Supabase service_role / anon | Quarterly or on suspected leak | Rotate in Supabase dashboard, update Vercel env, redeploy | Brief; rotate off-peak |
| `CARDCOM_*` | Per PSP policy or on leak | Rotate with Cardcom, update env | Coordinate with PSP |
| `CARDCOM_WEBHOOK_SECRET` | Quarterly / on leak | Support both old+new during cutover if Cardcom allows dual secrets; else rotate at low traffic | Short window |
| `SUPPLIER_QR_SIGNING_KEY` | Yearly / on leak | Generate new keypair with a new `qr_key_id`; scanners keep the old public key in their keymap so previously-issued coupons still verify; new coupons sign with the new key | Yes (kid-based) |
| `CRON_SECRET` | Quarterly | Rotate env, redeploy | Yes |

No secret ever in git (`.env.local` is gitignored; verified). On any suspected service-role leak, rotate immediately and audit `audit_log` + `payment_webhook_events` for the exposure window.

---

## 5. Rate limiting + abuse prevention

Infrastructure (Postgres-based, no Redis): `check_rate_limit(key,max,window)` (002, IP-keyed, atomic upsert) and `check_user_rate_limit(user,action,limit,window)` (019, per-user append-count).

Current reality: only auth actions call `check_rate_limit`; `checkUserRateLimit` has zero callers; both helpers in `src/lib/utils/rate-limit.ts` fail-OPEN. The DB-level `check_user_rate_limit` trusts a caller-supplied `user_id` (SEC-05).

Binding policy:

| Surface | Key | Limit | Fail mode |
|---------|-----|-------|-----------|
| login / signup / magic / reset | IP | 10 / 5 per hour | fail-CLOSED (change from current open) |
| `begin_checkout` | user | 10 / min | fail-CLOSED |
| `redeem_coupon` (scan) | user | 30 / min | fail-CLOSED |
| Cardcom webhook | IP | loose (e.g. 300/min) | fail-open (verified anyway) |
| `agent_chat` | user | 20 / hr | fail-open |
| `set_marketing_consent` | user | 20 / hr | fail-open |
| analytics ingest `/api/a` | IP | 120 / min | fail-open |
| `request_account_deletion` | user | 3 / 24h | fail-CLOSED |

Decisions (035 + code):
- SEC-05: add `check_my_rate_limit(p_action, p_limit, p_window)` (SECURITY DEFINER) that keys on `auth.uid()` internally; `REVOKE` the raw `check_user_rate_limit` from `authenticated` (keep for `service_role`, which legitimately acts on behalf of a resolved user). All authenticated rate-limit checks call the wrapper.
- SEC-07: `REVOKE` execute on `cleanup_rate_limits()` / `cleanup_user_rate_limits()` from PUBLIC/anon/authenticated; grant `service_role`; run via cron.
- SEC-08 (code task, not SQL): change the money-path helpers to fail-CLOSED, wire the limiter into checkout and coupon-scan actions, and report every RPC error to monitoring. The canonical `redeem_coupon` already calls the limiter internally; the checkout action must add it.

---

## 6. Israeli Privacy Protection Law + PCI-DSS scope

### 6.1 Israeli Privacy Protection Law (חוק הגנת הפרטיות) + Amendment 13
Effective Aug 2025; obligations engaged: data minimization, defined purpose, transparency, right to inspect/correct, deletion.
Controls in the design (binding): defaults `marketing_email/sms/whatsapp = false`; consent captured as append-only legal evidence in `consent_events` (channel, topic, action, source, wording_version, ip, user_agent), retained forever. Account deletion is pseudonymization: `fn_execute_account_deletion` (service-role, daily cron, 30-day grace) scrubs PII including inside `audit_log.changes/ip/user_agent`, revokes the Cardcom token via API before DB deletion, keeps `auth.users` as a blocked shell, and retains financial records 7 years per the Income Tax Ordinance bookkeeping rules. Analytics: IP truncated to /24 (IPv6 /48), no third-party pixels, `props` never carry PII, `user_id` written server-side only and zeroed on deletion. Anti-spam Communications Law §30א: opt-in only, "פרסומת" labeling, free same-channel unsubscribe (HMAC-signed, no login), quiet hours. The consent banner wording needs legal review before production.
Open items: coupon voucher minimum validity under Israeli consumer-protection law (SUPPLIER §9.3) and the fate of the platform's pre-collected amount on an expired unredeemed coupon (SUPPLIER §9.4) both require legal advice; flagged, not resolved here.

### 6.2 PCI-DSS scope
Cardholder data flow: the customer enters the PAN on the Cardcom-hosted Low Profile page (Cardcom's domain/iframe), not on any KenyonExpress page. We never receive, process, transmit, or store the PAN; we store only a Cardcom token + last4 + brand + expiry.
Ruling: this qualifies for SAQ-A (fully outsourced cardholder data handling to a PCI-DSS-validated third party), with the standard SAQ-A conditions, which we must uphold:
1. No card form or card fields ever served from our origin (Low Profile hosted page / redirect only) — enforced by design.
2. Our pages that link to the payment page must be served over TLS with integrity (add CSP `form-action`/`frame-src` allowing only `secure.cardcom.solutions`, and Subresource Integrity discipline).
3. The token is not cardholder data, but treat it as sensitive: REVOKE from all browser roles (029), never log it, redact it from audit (029 dedicated trigger).
4. Confirm Cardcom's current PCI-DSS AoC on file annually.
Anything that would pull a PAN onto our origin (a self-hosted card form, storing PAN, a JS tokenizer running in our page context) would escalate us to SAQ-A-EP or higher: prohibited. Verdict: SAQ-A is correct and achievable; the only gap to reach it is shipping the CSP/security headers (currently absent, PRODUCTION-OPS 4.1) and the `env.ts` guard.

---

## 7. Audit logging: requirements vs `audit_log` schema

Schema (011, consolidated by 025): `audit_log(id, actor_id, actor_role, action audit_action, entity_type, entity_id, changes jsonb, metadata jsonb, ip_address, user_agent, created_at)`; append-only via RLS (`false` on I/U/D), admin-select; indexes on actor, entity, action, time. `audit_action` enum: created/updated/deleted/restored/login/logout/permission_change/status_change/manual_override.

Requirements mapping and gaps:

| Requirement | Status | Gap / fix |
|-------------|--------|-----------|
| Every financial + permission write is audited | Generic `audit_log_trigger_fn` attached across money/permission tables (025-034 drafts) | SEC-13: in the applied DB (<=025 not yet applying the draft trigger repoint), verify the writer is live. Real writes historically went to `admin_audit_log`, which draft 025 drops after migrating rows. Until 025 is applied, wire the trigger or apply 025. 035 adds a fast-path: ensure `audit_log` has at least the security-events companion. |
| Auth events (login/logout) | Enum supports them; not currently written from `auth.ts` | Code task: emit login/logout into `audit_log` (or rely on Supabase auth logs + `security_events`). |
| Secrets never in audit | `payment_tokens` has a redacting trigger (029) | SEC-12: `supplier_bank_accounts` full account number lands in `audit_log.changes` via the generic trigger. 035 adds a dedicated redacting trigger for it and detaches the generic one. |
| Security anomalies (signature failures, rate-limit trips, redemption fraud, admin-sensitive actions) | Scattered across `payment_webhook_events`, `coupon_scan_events` | 035 adds `public.security_events` (append-only, admin-read, service/definer-write) as the single cross-cutting security signal table feeding `v_money_alarms`-style monitoring. |
| Retention | Forever for audit_log/consent/wallet/payments/payouts/coupon_redemptions; 90d for scan/agent/delivery; analytics 13mo | Accepted; cron enforces purges on the 90-day tables. |
| Tamper-evidence | RLS blocks Data-API writes | Service-role can still mutate history (SEC-13 residual). Decision: keep append-only via absence of policies; add a periodic integrity check comparing `audit_log` row counts/hashes is out of scope for 035 but recommended. |

---

## 8. Migration 035: what it does

`supabase/migrations/035_security_hardening.sql`, idempotent, safe whether or not drafts 026-034 are applied (every reference to a draft object is existence-guarded).

1. SEC-01: lock `fn_wallet_transfer` to `service_role` (grant lockdown: revoke EXECUTE from PUBLIC/anon/authenticated, grant to service_role) — existence-guarded, applied only if the function exists. The in-function caller guard is a later code task (needs a function-body recreate).
2. SEC-10: revoke execute on legacy `fn_redeem_coupon` (026).
3. SEC-02: drop `affiliates_user_update`.
4. SEC-03: recreate `profiles: admin all` WITH CHECK; add `enforce_role_change_privilege()` trigger.
5. SEC-04: drop `coupons_supplier_mark_used` on `coupon_codes`.
6. SEC-06: drop stale ALL policies on products/variants/images/categories/vendors; drop dead `products: vendor read own`.
7. SEC-09: tighten `carts` WITH CHECK.
8. SEC-11: add `enforce_supplier_member_role()` trigger (guarded; only if `supplier_members` exists).
9. SEC-05 + SEC-07: add `check_my_rate_limit()`; revoke raw limiter + cleanup functions from browser roles, grant service_role.
10. SEC-12: dedicated `audit_supplier_bank_accounts_fn()` redacting trigger (guarded).
11. SEC-13/7: create `public.security_events` (append-only, admin-read, RLS enabled).
12. SEC-14: make demo-vendor seeding refuse to run when a `KE_ENV=production` marker is set (documented guard; the seed lives in 023, so 035 adds a defensive check function for future seeds).

Apply order: after 034. On the live DB (currently at 025), 035 is still safe: guards skip the draft-dependent statements until those drafts are applied, and the fixes that target applied objects (SEC-02/03/04/06/09) run immediately. Re-run 035 after applying 026-034 to activate the remaining guarded fixes (idempotent).
