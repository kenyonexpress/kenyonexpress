# KenyonExpress — Project State (autopilot branch pointer)

The canonical state file on this branch is the root `STATE.md`. This file
exists because the goal queue names `claude/STATE.md`; it holds the resume
line only, and the full block for each goal is in the root file.

**המשך מ: M07-c193 DONE**

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
המשך מ: M16-c183 DONE

M13-c182 BLOCKED: /api/ready 200; /api/health 503 (MEILI_* env unset, search not_configured; DB ok)

המשך מ: C14 BLOCKED (flags unwired, see docs/L13-FLAGS-REPORT.md)

M08-c183 Lighthouse mobile (local next start, 3 runs): / perf 86/90/87 (LCP 3.3-4.1s); /product perf 98/98/98 (LCP 2.2s). Log: logs/lighthouse-m08-c183.txt

M15-c183 BLOCKED locked-component: console on / and /product has ~1030 and ~116 errors (380/768/1440, fresh next start). Cause: prerendered (PPR) HTML emits 19 async chunk <script src> + inline scripts with no nonce, blocked by strict-dynamic CSP (src/proxy.ts). Fix needs dynamic rendering in src/app/layout.tsx (forbidden).

המשך מ: M15-c183 BLOCKED

M06-c184 pnpm build passes clean on autopilot @ 265f1b65b; no drift to fix (only untracked src/lib/supplier-onboarding.staging.test.ts from F57, live-staging test, left uncommitted).

המשך מ: M06-c184 DONE

M07-c184 TODO/FIXME scan: 1 new item (stock-notifications route.ts:126) filed as BACKLOG #11; other 8 hits already in BACKLOG #8-10 or test fixture (whatsapp.test.ts).

המשך מ: M07-c184 DONE

M05-c185 pnpm test drift: 13 failing files reduced to 2 (6840+ pass). Fixed: migrations 305-308 inventory/manifest/preflights (F55 had saved DDL as preflight_305.sql, now 308_order_lifecycle_transition_guards.sql), e2e classification, token colours in wallet, logger/withActionContext/withRequestLog wrappers, discarded Supabase errors, admin withdrawal + supplier-approval actions now role-guarded, /supplier/scan back to the guarded /scan redirect, cardcom integration test mock. Still red: wallet-internal-only (2) and account-labels (1): F58 customer withdrawals contradict WITHDRAWAL_RULE (wallet is non-withdrawable site credit, also in the published terms). Left as is: legal/product call, not drift.

המשך מ: M05-c185 BLOCKED wallet withdrawal vs non-withdrawable wallet rule

M10-c185 BLOCKED supabase MCP unauthenticated: cannot verify migrations/pending (79 files) vs project ixvwfbuvfxxsjiywhbbb

המשך מ: M10-c185 BLOCKED supabase-mcp-auth

M07-c186 DONE: TODO/FIXME scan, no FIXME; 8 TODOs older than 7 days all already filed in docs/BACKLOG.md (#8-#11); wallet/cardcom-refund.ts + wallet/integration.test.ts TODOs are from 2026-10-25 (under 7 days, left in place); whatsapp.test.ts "TODO" is a fixture string, not a marker.

המשך מ: M07-c186 DONE

M09-c186 DONE: no unused deps (lint-staged used by .husky/pre-commit); removed 3 fully-unreferenced files (AuthWithFallback, useAuth, useSearch); remaining unreferenced exports are type aliases/payment+migration scaffolding, left in place.

M05-c188 DONE: pnpm test green (584 files / 6876 tests), tsc clean. Root cause: F60 flipped money-format.ts to sign-first, undoing the measured bidi fix (reverted 4fa43b33b for money-format.ts + test). F62 order-paid webhook brought under guards: withRequestLog, CRON_SECRET bearer gate, admin client, log not console, fetchWithTimeout, siteUrl(); dashboard read error handled; chart yellow button text-gray-900; not-found test title synced.

המשך מ: M05-c188 DONE

M08-c189 DONE: Lighthouse mobile x3 on / and /product, medians 91 / 93 (logs/lighthouse-m08-c189.txt). Below G23 95 target; render-blocking CSS 450-900 ms is the lever.

המשך מ: M08-c189 DONE
המשך מ: M16-c189 DONE
המשך מ: M07-c190 DONE (TODO/FIXME scan: all items older than 7d already in docs/BACKLOG.md #8-#11; wallet/cardcom-refund.ts + wallet/integration.test.ts TODOs added 2026-10-25, under 7d, not yet eligible; no code changes)
M17-c190 DONE: RTL scan on / and /product (rtl-lint + grep of home/product components, globals.css): no LTR leaks; only hits are comments ("right-to-left" prose, Satori note) and tests. html dir=rtl lang=he confirmed. Static check only, no live render.
המשך מ: M17-c190 DONE
M11-c191 DONE: sitemap.xml verified. https://www.kenyonexpress.co.il/sitemap.xml = 200 application/xml, 75 urls, valid, lastmod 2026-10-24 (= newest catalogue update, cacheLife hours, Vercel HIT age ~14h, last-modified 24.10 20:47Z); robots.txt references it. FINDING: all <loc> use apex kenyonexpress.co.il (NEXT_PUBLIC_APP_URL unset -> siteUrl() default) but apex 308-redirects to www, so every sitemap URL is a redirect. Fix is Vercel env NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il (or make apex primary); no code change.
המשך מ: M11-c191 DONE
M13-c191 DONE-DEFERRED: prod https://www.kenyonexpress.co.il/api/ready = 200 (database/redis/meilisearch/r2/cardcom all ok). /api/health = 503: database ok, search down, search_detail=invalid_api_key (Meilisearch search key rejected on prod; /api/ready passes meilisearch so it only checks reachability). Fix is a valid MEILI search key in Vercel env, then re-run curl. No code change.
המשך מ: M13-c191 DONE-DEFERRED
המשך מ: M15-c191 BLOCKED (console check live www: / @380 still pageerror React #418 hydration mismatch + 429 on /monitoring Sentry tunnel; /product @380+1440 and / @1440 not assessable, Vercel bot challenge returned 403/708 after repeated runs; no code changes; #418 source likely in locked hero/header components)

M08-c193 DONE: Lighthouse mobile x3 on / and /product (live www), medians 94 / 94 (logs/lighthouse-m08-c193.txt). Up from 91/93 in c189, 1 point under G23 95 target; no code changes.

המשך מ: M08-c193 DONE

M16-c193 DONE: product page src/app/(store)/product/[slug]/page.tsx (only PDP route) emits JSON-LD Product (buildProductJsonLd) + BreadcrumbList (buildBreadcrumbJsonLd) via src/lib/seo/json-ld.ts; json-ld.test.ts 26/26 pass; no code changes.

המשך מ: M16-c193 DONE

M07-c194 DONE: TODO/FIXME scan; all markers older than 7 days (cardcom.ts:249/:312, r2-migration.ts:103-106, stock-notifications route:126, screenshot-all.mjs:42) already filed in docs/BACKLOG.md items 8-11; new markers in src/lib/wallet/{cardcom-refund,integration.test}.ts are dated 2026-10-25 (under 7 days), whatsapp.test.ts "TODO" is a fixture string; no code changes.

המשך מ: M07-c194 DONE

M04-c195 DONE: pnpm type-check (tsc --noEmit) passes clean, no drift, working tree clean; no code changes.

המשך מ: M04-c195 DONE
