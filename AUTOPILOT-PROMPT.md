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

(23) PIXEL WAVE (after 17 passes): run compare.mjs per page vs refs/ke_live_singlefile.html. Fix section-by-section via tokens only (no hardcoded hex/px) until every page under 11%, then push toward 7%. Pages: home, category, product (coupon + physical), cart, checkout, account, supplier. Screenshot evidence per page in refs/. Commit per page.
(24) SEED CONTENT WAVE: build scripts/seed with 60 realistic Hebrew products across the agreed categories (מסעדות, ספא, תינוקות, אפל, צימרים) — coupon_price absolute for coupons, platform_percent for physical, full supplier details, offer_valid_until, Unsplash image URLs list. Idempotent upsert, dry-run default. Run dry-run, write docs/SEED-REPORT.md. NO real DB writes without Ofir.
(25) BACKUP+RECOVERY: document and script DB backup strategy — verify PITR status via MCP, add scripts/backup-schema.sh (local schema dump via MCP), write docs/DISASTER-RECOVERY.md with restore steps + RTO/RPO targets. No destructive ops.
(26) FINAL SWEEP: re-run full advisors via MCP, re-run all tests, re-run Lighthouse on all routes, update LAUNCH-READINESS.md verdict, update OFIR-RETURN-BRIEF.md with the complete picture + numbered critical questions + the exact 3 next paste-blocks for Ofir. Tag v1.0.0-rc2 if all green.

[FINAL EXIT PROTOCOL]
When ALL steps 0-26 are complete and green:
1. Write docs/PROJECT-COMPLETE.md: full summary of everything built since project start, evidence per step (test counts, lint counts, page diffs), and a numbered list titled "שאלות פתוחות לאופיר" — every ambiguity you resolved alone, what you chose, and why (brief, in Hebrew).
2. Update OFIR-RETURN-BRIEF.md: top line "הפרויקט הושלם באופן מוחלט. ממתין רק ל: תוכן אמיתי, ספקים, מפתחות Cardcom, DNS cutover."
3. Tag v1.0.0.
4. Create the file /Users/ofir/kenyonexpress-web/PROJECT-DONE.flag with the completion date.
5. After the flag exists, do NOT start new work — each cycle only verifies tests still pass and answers nothing new.
If a step cannot pass after 3 full attempts: document the blocker in OFIR-RETURN-BRIEF.md under "חסום — דורש את אופיר", skip it, continue to the next step.

[FINAL EXIT PROTOCOL]
When ALL steps 0-26 are complete and green:
1. Write docs/PROJECT-COMPLETE.md: full summary of everything built since project start, evidence per step (test counts, lint counts, page diffs), and a numbered list titled "שאלות פתוחות לאופיר" — every ambiguity you resolved alone, what you chose, and why (brief, in Hebrew).
2. Update OFIR-RETURN-BRIEF.md: top line "הפרויקט הושלם באופן מוחלט. ממתין רק ל: תוכן אמיתי, ספקים, מפתחות Cardcom, DNS cutover."
3. Tag v1.0.0.
4. Create the file /Users/ofir/kenyonexpress-web/PROJECT-DONE.flag with the completion date.
5. After the flag exists, do NOT start new work — each cycle only verifies tests still pass.
If a step cannot pass after 3 full attempts: document the blocker in OFIR-RETURN-BRIEF.md under "חסום — דורש את אופיר", skip it, continue to the next step.

[PROVISIONAL DECISIONS — Ofir did not answer; safest defaults chosen. Every one of these MUST also be written to docs/DECISIONS.md with "ממתין לאישור אופיר" and listed in PROJECT-COMPLETE.md under שאלות פתוחות]
D1. Default voucher validity: 90 days when admin sets no date (longest = safest for consumer law).
D2. Unredeemed voucher cancellation within 14 days: full refund to card via Cardcom (consumer-law-safest). Wallet credit offered as optional faster path.
D3. Expired unredeemed voucher: automatic wallet credit of the amount paid (never silent forfeiture).
D4. Cashback: 0% at launch. Wallet infrastructure built and tested, cashback_rules table ready, rate configurable in admin, disabled by default.
D5. Max units per order: 5 per product per customer, overridable per product in admin.
D6. Supplier scan: staff PIN required (full audit trail). PIN management in supplier portal.
D7. Email sender: noreply@kenyonexpress.co.il via Resend. All templates use it.
D8. Support phone/WhatsApp: placeholder constant SUPPORT_CONTACT_TBD in one config file, marked in DECISIONS.md.
D9. Company legal identity: placeholder COMPANY_LEGAL_TBD in terms/invoice templates, clearly marked, one-file swap.
D10. WP import: build + dry-run only. Real import stays OFF until Ofir approves.
D11. Homepage category order: mirror groo.co.il ordering logic; fallback: מסעדות, ספא, צימרים, תינוקות, אפל.
D12. Pixel gate: 11% hard gate for all pages; push toward 7% only after step 26 passes everything else.

(27) MERGE NIGHT BRANCHES: merge into the working branch, in order, resolving conflicts with tests green after each: feat/voucher-redemption, feat/account-wallet, feat/supplier-portal, docs/architecture-night, test/e2e-full, ci/foundation-v2, feat/seed-data, feat/email-templates, feat/legal-pages (skip any branch that does not exist). Delete merged branches local+remote. Update the 4 open PRs: merge or close each with a one-line reason.
(28) AFFILIATES WAVE: implement per docs/ARCHITECTURE-AFFILIATES-REFERRALS.md if it exists, else design minimal: affiliate links with tracking, admin-set percent, credit to internal wallet only (never cash out), /affiliate dashboard, refer-a-friend dual cashback, anti-fraud (self-referral block). MCP migrations only. Tests.
(29) WHATSAPP-BUTTON + GEO VERIFY: confirm floating WhatsApp with supplier number renders on every product page, Waze deep-link works on every supplier block, near-me filter functional. Fix gaps. compare.mjs stays under gates.
