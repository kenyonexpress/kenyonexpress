# KenyonExpress — Project State (autopilot branch pointer)

The canonical state file on this branch is the root `STATE.md`. This file
exists because the goal queue names `claude/STATE.md`; it holds the resume
line only, and the full block for each goal is in the root file.

**המשך מ: M16-c206 DONE**

M07-c193: TODO/FIXME scan. Markers older than 7 days (cardcom.ts x2, r2-migration.ts x4, screenshot-all.mjs, stock-notifications route) are all already filed as docs/BACKLOG.md #8-11. Wallet TODOs were added 2026-10-25 (under 7 days); the whatsapp.test.ts 'TODO' is a test value. No FIXME. No code change.

G15: `/supplier/redeem/<code>` page (short code, manual scan). Reuses RedeemConfirm + redeem_voucher() via /api/supplier/vouchers/redeem (not-redeemed, not-expired, voucher_redemptions row, unique success index locks re-redeem). Refusals: malformed, not found, read failure, rate limit; KEV1 token redirected to /redeem/<token>. No new migration.

Previous: G13 DONE

G13: `PushToggle` on /account/notifications, migration `301_push_subscriptions.sql` in pending (not yet applied: Supabase MCP unauthorized in this session). Install banner, subscribe API, VAPID sender, T-7/T-1 and order-status push already existed.

Previous: F43 DONE mobile 8.53%

