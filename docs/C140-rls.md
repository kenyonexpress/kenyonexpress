# C140 — RLS audit (2026-11-02)

Project `ixvwfbuvfxxsjiywhbbb`, all queries via `supabase db query --linked`.

## Gate output

### 1. rowsecurity on every public table
```
$ supabase db query --linked "select count(*) filter (where not c.relrowsecurity) rls_off, count(*) total from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')" -o csv
rls_off,total
0,143
```

### 2. Migration 322 applied (one file, `-f`)
```
$ supabase db query --linked "select has_column_privilege('anon','public.suppliers','notes','SELECT') anon_notes_before" -o csv
anon_notes_before
true
$ supabase db query --linked -f migrations/pending/322_rls_suppliers_column_grants.sql -o csv
$ supabase db query --linked "select has_column_privilege('anon','public.suppliers','notes','SELECT') anon_notes, has_column_privilege('authenticated','public.suppliers','contact_email','SELECT') auth_email, has_column_privilege('anon','public.suppliers','name','SELECT') anon_name, has_column_privilege('authenticated','public.suppliers','min_payout_ils','SELECT') auth_minpayout, (select count(*) from supabase_migrations.schema_migrations where version='20261102120026') recorded" -o csv
anon_notes,auth_email,anon_name,auth_minpayout,recorded
false,false,true,true,1
```

### 3. pgTAP: `tests/rls/c140_rls_audit.test.sql`
The suite runs in one transaction that ends in ROLLBACK, pgtap included.
```
$ supabase db query --linked -f tests/rls/c140_rls_audit.test.sql -o csv
line
1..31
ok 1 - every public table has row level security enabled
ok 2 - no client-role write policy is unconditionally true
ok 3 - USING (true) reads are limited to the four reviewed public catalogue tables
ok 4 - anon has no write policy outside cookie_consent
ok 5 - profiles super_admin MFA policy is restrictive
ok 6 - profiles.role / supplier_id are guarded by trigger
ok 7 - every client-readable public view is security_invoker
ok 8 - no materialized view in public is client-readable
ok 9 - anon cannot read suppliers.notes
ok 10 - anon cannot read supplier contact identity / business_id
ok 11 - authenticated cannot read supplier internal columns
ok 12 - anon keeps the storefront supplier columns
ok 13 - anon sees no orders
ok 14 - anon sees no profiles
ok 15 - anon sees no payments
ok 16 - anon sees no payment tokens
ok 17 - anon sees no addresses
ok 18 - anon sees no wallet accounts
ok 19 - anon sees no vouchers
ok 20 - anon sees no audit log
"ok 21 - anon sees only active, non-deleted products"
ok 22 - anon select suppliers.notes is denied
ok 23 - anon can still read storefront supplier columns
ok 24 - anon cannot insert orders
ok 25 - stranger sees no orders
ok 26 - stranger sees no profiles
ok 27 - stranger sees no payment tokens
ok 28 - stranger sees no addresses
ok 29 - stranger sees no wallet entries
ok 30 - stranger sees no admin users
ok 31 - stranger select suppliers.contact_email is denied
$ supabase db query --linked "select count(*) pgtap_installed from pg_extension where extname='pgtap'" -o csv
pgtap_installed
0
```
31/31 ok, 0 failed.

## Policy map per role (summary of 318 policies)

| Class | Tables | Roles / rule |
|---|---|---|
| Deny-all, no policy (service_role only) | affiliate_attributions, auth_wa_otps, fraud_review_queue, invoice_counters, job_dlq, media_ingest_queue, otp_attempts, sms_opt_outs, supplier_agreements, supplier_card_tokens, supplier_card_verifications, vouchers_redemption_events | RLS on and no policies, so client roles get nothing |
| Explicit RESTRICTIVE deny `false` | coupon_redemptions, legacy_percent_archive_112, payment_discrepancies, rate_limits, referral_signals, revenue_daily, scheduled_price_changes, search_index_dlq, search_index_outbox, settlement_events, stock_reservations, stock_waitlist, user_rate_limits, wishlist_stock_state | anon + authenticated denied |
| Public catalogue read | products, product_variants, categories, banners, homepage_sections, popular_searches, seo_redirects, pickup_points, club_tiers, club_tier_benefits, supplier_branches, coupon_deals, cashback_rules, coupons, customer_segments, suppliers | anon/authenticated SELECT gated on is_active / status='active' / deleted_at is null; writes is_admin() / has_role('admin'|'content_uploader') |
| USING (true) read (reviewed, non-sensitive) | feature_flags, media_assets, price_history, shipping_zones | anon + authenticated SELECT |
| Owner (auth.uid()) | orders, order_items, payments, payment_tokens, user_addresses, wallet_*, vouchers, voucher_*, notifications*, push_*, wishlists*, stock_notifications, gift_cards, invoices, refunds, subscriptions, support_tickets*, webauthn_credentials, sms_consent, sms_unsubscribes, cashback_ledger, referrals, cookie_consent, carts (uid or request.cookies session_id) | authenticated; anon auth.uid() is null, so no rows |
| Supplier member | orders/order_items (paid+, is_supplier_order), escrow_holds, split_executions, payout_statements(+lines, non-draft), vouchers (redeemed_by), supplier_members (owner), supplier_branches (owner/manager write), supplier_staff | authenticated via is_supplier_member/is_supplier_owner |
| Staff | admin-only read on analytics/report_*/fraud*/audit_log/ai_usage/whatsapp_*/email_suppressions etc. | is_admin() / is_support() / current_user_role() |
| Hardening already present | profiles: RESTRICTIVE `profiles_super_admin_mfa` (aal2) + trigger `enforce_profile_privilege_columns` blocks self role/supplier_id change; audit_log insert/update/delete `false` | |
| Views (14) | all `security_invoker=true/on`; no materialized views exposed | |

## Findings

1. **FIXED (322): `suppliers` column leak.** `suppliers_select_unified` (public, `deleted_at is null`) plus a table-level SELECT grant meant anon could read `notes`, `contact_name`, `contact_email`, `business_id`, `verified_by`, `payout_hold_business_days`. Now there are column grants only: storefront columns for anon + authenticated, plus `min_payout_ils` for authenticated (the /admin/payouts session client). I checked every session/anon-client read in `src/` (supplier-storefront, home-data, sitemap, category/city embeds, vouchers embeds, cart, checkout, rbac, payouts, dashboards): they select only granted columns. Every `select('*')` on suppliers goes through `createAdminClient()`.
2. **Follow-up (not fixed here, would break `select('*')` anon catalogue reads, e.g. `home-data.ts activeProducts('*, …')`):** anon can read `products.cost_ils`, `platform_percent`, `commission_percent`, `supplier_split_percent`, `profit_share_cap_percent`, `approval_note`. The fix needs explicit column lists in catalogue queries first, then column grants.
3. **Follow-up, low:** `coupons` "Public can view coupons" exposes `code` to anon (the table has 0 rows today). `payment_tokens` owners can UPDATE `cardcom_token`/`cardcom_account_id` (with_check pins profile_id, so they can't take over another user's row). `notification_deliveries` owners can INSERT/UPDATE. `supplier_members_select_unified` has a duplicated `is_supplier_owner()` term (cosmetic).

## Files
- `migrations/applied/322_rls_suppliers_column_grants.sql` (written to pending, applied, moved)
- `migrations/pending/preflight_322.sql`
- `tests/rls/c140_rls_audit.test.sql`

RESULT: DONE
