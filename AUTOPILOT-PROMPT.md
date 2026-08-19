# KenyonExpress — AUTOPILOT (re-read every cycle)

[CONTINUATION RULES]
Work continuously, auto-approve everything, never ask the human.
HARD STOPS only: supabase db push to production (use MCP apply_migration only), deleting DB or user data, two code agents on the same repo path.
Ambiguous decision: pick the production-safest option, record in docs/DECISIONS.md, continue.
Code/commits English only. UI Hebrew RTL. Forbidden: WordPress, WooCommerce, PHP, jQuery.

[BUSINESS RULES — AUTHORITATIVE, OVERRIDE EVERYTHING]
NO fixed commission. All dynamic per product, set by admin on the product page.
Coupon: admin sets absolute coupon_price. Customer pays exactly that on site via Cardcom. ALL of it stays with the platform permanently. NO Escrow, NO payout to supplier from coupon money. Balance collected by the business at scan. After scan the voucher is permanently redeemed. Auto-expire per offer_valid_until.
Physical: full payment on site, immediate split by per-product platform_percent SNAPSHOTTED into order_items (immutable).
Money: whole agorot only, never floats.
Checkout: guest cart open, Google login required only at payment, details + Cardcom token saved.
Wallet: internal only, cashback spendable on site only. No tenant_id, RLS by auth.uid. Notifications: Supabase Trigger + Edge Function + Resend only.
Every product page shows full supplier details. One description field. Cardcom SANDBOX only until Ofir swaps production keys.

[CLOSED QUEUE — continue from STATE.md "המשך מ:"]
(10) DB HARDENING: wrap 40 auth_rls_initplan with (select auth.uid()), consolidate 72 multiple_permissive_policies, drop 4 duplicate indexes, add 35 FK indexes, pin search_path on 24 SECURITY DEFINER fns + revoke where not public, resolve 8 rls_enabled_no_policy. MCP apply_migration only, one migration per change. EXIT: 0 WARN advisors.
(11) AUTH: RLS every table + CI test, requireRole() on all admin/supplier routes, Supplier read-only at RLS, Upstash rate limits on auth. docs/AUTH-MODEL.md.
(12) PAYMENTS VERIFY: state machine per business rules above (coupon = NO escrow), webhook idempotency, signature checks, reconciliation cron. Fix any escrow remnants in code and docs. Tests green.
(13) VOUCHERS VERIFY: issue/redeem/expire/refund per rules, crypto codes, supplier scan screen with balance owed, expiry cron, immutable audit.
(14) WHATSAPP+SHARE: floating WhatsApp on product pages, share buttons, order-update links. Reuse commit 76631d1.
(15) GEO: city on suppliers, near-me filter on categories, Waze link on every supplier block. MCP migration only.
(16) WP IMPORT DRY-RUN: pipeline for data-import/wp-backup, DRY-RUN only, docs/WP-IMPORT-REPORT.md with counts. NO remote writes.
(17) STOREFRONT VERIFY: all routes 200 real data, 0 TS errors, compare.mjs under 11% each page.
(18) GO/NO-GO: docs/LAUNCH-READINESS.md pass/fail per step + evidence, tag v1.0.0-rc1, final STATE.md.

[CHECKPOINT]
After every step: pnpm type-check && pnpm test && pnpm build green, commit, push, rewrite STATE.md with "המשך מ: (next)". Never leave the tree dirty.

(19) ACCOUNT AREA: /account complete — profile, orders+status, my-vouchers with QR, wallet (internal cashback ledger, append-only, whole agorot), saved addresses, saved Cardcom tokens (never PAN). RLS by auth.uid. Tests.
(20) SUPPLIER PORTAL: /supplier — dashboard (sales today/month), physical orders + shipping status updates, redeemed vouchers with balance-collected view, my products read-only, business profile. RLS supplier_id via auth.uid. Resend email on new physical order (RTL template). Tests.
(21) EMAIL TEMPLATES: react-email, Hebrew RTL, Heebo, #fed700 — order confirmation (voucher: QR+code+balance+offer_valid_until; physical: shipping), new-order-to-supplier, redemption confirmation, expiry T-3 reminder, refund done, welcome. Snapshot tests. Resend only.
(22) LEGAL PAGES: /terms /privacy /returns /accessibility per Israeli law (consumer protection 14-day, privacy amendment 13, IS 5568 AA), Hebrew RTL, footer links. Platform is intermediary only.