Last goal: F43, home parity gate on the rebuilt tree, by the goal's literal
`pnpm run compare` command and by a fresh archive shot: 380px 8.53% PASS,
768px 9.79% PASS, 1440px 8.08% PASS. Deals card title at live's measured
26.4px / 500 / 8px in `src/components/ProductDealCard.module.css`, live's
-0.14px body letter-spacing in `src/app/globals.css`, gate flags
`--widths`, `--baseline`, `--live-url` in `scripts/compare-args.mjs`. Rows in
`docs/UI-PARITY-REPORT.md`, 2026-10-21.
M08-c181 Lighthouse mobile (local `next start`, simulated throttling, 2026-10-25): `/` perf 86 / a11y 100 / BP 96 / SEO 100 (FCP 1.5s, LCP 4.1s, TBT 50ms, CLS 0.019); `/product/עוזרת-אישית-שירותי-משרד` perf 82 / a11y 100 / BP 96 / SEO 100 (FCP 1.7s, LCP 4.8s, TBT 40ms, CLS 0). LCP is the drag on both. Localhost simulated scores are noisy, see docs/PERFORMANCE-BUDGET.md.
M09-c181 Removed unused dep html5-qrcode (+lockfile), deleted dead src/lib/geographic-edge.ts, isSupportRole, anyChip, getUserRFMScore, getAllSegments. Kept @mdx-js/* (peers of @next/mdx) and lighthouse (used by scripts). ~400 remaining unreferenced type/const exports left as-is (public module shape; unexporting is churn).

M13-c182 BLOCKED: /api/ready 200; /api/health 503 (MEILI_* env unset, search not_configured; DB ok)


M08-c183 Lighthouse mobile (local next start, 3 runs): / perf 86/90/87 (LCP 3.3-4.1s); /product perf 98/98/98 (LCP 2.2s). Log: logs/lighthouse-m08-c183.txt

M15-c183 BLOCKED locked-component: console on / and /product has ~1030 and ~116 errors (380/768/1440, fresh next start). Cause: prerendered (PPR) HTML emits 19 async chunk <script src> + inline scripts with no nonce, blocked by strict-dynamic CSP (src/proxy.ts). Fix needs dynamic rendering in src/app/layout.tsx (forbidden).


M06-c184 pnpm build passes clean on autopilot @ 265f1b65b; no drift to fix (only untracked src/lib/supplier-onboarding.staging.test.ts from F57, live-staging test, left uncommitted).


M07-c184 TODO/FIXME scan: 1 new item (stock-notifications route.ts:126) filed as BACKLOG #11; other 8 hits already in BACKLOG #8-10 or test fixture (whatsapp.test.ts).


M05-c185 pnpm test drift: 13 failing files reduced to 2 (6840+ pass). Fixed: migrations 305-308 inventory/manifest/preflights (F55 had saved DDL as preflight_305.sql, now 308_order_lifecycle_transition_guards.sql), e2e classification, token colours in wallet, logger/withActionContext/withRequestLog wrappers, discarded Supabase errors, admin withdrawal + supplier-approval actions now role-guarded, /supplier/scan back to the guarded /scan redirect, cardcom integration test mock. Still red: wallet-internal-only (2) and account-labels (1): F58 customer withdrawals contradict WITHDRAWAL_RULE (wallet is non-withdrawable site credit, also in the published terms). Left as is: legal/product call, not drift.


M10-c185 BLOCKED supabase MCP unauthenticated: cannot verify migrations/pending (79 files) vs project ixvwfbuvfxxsjiywhbbb


M07-c186 DONE: TODO/FIXME scan, no FIXME; 8 TODOs older than 7 days all already filed in docs/BACKLOG.md (#8-#11); wallet/cardcom-refund.ts + wallet/integration.test.ts TODOs are from 2026-10-25 (under 7 days, left in place); whatsapp.test.ts "TODO" is a fixture string, not a marker.


M09-c186 DONE: no unused deps (lint-staged used by .husky/pre-commit); removed 3 fully-unreferenced files (AuthWithFallback, useAuth, useSearch); remaining unreferenced exports are type aliases/payment+migration scaffolding, left in place.

M05-c188 DONE: pnpm test green (584 files / 6876 tests), tsc clean. Root cause: F60 flipped money-format.ts to sign-first, undoing the measured bidi fix (reverted 4fa43b33b for money-format.ts + test). F62 order-paid webhook brought under guards: withRequestLog, CRON_SECRET bearer gate, admin client, log not console, fetchWithTimeout, siteUrl(); dashboard read error handled; chart yellow button text-gray-900; not-found test title synced.


M08-c189 DONE: Lighthouse mobile x3 on / and /product, medians 91 / 93 (logs/lighthouse-m08-c189.txt). Below G23 95 target; render-blocking CSS 450-900 ms is the lever.

M17-c190 DONE: RTL scan on / and /product (rtl-lint + grep of home/product components, globals.css): no LTR leaks; only hits are comments ("right-to-left" prose, Satori note) and tests. html dir=rtl lang=he confirmed. Static check only, no live render.
M11-c191 DONE: sitemap.xml verified. https://www.kenyonexpress.co.il/sitemap.xml = 200 application/xml, 75 urls, valid, lastmod 2026-10-24 (= newest catalogue update, cacheLife hours, Vercel HIT age ~14h, last-modified 24.10 20:47Z); robots.txt references it. FINDING: all <loc> use apex kenyonexpress.co.il (NEXT_PUBLIC_APP_URL unset -> siteUrl() default) but apex 308-redirects to www, so every sitemap URL is a redirect. Fix is Vercel env NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il (or make apex primary); no code change.
M13-c191 DONE-DEFERRED: prod https://www.kenyonexpress.co.il/api/ready = 200 (database/redis/meilisearch/r2/cardcom all ok). /api/health = 503: database ok, search down, search_detail=invalid_api_key (Meilisearch search key rejected on prod; /api/ready passes meilisearch so it only checks reachability). Fix is a valid MEILI search key in Vercel env, then re-run curl. No code change.

M08-c193 DONE: Lighthouse mobile x3 on / and /product (live www), medians 94 / 94 (logs/lighthouse-m08-c193.txt). Up from 91/93 in c189, 1 point under G23 95 target; no code changes.


M16-c193 DONE: product page src/app/(store)/product/[slug]/page.tsx (only PDP route) emits JSON-LD Product (buildProductJsonLd) + BreadcrumbList (buildBreadcrumbJsonLd) via src/lib/seo/json-ld.ts; json-ld.test.ts 26/26 pass; no code changes.


M07-c194 DONE: TODO/FIXME scan; all markers older than 7 days (cardcom.ts:249/:312, r2-migration.ts:103-106, stock-notifications route:126, screenshot-all.mjs:42) already filed in docs/BACKLOG.md items 8-11; new markers in src/lib/wallet/{cardcom-refund,integration.test}.ts are dated 2026-10-25 (under 7 days), whatsapp.test.ts "TODO" is a fixture string; no code changes.


M04-c195 DONE: pnpm type-check (tsc --noEmit) passes clean, no drift, working tree clean; no code changes.


M08-c198 DONE: Lighthouse mobile live, 3 runs each. Medians home 75 (runs 100/74/75, LCP variance 1.7-5.8s), product 97 (97/99/82). Log: logs/lighthouse-m08-c198.txt. No code changes.




M10-c199 BLOCKED supabase MCP unauthenticated: cannot apply migrations/pending (81 files). REST probe (service key OK) of tables created by pending migrations: 12 exist, 12 missing (affiliates, partner_api_keys, sms_broadcasts, address_book, supplier_applications, customer_wallet_payouts, passkey_credentials, others); 53 files have no CREATE TABLE and cannot be checked over REST. Nothing applied.

M11-c199 DONE sitemap.xml verified 2026-10-25: www.kenyonexpress.co.il/sitemap.xml 200 application/xml, 75 urls, newest lastmod 2026-10-24, sampled urls 200, robots.ts points at it. Finding: locs use apex host (siteUrl() fallback, NEXT_PUBLIC_APP_URL unset) and apex 308-redirects to www; fix is env NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il in Vercel (layout.tsx fallback is locked, no code change).

M04-c200 DONE 2026-10-26 pnpm type-check clean (tsc --noEmit exit 0), working tree clean, no drift to fix.

M07-c200 DONE 2026-10-26 TODO/FIXME rescan: 4 markers older than 7d (screenshot-all.mjs:42, cardcom.ts:249/:312, r2-migration.ts:103-106, stock-notifications/route.ts:126) all filed in docs/BACKLOG.md #8-11, line refs still match. wallet/cardcom-refund.ts + wallet/integration.test.ts markers dated 2026-10-25 (<7d) left in place. whatsapp.test.ts:91 is a deliberate test input, not a marker. No code change.
M12-c201 DONE 2026-10-26 robots.ts production-safe: allow '/', no blanket disallow, /c /product /category public; private paths (redeem, coupon, account, supplier, admin, checkout, cart, auth, api, debug) disallowed; sitemap+host default to https://kenyonexpress.co.il unless NEXT_PUBLIC_APP_URL set; robots.test.ts 7/7 pass. No code change.
M10-c202 BLOCKED 2026-10-26 migrations/pending/ NOT fully applied (read-only check vs live schema_migrations + information_schema). Missing live tables: affiliate_* (189), partner_api_keys/requests (190), observability (193), sms_broadcasts/recipients (287), address_book (302), supplier_applications (305), product_categories (306 upload fields), customer_wallet_payouts (307). 293/303/304/308/309 are function/trigger-only, unverified. Claude.ai Supabase MCP unauthorized in non-interactive session, so apply_migration unavailable; no other apply route allowed.
M10-c204 BLOCKED 2026-10-26 migrations/pending/ still NOT verified applied: 39 pending files (162-309) present; Supabase MCP (claude.ai Supabase) unauthorized in non-interactive session, so apply_migration on ixvwfbuvfxxsjiywhbbb unavailable and no other apply route is allowed. Prior live check (M10-c202) found 189/190/193/287/302/305/306/307 tables missing. No change.
M05-c206 DONE 2026-10-26 pnpm test green (586 files, 6888 tests). Drift fixed: Zod v4 strict uuid in vendor-form.test fixtures; parseProductsCsv.test expects omitted (not null) absent optionals; @sentry/node aligned to 10.76.2 with @sentry/nextjs, pin test updated.
M17-c207 DONE 2026-10-26 RTL runtime probe on / and 2 /product pages at 380/768/1440: html lang=he dir=rtl, body direction rtl, zero horizontal overflow, zero text-align:left on Hebrew text. Only dir=ltr hits: newsletter email input and empty SKU meta (intentional); plus locked HeroSlider.tsx standard_line/promo_small/promo_large <p dir=ltr> (Electro v7 hero mirror, locked, untouched).
המשך מ: M17-c207 DONE
M10-c208 BLOCKED 2026-10-26 migrations/pending/ (82 files) NOT verified applied: claude.ai Supabase MCP unauthorized in non-interactive session, so apply_migration/execute_sql on ixvwfbuvfxxsjiywhbbb unavailable. Last live check (M10-c202) found 189/190/193/287/302/305/306/307 tables missing. Nothing applied. המשך מ: M10-c208 BLOCKED
M12-c208 DONE 2026-10-26 robots.ts verified production-safe: allow / for *, disallows redeem/coupon/account/supplier/scan/admin/checkout/cart/auth/api/debug/reset+forgot-password; no blanket Disallow; no public/robots.txt conflict; sitemap+host from siteUrl() (falls back to https://kenyonexpress.co.il, trailing slash stripped); 7/7 robots.test.ts pass; test-* pages already noindex. Caveat: .env.local has localhost APP_URL, prod Vercel env not checked. No code change.
המשך מ: M12-c208 DONE
M05-c209 DONE 2026-10-26 pnpm test: 4 failures (2 files) from drift: 294_group_deals.sql (133ff1d7c) landed without README row, preflight, manifest regen or inventory entry. Added preflight_294.sql, README entry, inventory test entries, regenerated migration-manifest.ts. pnpm test now 587 files / 6898 tests pass. Migration NOT applied (Supabase MCP unauthorized). No locked files touched.
המשך מ: M05-c209 DONE
