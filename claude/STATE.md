**המשך מ: M07-c227 DONE (2026-10-27): TODO/FIXME scan: 6 markers in src/ (cardcom.ts x2, r2-migration.ts x4), all >7d old per git blame and already filed in docs/BACKLOG.md #1-3; blocked on Cardcom prod creds / R2 feature work; no new items, no forbidden files touched**
**המשך מ: M07-c226 DONE (2026-10-27): TODO/FIXME scan: 6 markers in src/ (cardcom.ts x2, r2-migration.ts x4), all >7d old and already filed in docs/BACKLOG.md; none resolvable without Cardcom prod creds / Supabase service work; no new items**
**המשך מ: M13-c225 DONE (2026-10-27): live dev server against real Supabase (service key valid) — /api/health 200 {database:ok, search:not_configured}, /api/ready 200 {database,redis,cardcom ok; meilisearch,r2 not_configured}; no code change**
**המשך מ: M04-c225 DONE (2026-10-27): pnpm type-check (tsc --noEmit) clean, zero errors; no drift, no code change**
**המשך מ: M12-c223 DONE (2026-10-26): robots.ts verified production-safe — allow / , disallows redeem/coupon/account/supplier/admin/scan/checkout/cart/auth/api/debug/voucher/reset+forgot-password; sitemap+host from NEXT_PUBLIC_APP_URL (.env.production = https://kenyonexpress.co.il, fallback same, trailing slash stripped); robots.test.ts 7/7 pass; no code change**
**המשך מ: M05-c223 DONE (2026-10-26): pnpm test green (615 files / 7064 tests pass, 28 skipped); no test drift, no code change**
**המשך מ: M09-c223 DONE (2026-10-26): knip re-audit — drizzle-orm/postgres flagged only because drizzle.config.ts fails to load without SUPABASE_DB_URL (src/db/schema + scripts use them); pg used by scripts; @capacitor/android backs android/; no safe removals, no code change**
**המשך מ: M09-c222 DONE (2026-10-26): knip (dependencies) re-audit — only unused dep is @capacitor/android (kept, native android/ platform); remaining unused exports are public API / scripts / locked components; no code change**
**המשך מ: M15-c221 DONE-DEFERRED (2026-10-26): console probe on / and /product/<slug> (dev server, 1440px); remaining errors are dev-only (React eval CSP, vercel debug scripts CSP, blocking-prerender dev warning) plus Supabase "Invalid API key" (400s, product_detail.supplier_load_failed, /api/cart) = cred-dependent, deferred until post-C51 recovery; no code change**
**המשך מ: M05-c221 DONE (2026-10-26): pnpm test green (615 files / 7064 tests pass, 28 skipped); no test drift, no code change; committed only generated docs/UI-PARITY-REPORT.md; left src/app/(store)/page.tsx uncommitted (not mine)**
**המשך מ: M04-c221 DONE (2026-10-26): pnpm type-check green (tsc --noEmit, 0 errors); committed only generated docs/UI-PARITY-REPORT.md drift; left uncommitted src/app/(store)/page.tsx (CitiesRow hidden sm:block, not mine, gate unverified); no code changes**
**המשך מ: M18-c220 DONE (2026-10-26): claude/STATE.md already 185 lines (<300); full history already in docs/STATE-ARCHIVE.md (28274 lines); nothing to trim, no code change**
**המשך מ: M17-c220 DONE (2026-10-26): RTL on / and /product sample: html dir=rtl, rtl-lint hits on those routes are symmetric/false-positive (left-0 right-0, 50% centering, comments); only dir=ltr is the Electro carousel arrows in forbidden HeroSlider; latin-field-direction + BenefitBar tests pass; no code change**
**המשך מ: M16-c220 DONE (2026-10-26): product page (store)/product/[slug] emits JSON-LD Product + BreadcrumbList (one script each); json-ld.test 26/26 pass; no code change**
**המשך מ: M04-c220 DONE (2026-10-26): pnpm type-check passes (tsc --noEmit exit 0); no drift, no code change**
**המשך מ: M04-c219 DONE (2026-10-26): pnpm type-check passes (tsc --noEmit exit 0); no drift, no code change**
**המשך מ: M16-c218 DONE (2026-10-26): product page (store)/product/[slug] emits JSON-LD Product + BreadcrumbList (buildProductJsonLd/buildBreadcrumbJsonLd, one script each); json-ld.test 26/26 pass; no code change**
**המשך מ: M12-c218 DONE (2026-10-26): robots.ts verified production-safe (allow / + private paths disallowed, sitemap+host absolute, robots.test 7/7 pass, no noindex-all); live robots.txt is one deploy behind (lacks /debug/ + /voucher/ disallows), no code change**
**המשך מ: M05-c218 DONE (2026-10-26): pnpm test passes (615 files / 7064 tests pass, 28 skipped); no drift, no code change**
**המשך מ: M13-c217 DONE (2026-10-26): /api/health and /api/ready both 200 against real Supabase (database ok, redis ok, cardcom ok; meilisearch + r2 not_configured, treated as honestly absent); no code change**
**המשך מ: M05-c217 DONE (2026-10-26): pnpm test passes (615 files / 7064 tests pass, 28 skipped); working tree clean of drift, no code change**
**המשך מ: M04-c217 DONE (2026-10-26): pnpm type-check passes (tsc --noEmit clean); working tree clean, no drift; no code change**
**המשך מ: M16-c216 DONE (2026-10-26): /product/[slug] emits Product + BreadcrumbList JSON-LD (json-ld.test.ts 26/26 pass); gift sub-page is noindex, /products listing is not a product page; no code change**
**המשך מ: M04-c216 DONE (2026-10-26): pnpm type-check passes (tsc --noEmit clean); only drift was pnpm install rewriting the sharp specifier in pnpm-lock.yaml (^0.35.5 -> ^0.35.3, mismatches package.json), reverted; no code change**

**המשך מ: M08-c220 DONE (2026-10-26): Lighthouse mobile sample on localhost:3000 (load avg 14, heavily contended): / 50/46 (TBT 2.7-4.3 s, LCP 4.9-5.1 s), /product/bar-drink 65/66 (LCP 5.3-7.2 s); logged in logs/lighthouse-m08-c220.log; G23 95+ not met; no code change**
**המשך מ: M08-c217 DONE (2026-10-26): Lighthouse mobile sample (local prod, 2 runs/page): home 78/75, product 82/81; G23 95+ not met, LCP 4.7-6.4 s gap sits in locked hero/header; log logs/lighthouse-m08-c217.log; no code change**
**המשך מ: M17-c215 DONE (2026-10-26): static RTL audit of / and /product/[slug] — rtl-lint hits only in comments/OG image (Satori); remaining dir="ltr" are SKU/phone/email inputs (intended) and locked HeroSlider; no code change**
**המשך מ: M04-c215 DONE (2026-10-26): pnpm type-check passes (tsc --noEmit clean), working tree clean, no drift; no code change**
**המשך מ: M18-c214 DONE (2026-10-26): STATE.md already 139 lines (<300), nothing to archive (docs/STATE-ARCHIVE.md exists); no code change**
**המשך מ: M09-c214 DONE (2026-10-26): knip re-audit — only unused dep is @capacitor/android (needed by android/ platform, kept); remaining unused exports are tested public API / forbidden files; no code change**
**המשך מ: M05-c214 DONE (2026-10-26): pnpm test green (615 files passed, 2 skipped; 7064 tests passed, 28 skipped), no drift, no code change**
**המשך מ: M15-c213 DONE-DEFERRED (2026-10-26): console NOT clean on / and /product/<slug> at 380/768/1440 (dev server :3000). Causes: Supabase "Invalid API key" (homepage.cms_read_failed, product_detail.supplier_load_failed, HTTP 400s) = cred-deferred; dev-only CSP blocks eval() + va.vercel-scripts.com; Next "runtime data outside Suspense" error on /product/[slug] needs separate fix; no code change**
**המשך מ: M12-c213 DONE (2026-10-26): robots.ts verified production-safe (no blanket Disallow, private/auth/voucher paths blocked, sitemap+host on kenyonexpress.co.il, 7/7 robots tests pass); no code change**
**המשך מ: M18-c212 DONE (2026-10-26): claude/STATE.md is 129 lines, already under 300; docs/STATE-ARCHIVE.md exists, nothing to archive; no code change**
**המשך מ: M07-c212 DONE (2026-10-26): TODO/FIXME scan found 6 markers in 2 files, all older than 7 days and already filed in docs/BACKLOG.md (#1-#3, Cardcom creds + R2 stub); no code change**
**המשך מ: M04-c211 DONE (2026-10-26): pnpm type-check passes (tsc --noEmit clean); committed drift in src/lib/category-page.ts (suppliers select drops verification_status until migration 301 applied)**
The canonical state file on this branch is the root `STATE.md`. This file
**המשך מ: M08-c210 DONE (2026-10-26): Lighthouse mobile sample, / 52/61, product 50/62 (CPU-contended by concurrent Playwright run, TBT ~3s; c209 uncontended was 78-81); logged in logs/lighthouse-m08-c210.log; G23 95+ not met; no code change**
exists because the goal queue names `claude/STATE.md`; it holds the resume
**המשך מ: M12-c209 DONE robots.ts production-safe (allow /, disallows redeem/coupon/account/supplier/admin/checkout/cart/auth/api/debug/voucher; sitemap+host on kenyonexpress.co.il, no double slash); robots.test.ts 7/7 pass; no code change**
**המשך מ: M06-c209 DONE pnpm build passes (exit 0), working tree clean, no drift to commit; no code change**
**המשך מ: M04-c209 DONE pnpm type-check clean (tsc --noEmit exit 0); committed drifted deps (lucide-react 1.61, zod 4.6.7), lockfile and E2E status doc; no forbidden files touched**
**המשך מ: M06-c207 DONE pnpm build passes (exit 0, Next 16.4.3), no drift to fix; no code change**
**המשך מ: M05-c207 DONE pnpm test: 615 files passed / 2 skipped, 7064 tests passed / 28 skipped, no failures, no drift to fix; no code change**
**המשך מ: M08-c205 DONE Lighthouse mobile sample / and /product/<slug>: simulate 69/67, provided 100/100 (localhost simulate unstable); logged in docs/LIGHTHOUSE-STATUS.md; no code change**
**המשך מ: M07-c205 DONE TODO/FIXME scan: 6 markers in 3 items (cardcom.ts:249, :312, r2-migration.ts:103-106), all >7d old and already filed in docs/BACKLOG.md (Cardcom creds / R2 stub + service key); line numbers re-verified; no code change, no forbidden files touched**
**המשך מ: M05-c205 DONE pnpm test 615 files / 7064 tests pass, 28 skipped, 0 fail; committed M-CYCLE-STATUS.md timestamp drift**
**המשך מ: M15-c204 DONE console check / and /product at 380/768/1440 on next dev: 0 console errors, 0 pageerrors; only dev-mode next/image aspect-ratio warnings on home deal cards (ke-live-deal-*) + aborted /api/cart fetch (endpoint 200); no code change**
**המשך מ: M05-c204 DONE pnpm test 615 files / 7063 tests pass, 28 skipped, 0 fail; committed M-CYCLE-STATUS.md timestamp drift**
**המשך מ: M15-c203 DONE console check / and /product at 380/768/1440 on fresh next start: 0 errors/warnings; note: long-running :3000 server is stale (serves old chunk hashes, 500s) — restart it; no code change**

Last goal: F43, home parity gate on the rebuilt tree, by the goal's literal
`pnpm run compare` command and by a fresh archive shot: 380px 8.53% PASS,
768px 9.79% PASS, 1440px 8.08% PASS. Deals card title at live's measured
26.4px / 500 / 8px in `src/components/ProductDealCard.module.css`, live's
-0.14px body letter-spacing in `src/app/globals.css`, gate flags
`--widths`, `--baseline`, `--live-url` in `scripts/compare-args.mjs`. Rows in
`docs/UI-PARITY-REPORT.md`, 2026-10-21.


G10 (F11 club tiers): schema already applied as migrations/applied/282_club_tiers.sql (189 is taken by 189_affiliate_program), so no duplicate migration was written to pending. Editor at /admin/club-tiers (/admin/clubs redirects). Added public /club (src/app/(main)/club/page.tsx) listing active tiers + benefits, listPublicTiers() in src/server/queries/club.ts, sitemap entry.


G11 (F12 affiliate): schema, per-campaign commission_bp (admin) snapshotted per order, wallet payout cron already live as migrations/applied/283_affiliate_campaigns.sql (188 is taken by 188_search_analytics, so no duplicate 188_affiliate.sql written). Added QR per link (urlQrDataUrl in src/lib/vouchers/qr-image.ts) and pending-earnings line on /account/affiliate.


G14 (F15 passkeys + WhatsApp OTP): passkey register/authenticate routes already live (F12). OTP now 6 digits, 10 min TTL, 3 attempts (WA_OTP_MAX_ATTEMPTS, no migration: column allows up to 10). Meta Cloud API template send classifies template errors (132xxx, 131058) as templateRejected; only then the same code is emailed via Resend. Other failures send nothing. Removed the Supabase email-OTP branch from verify.


G16 (F19 maintenance): flag, proxy redirect to /maintenance, and Turnstile on /checkout, /contact and /suppliers (/supplier/apply redirects there) already existed. Added /admin/settings with the maintenance_mode toggle (action takes an allowlisted return_to) and migrations/pending/190_maintenance.sql (idempotent, not applied).


G20 (checkout address, shipping only): no billing address anywhere in checkout; first physical order saves the typed address to the profile and the 6th paid physical order is gated on a complete address + WhatsApp OTP (F42 gate, already live). New: migrations/pending/300_profiles_orders_physical_count.sql (profiles.orders_physical_count, backfill, service-role bump function; not applied) and finalize bumps it once on the pending->paid transition (best effort, gate still recounts from paid history).

G21 (Cardcom no billing address): src/lib/payments/cardcom.ts never sent billing-address, card-owner or issuing-country fields; no country filter exists in the payment paths. Added a guard test in cardcom.test.ts (33/33 pass). No production code change.

BLOCKED G23 perf below 95 on mobile-simulated Lighthouse (home 87, product 64, /c 56; a11y/BP/SEO 100, perf 100 with provided throttling). Fixed /club prerender build break + CSP wss for Supabase realtime. See docs/LIGHTHOUSE-FINAL.md.

G24 (mobile audit): 14 pages x 380/390/430 = 42 measurements, all 200, all overflow 0. Fixed scripts/mobile-audit.mjs to survive redirects. See docs/MOBILE-AUDIT-FINAL.md.

G25 (security pass): pgTAP RLS file for all 71 public tables (written, not executed: no DB access this session), gitleaks CI already green, CSP+HSTS verified by curl -I on production, Sentry traces 1.0, PostHog identify on login, rate limits on 8 more mutating routes. See docs/SECURITY-PASS-G25.md.

G26 (SEO pass): sitemap.ts (DB-driven, cached), robots.ts, JSON-LD Product+Offer+Organization+BreadcrumbList, hreflang he-IL (alternatesFor) were already in place and tests pass. Added src/lib/seo/wp-legacy.ts: structural WP/Woo 301 backstop (product-category, shop, my-account, contact-us, about-us) wired into src/proxy.ts (Next 16 replacement for middleware.ts) after the seo_redirects lookup. Not verified: seo_redirects row coverage in prod DB (no DB access this session).

BLOCKED G28 v2.0.0 already published on origin (tag at 7de0eed31, HEAD is 412 commits ahead; retagging needs a force-push of a published tag) and G23 mobile Lighthouse perf gate (home 87, product 64, /c 56) is still BLOCKED, so no LAUNCH-READY line written. docs/LAUNCH-CHECKLIST.md already has a PUSH NOW section (2026-10-24) but no HOLD section.

DRIFT M-c1 2026-10-25: docs/BUSINESS-MODEL-RULES.md does not exist (only BUSINESS-MODEL.md, BUSINESS-RULES.md); drift check ran against those. gitleaks not installed. M-c1 audit: PR #100 (fast-uri); zod high open (needs 3->4 migration, WIP patch ~/ke-goals/logs/c1-zod4-migration-wip.patch).

M06-c181 2026-10-25: pnpm build green on rerun. First run failed once on /c/tel-aviv ("use cache" getCityProducts prerender timeout, slow Supabase fetch, flake). No code fix. Uncommitted WIP left untouched: src/app/(store)/page.tsx (DealChips, needs compare gate) + 2 docs.
M07-c181 2026-10-25: TODO/FIXME scan (git grep, all tracked files): 0 found, nothing to resolve or file in docs/BACKLOG.md. No code changes.
M11-c181 2026-10-25: sitemap.xml verified. www URL 200, 75 urls all 200 on www, lastmod 2026-10-24, cache 1h, robots.txt references it. Note: locs + canonical use apex kenyonexpress.co.il which 308-redirects to www (siteUrl env/domain config, not changed). Contains e2e-test-category + 'העתק' product. No code changes.
M14-c181 2026-10-25: Sentry release vs HEAD 82d2981. Code side OK: sentry.server/edge/client configs set release = SENTRY_RELEASE ?? (NEXT_PUBLIC_)VERCEL_GIT_COMMIT_SHA, org kenyonexpress, EU host de.sentry.io. Live side NOT verified: SENTRY_AUTH_TOKEN in .env.vercel/.env.production is a placeholder (Sentry API: Invalid token), Sentry MCP unauthenticated. A prod deploy was building during the check (dpl_D1o2XrTFDsJoXvtasAojvtftq1tz). No code changes.
RESULT: BLOCKED M14-c181 sentry creds invalid, cannot read releases
M04-c182 2026-10-25: pnpm type-check clean (tsc --noEmit, 0 errors). Drift committed: home page DealChips (rc5 F13) + regenerated docs reports.
RESULT: DONE
M06-c182 2026-10-25: pnpm build succeeds (all routes generated). Drift committed: docs/M-CYCLE-STATUS.md regenerated timestamps.
RESULT: DONE
M09-c182 2026-10-25: knip run. Removed unused react-hook-form + dead src/components/ui/form.tsx (no importers); type-check + build green. Kept @capacitor/android (android/ native project), drizzle-orm/postgres (knip false positive, drizzle.config needs SUPABASE_DB_URL). Unused exports/types (~236, mostly type-only public API) left in place: low value, wide blast radius; list in knip output.
RESULT: DONE
M11-c182 2026-10-25: sitemap.xml verified. Live www.kenyonexpress.co.il/sitemap.xml 200 application/xml, 75 URLs, newest lastmod 2026-10-24 (catalogue-driven); apex 308 -> www, sampled <loc> URLs resolve 200; robots.txt references sitemap; sitemap/robots vitest 17/17 pass. No code change.
RESULT: DONE
M17-c182 2026-10-25: RTL live check (www, Playwright, 380/768/1440) on / and /product/אוזניות-איירפודס-3. Both: html lang=he dir=rtl, no horizontal overflow, 0 LTR-direction elements with Hebrew text on /product. On /: only the 3 hero slide lines (standard_line/promo_small/promo_large) carry dir=ltr in locked src/components/home/HeroSlider.tsx (Electro v7 hero reference); not touched. No code changes.
RESULT: DONE
C02 2026-10-25: health gates (typecheck, lint, build) all green on closeout/v1-final, no fixes needed.
RESULT: DONE
C04 2026-10-25: product parity measured vs Electro product capture: 380 42.77%, 768 33.85%, 1440 22.89% (all FAIL). Causes: anon key 401, suppliers.verification_status column missing, grid-count mismatch (needed COMPARE_ALLOW_GRID_MISMATCH=1). Report in docs/L3-PARITY-REPORT.md. No code changes.
RESULT: BLOCKED supabase-anon-key-401 + gate 22-43pct

C05: BLOCKED, migration 301 unapplied (Supabase MCP unauthenticated), e2e guest flow unverified; unit tests 278 pass. See docs/L4-CHECKOUT-REPORT.md

C06: BLOCKED, supabase-anon-key-401, account pages need a session (guest gets 307 to /login). See docs/L5-ACCOUNT-REPORT.md

C07: DONE, admin product upload verified end to end (manual + CSV): create, publish, /product/<slug> 200, delete, cleanup. Fixed free_shipping insert failure, unreachable CSV commit, weak dry-run validation. See docs/L6-ADMIN-REPORT.md
RESULT: DONE

C08: BLOCKED, compare gate not met (home 46/41/30%, product 43/34/23% at 380/768/1440; Electro snapshot structurally unreachable, no /c baseline). Zero sideways scroll PASSED on all 14 pages at 380. See docs/L7-MOBILE-REPORT.md
RESULT: BLOCKED compare-gate-unreachable-vs-reference
C09: PWA verified end to end (manifest, SW, offline, install criteria 0 errors). Fixed prod-CSP nonce blocking all hydration/SW registration (proxy.ts), sw.js revalidation header, banner brand text. See docs/L8-PWA-REPORT.md
RESULT: DONE

C10: BIG-SITE-GAP audit written, docs/BIG-SITE-GAP.md (EXISTS/PARTIAL/MISSING matrix, P0 none, 13 P1, 8 P2). Static audit only.
RESULT: DONE

C11: no P0 items in docs/BIG-SITE-GAP.md (C10 matrix: P0 none), nothing to build. No code changes.
RESULT: DONE

C12: JSON-LD added to /c and /c/<city>; docs/REDIRECTS.md and docs/L11-GROWTH-REPORT.md written; rest already present.
RESULT: DONE

C13: hardening audited and verified (Upstash limits, Turnstile, CSP/HSTS, gitleaks, flags, maintenance all present, 135 tests pass). Sentry extra alert rules DONE-DEFERRED (no SENTRY_AUTH_TOKEN). See docs/L12-HARDEN-REPORT.md
RESULT: DONE

M04-c183: pnpm type-check clean (tsc --noEmit exit 0), no drift to fix.
RESULT: DONE

M06-c183: pnpm build succeeds (Next.js production build, all routes generated), no drift to fix.
RESULT: DONE

M07-c183: TODO/FIXME scan. Resolved 2 (whatsapp.test placeholder, screenshot-all comment). Filed 3 in docs/BACKLOG.md (2x cardcom, r2-migration). stock-notifications TODO is 7 days old, re-check next scan.
RESULT: DONE

M09-c183: Unused deps + dead exports. knip: no removable deps (flagged capacitor/lighthouse/mdx are config/script-used). Removed 7 unreferenced src files (VendorDetailClient, CategorySort, store/CategoryNav, store/CategorySidebar, store/PromoBanners, db/schema/order-items, revslider-authored). Kept r2-migration.ts (BACKLOG #3). Exports/types left: public API/tested surface. tsc, vitest (6954 pass), biome green. No rendered-UI change; build/compare not re-run.
RESULT: DONE
M09-c184: Unused deps + dead exports re-audit. knip: only unused dep is @capacitor/android (needed by android/ Capacitor platform, kept). Remaining src unused-file hits are entry/test/dynamic/backlog-kept (c183 already removed the safe ones); exports/types are tested public surface. No code change, no UI impact.
RESULT: DONE
M18-c184: STATE.md trim check. claude/STATE.md is 123 lines (<300), docs/STATE-ARCHIVE.md already holds the archived history; nothing further to move. No code change.
RESULT: DONE
M09-c185: Unused deps + dead exports re-audit. knip: only unused dep is @capacitor/android (needed by android/ Capacitor platform, kept). Unused-file hits are entry/test/script/backlog-kept and locked components (untouched); exports are tested public surface, same as c183/c184. No code change, no UI impact.
RESULT: DONE
M15-c185: Console check on / and /product/<slug> at 380/768/1440 (dev server). / clean apart from dev-only noise. /product logs error product_detail.supplier_load_failed: column suppliers.verification_status does not exist (migrations/pending/301_supplier_verification_status.sql not applied; Supabase MCP not authorized in this session). No code change.
RESULT: BLOCKED migration 301 unapplied, Supabase MCP unauthorized
line only, and the full block for each goal is in the root file.
**המשך מ: M18-c210 DONE (2026-10-26): claude/STATE.md trimmed 299 -> 118 lines (duplicates dropped, older resume lines moved to docs/STATE-ARCHIVE.md); no code change**
**המשך מ: M06-c211 DONE (2026-10-26): pnpm build passes (waited out a concurrent build lock); only drift was docs/M-CYCLE-STATUS.md, committed**
**המשך מ: M08-c211 DONE (2026-10-26): Lighthouse mobile sample logged to logs/lighthouse-m08-c211.log (home 60/72, product 74/81, contended, G23 95+ not met); no code change**
**המשך מ: M09-c211 DONE (2026-10-26): knip audit — no unused deps (drizzle-orm/postgres/pg/@capacitor/android are false positives); removed dead anyChip + unexported read in deal-chips.ts; remaining unused exports are public API surface/forbidden files, left; tsc + catalog tests pass**
**המשך מ: M16-c211 DONE (2026-10-26): verified /product/[slug] emits Product + BreadcrumbList JSON-LD (json-ld.ts, 26 tests pass); /product/[slug]/gift is noindex so excluded; no code change**
**המשך מ: M05-c212 DONE (2026-10-26): pnpm test 615 files / 7064 tests pass; only drift was docs/M-CYCLE-STATUS.md, committed**
**המשך מ: M09-c212 DONE (2026-10-26): knip re-audit — only unused dep is @capacitor/android (false positive, native android/ project); remaining unused exports are shadcn/ui surface, DB schema, scripts, forbidden files; no code change**
**המשך מ: M11-c212 DONE (2026-10-26): www.kenyonexpress.co.il/sitemap.xml 200 application/xml, 75 URLs all resolve 200, robots.txt references it; lastmod real (newest 2026-10-24); note sitemap/canonical use apex which 308s to www (Vercel domain setting, not code); no code change**
**המשך מ: M15-c212 DONE (2026-10-26): console clean on / and /product/<real slug> at 380/768/1440 — 0 console errors, 0 pageerrors, HTTP 200; only a navigation-aborted /api/cart fetch (endpoint itself 200); no code change**
**המשך מ: M05-c213 DONE (2026-10-26): pnpm test 615 files / 7064 tests pass; no drift, nothing to commit**
**המשך מ: M06-c213 DONE (2026-10-26): pnpm build exit 0, no drift, nothing to commit**
**המשך מ: M09-c213 DONE (2026-10-26): knip audit — no safe removals. drizzle-orm still imported by src/db/schema (RLS tests live in src/db/__tests__); postgres/pg used by scripts/*.mjs; @capacitor/android backs android/ native project; @mdx-js/loader needed by @next/mdx. 79 unused exports are shadcn primitives, type aliases, script helpers, and locked HeroSlider — left as is; no code change**
**המשך מ: M10-c214 BLOCKED (2026-10-26): migrations/pending has 89 files; cannot verify applied state — Supabase MCP (project ixvwfbuvfxxsjiywhbbb) unauthorized in this non-interactive session; 301_supplier_verification_status known unapplied (M15-c185); no code change**
**המשך מ: M16-c213 DONE (2026-10-26): single dynamic template src/app/(store)/product/[slug]/page.tsx emits Product + BreadcrumbList JSON-LD (builders in src/lib/seo/json-ld.ts) for every product; missing/inactive slugs hit notFound(); json-ld tests 26/26 pass; no code change**
**המשך מ: M16-c214 DONE (2026-10-26): re-verified single template src/app/(store)/product/[slug]/page.tsx emits Product + BreadcrumbList JSON-LD (json-ld.ts builders), /gift is noindex so excluded; json-ld tests 26/26 pass; no code change**
**המשך מ: M05-c215 DONE (2026-10-26): pnpm test green (615 files / 7064 tests pass, 2 files skipped); working tree clean, no drift to fix; no code change**
**המשך מ: M06-c215 DONE (2026-10-26): pnpm build green (all routes compile); no source drift to fix; no code change**
**המשך מ: M07-c215 DONE (2026-10-26): TODO/FIXME scan of src/scripts/migrations finds only the 3 backlogged items (cardcom.ts:249, cardcom.ts:312, r2-migration.ts:103-106), all >7 days old and blocked on Cardcom creds / service-role key; BACKLOG.md re-verified; no code change**
**המשך מ: M08-c215 DONE (2026-10-26): Lighthouse mobile sample, / 68/75, product 85/82 (load ~4, LCP 4.4-6.3 s main gap); logged in logs/lighthouse-m08-c215.log; G23 95+ not met; no code change**
**המשך מ: M09-c215 DONE (2026-10-26): depcheck finds 0 unused runtime deps (dev hits capacitor/tailwind/lighthouse/lint-staged are config/CLI-used); knip lists 79 unused value exports + unused types, all public API surface (shadcn ui primitives, money/ledger/cardcom, scripts CLIs) or in locked HeroSlider; left intact to avoid breaking payment paths; no code change**
**המשך מ: M14-c215 DONE-DEFERRED (2026-10-26): SENTRY_AUTH_TOKEN absent/placeholder in .env.local; Sentry release vs HEAD check skipped until token is set; no code change**
**המשך מ: M05-c216 DONE (2026-10-26): pnpm test was 10 failing (migrations 162-300 moved pending→applied, tests/manifest/checksums stale); fixed paths, inventory lists, manifest, CHECKSUMS; now 615 files / 7064 tests green**
**המשך מ: M06-c216 DONE (2026-10-26): pnpm build exit 0 on closeout/v1-final; only drift was docs/M-CYCLE-STATUS.md timestamp, committed + pushed**
**המשך מ: M07-c216 DONE (2026-10-26): TODO/FIXME scan of src, apps, packages, tests, e2e, supabase, migrations finds only the 3 already-backlogged items (cardcom.ts:249, cardcom.ts:312, r2-migration.ts:103-106), all >7 days old, blocked on Cardcom creds / service-role key; BACKLOG.md re-verified; no code change**
**המשך מ: M08-c216 DONE (2026-10-26): Lighthouse mobile, localhost:3000, 1 run each (/product alone is 404; used /product/bar-drink). / perf 54 a11y 100 bp 92 seo 92 (FCP 1.6s LCP 2.9s TBT 4790ms CLS 0.066); /product/bar-drink perf 52 a11y 100 bp 92 seo 100 (FCP 1.8s LCP 3.2s TBT 13330ms CLS 0). Both below G23 95 target; TBT is the driver. Localhost simulate-throttling is noisy per docs/PERFORMANCE-BUDGET.md and server may be dev-mode; sampling only, no code change**
**המשך מ: M09-c216 DONE (2026-10-26): depcheck+knip find no unused runtime deps (@capacitor/android kept: native android/ platform); removed 4 truly-unreferenced exports (isSupportRole, getMyWishlistMarks, getUserRFMScore, getAllSegments); tsc, biome, vitest pass; remaining knip exports are test/script/public-API/locked-component and left intact**
**המשך מ: M06-c217 DONE (2026-10-26): pnpm build exit 0 on closeout/v1-final; only drift was docs/M-CYCLE-STATUS.md timestamp, committed + pushed**
**המשך מ: M07-c217 DONE (2026-10-26): TODO/FIXME scan finds only the 3 backlogged items (cardcom.ts:249, cardcom.ts:312, r2-migration.ts:103-106), all >7 days old (Jul 24, Aug 7, Oct 17), blocked on Cardcom creds / service-role key; BACKLOG.md re-verified; no code change**
**המשך מ: M09-c217 DONE (2026-10-26): knip+usage scan find no unused runtime/dev deps (@mdx-js/loader, @types/mdx kept as @next/mdx peer/types); removed 1 dead default export (CouponCardSkeleton); tsc + biome pass; remaining knip exports are payments/ledger/server-actions/shadcn/public-API/locked and left intact**
**המשך מ: M10-c217 BLOCKED (2026-10-26): migrations/pending has 48 files; applied state unverifiable — Supabase MCP (project ixvwfbuvfxxsjiywhbbb) unauthorized in this non-interactive session; 301_supplier_verification_status known unapplied (M15-c185); no code change**
**המשך מ: M15-c217 DONE-DEFERRED (2026-10-26): console check on / and /product/<slug> at 380/768/1440 (dev server). / has only dev/CSP noise (eval, va.vercel-scripts CSP, aborted /api/cart). /product has Supabase "Invalid API key" (supplier_load_failed + 2x 400) = placeholder creds, deferred; plus dev-mode Next error "Route /product/[slug]: runtime data outside Suspense" (non-cred, needs follow-up); no code change**
**המשך מ: M16-c217 DONE (2026-10-26): only indexable product page src/app/(store)/product/[slug]/page.tsx emits separate JSON-LD Product + BreadcrumbList scripts (lib/seo/json-ld.ts, 26 unit tests pass); gift sub-page is noindex; no code change. Note: Product LD can emit aggregateRating from getProductReviews, which conflicts with the "no reviews UI" rule — flagged for follow-up**
**המשך מ: M17-c217 BLOCKED locked-component (2026-10-26): RTL check on / and /product/<slug> at 380/768/1440 (dev server): html dir=rtl lang=he, 0 horizontal overflow, 0 text-align:left. Only LTR leaks: / has dir="ltr" on 5 Hebrew hero text <p> (standard_line etc., src/components/home/HeroSlider.tsx:555-628, LOCKED); /product has empty p.pdp-summary__meta dir=ltr (harmless) + email input dir=ltr (intentional); span.discount_per numerics ltr (ok). No code change**
**המשך מ: M04-c218 DONE (2026-10-26): pnpm type-check (tsc --noEmit) passes clean, no type drift to fix; committed pending STATE.md entries (M16/M17-c217)**
**המשך מ: M06-c218 DONE (2026-10-26): pnpm build exits 0 (Next prod build, all routes generated), no drift to fix; no code change**
**המשך מ: M09-c218 DONE (2026-10-26): knip audit — only unused dep is @capacitor/android, kept (native android/ project exists, required by cap sync); 76 "unused exports" are shadcn/ui primitives, server-action/API barrels, scripts and locked HeroSlider.tsx — public surface, removal is risk without payoff; no code change**
**המשך מ: M10-c218 DONE-DEFERRED (2026-10-26): migrations/pending has 48 files; applied state unverifiable — Supabase MCP (project ixvwfbuvfxxsjiywhbbb) unauthorized in this non-interactive session and Supabase creds are placeholder/401; 301_supplier_verification_status known unapplied (M15-c185); no code change**
**המשך מ: M17-c218 BLOCKED locked-component (2026-10-26): live RTL probe on / and /product/<slug> at 380/768/1440 — html dir=rtl lang=he, 0 overflow, 0 text-align:left; /product has 0 LTR leaks; / has 11 Hebrew <p> with direction:ltr, all in locked src/components/home/HeroSlider.tsx (same as c217). No code change**
**המשך מ: M05-c219 DONE (2026-10-26): pnpm test green (615 files passed/2 skipped, 7064 tests passed/28 skipped); only drift was docs/M-CYCLE-STATUS.md + docs/UI-PARITY-REPORT.md, committed + pushed; no code changes**
**המשך מ: M06-c219 DONE (2026-10-26): pnpm build green; working tree clean, no drift to commit; no code changes**
**המשך מ: M07-c219 DONE (2026-10-26): TODO/FIXME scan — 6 markers (cardcom.ts:249,312; r2-migration.ts:103-106), all older than 7 days and already filed in docs/BACKLOG.md items 1-3 (Cardcom prod creds / Supabase service-role key blockers); no new items, no code change**
**המשך מ: M09-c219 DONE (2026-10-26): knip audit — no removable deps (only @capacitor/android flagged, required by native android build); 76 "unused" exports are public API/re-exports/server actions/shadcn ui, left intact to avoid breakage; no code changes**
**המשך מ: M05-c220 DONE (2026-10-26): pnpm test green (615 files passed/2 skipped, 7064 tests passed/28 skipped); only drift was docs/M-CYCLE-STATUS.md, committed + pushed; no code changes**
**המשך מ: M09-c220 DONE (2026-10-26): knip re-audit — only @capacitor/android flagged (required by native android build); no unused deps; exports are public API, left intact; no code changes**
**המשך מ: M06-c221 DONE (2026-10-26): pnpm build green; working tree clean (earlier drift in docs/M-CYCLE-STATUS.md + store page.tsx already committed by concurrent process); no code changes**
**המשך מ: M09-c221 DONE (2026-10-26): knip re-audit — only @capacitor/android flagged (required by native android build); no unused deps; unused exports are public API/re-exports, left intact; no code changes**
המשך מ: M10-c221 BLOCKED (migrations/pending still NOT verified applied: 48 files pending; Supabase MCP unauthenticated in this non-interactive session so apply_migration/list_migrations unavailable; db push forbidden; no code changes)
**המשך מ: M16-c221 DONE (2026-10-26): /product/[slug] emits JSON-LD Product + BreadcrumbList (buildProductJsonLd/buildBreadcrumbJsonLd); json-ld.test.ts 26/26 pass; /product/[slug]/gift is noindex, no LD needed; no code changes**
**המשך מ: M04-c222 DONE (2026-10-26): pnpm type-check (tsc --noEmit) passes clean, no drift; working tree clean, in sync with origin; no code changes**
**המשך מ: M05-c222 DONE (2026-10-26): pnpm test 615 files pass / 7064 tests pass (2 files skipped); no drift, working tree clean; no code changes**
**המשך מ: M06-c222 DONE (2026-10-26): pnpm build exit 0 on closeout/v1-final; only drift docs/M-CYCLE-STATUS.md timestamp, committed + pushed edb63b9db**
**המשך מ: M07-c222 DONE (2026-10-26): TODO/FIXME scan: 3 open items (cardcom.ts:249/:312, r2-migration.ts:103-106), all >7d old, already filed in docs/BACKLOG.md (Cardcom creds / R2 stub); no new items, no code changes**
**המשך מ: M18-c222 DONE (2026-10-26): claude/STATE.md already 198 lines (<300), nothing to trim; docs/STATE-ARCHIVE.md untouched; no code changes**
**המשך מ: M06-c223 DONE (2026-10-26): pnpm build exit 0 on closeout/v1-final; only drift docs/M-CYCLE-STATUS.md timestamp, committed + pushed**
**המשך מ: M13-c223 DONE (2026-10-26): /api/health 200 {database:ok, search:not_configured}, /api/ready 200 {database,redis,cardcom ok; meili+r2 not_configured}; Supabase service key valid (REST 200); no code changes**
**המשך מ: M15-c223 DONE (2026-10-26): console check on / and /product/<real slug> at 380/768/1440 on fresh next start (:3417): HTTP 200, 0 console errors/warnings, 0 pageerrors, 0 failed requests; note :3000 dev server is stale (500) — not used; no code change**
**המשך מ: M17-c223 BLOCKED locked-component (2026-10-26): RTL probe on fresh next start at 380/768/1440 — /product/<real slug>: html dir=rtl lang=he, 0 LTR-direction Hebrew nodes, no overflow, CLEAN; /: html/body rtl, no overflow, but hero slide text <p dir="ltr"> x5 (standard_line, promo_small, promo_large) in src/components/home/HeroSlider.tsx:555,565,575,619,628 renders Hebrew in LTR; file is in LOCKED_COMPONENTS, not edited**
**המשך מ: M05-c224 DONE (2026-10-27): pnpm test 615 files passed/2 skipped, 7064 tests passed/28 skipped, no failures; only drift was claude/STATE.md (M17-c223 line), committed + pushed**
**המשך מ: M06-c224 DONE (2026-10-27): pnpm build passes; drift was pnpm-lock.yaml sharp specifier ^0.35.3 vs package.json ^0.35.5 (reverted to committed), docs/M-CYCLE-STATUS.md timestamp refresh committed**
**המשך מ: M07-c224 DONE (2026-10-27): TODO/FIXME scan — same 6 markers (cardcom.ts:249,312; r2-migration.ts:103-106), all >7d old and filed in docs/BACKLOG.md items 1-3 (Cardcom creds / service-role key blockers); BACKLOG status line re-verified, no code change**
**המשך מ: M09-c224 DONE (2026-10-27): depcheck+knip — no unused deps (lighthouse/lint-staged used by husky pre-commit + lighthouse scripts; @capacitor/android is the native platform dep for capacitor.config.ts); 76 remaining knip unused exports are deliberate API surface (money/ledger/cardcom/idempotency, shadcn ui primitives, schema tables, re-exports, test-only types) after earlier un-export pass a8b2dede2; no code change**
**המשך מ: M10-c224 DONE-DEFERRED (2026-10-27): migrations/pending has 5 SQL files (000, 301, 305, 306, 310) + preflights; applied state unverifiable — Supabase MCP (project ixvwfbuvfxxsjiywhbbb) unauthorized in this non-interactive session and Supabase creds placeholder/401; 301_supplier_verification_status known unapplied (M15-c185); db push forbidden; no code change**
**המשך מ: M16-c224 DONE (2026-10-27): /product/[slug] emits Product (name/url/sku/image/brand/Offer ILS from couponOffer or base price) + BreadcrumbList (בית > category > product) via src/lib/seo/json-ld.ts; json-ld.test.ts 26/26 pass; /product/[slug]/gift is noindex so excluded; no code change**
**המשך מ: M15-c225 DONE (2026-10-27): console check on / and /product/אוזניות-איירפודס-3 at 380/768/1440 on fresh next start (:3425): HTTP 200, 0 console errors/warnings, 0 pageerrors, 0 failed requests; no code change**
**המשך מ: M17-c225 BLOCKED locked-component (2026-10-27): RTL re-verify — source unchanged since M17-c223: src/components/home/HeroSlider.tsx:555,565,575,619,628 `<p dir="ltr">` renders Hebrew hero text LTR on /; file is in LOCKED_COMPONENTS, not edited; /product/[slug] clean (html dir=rtl lang=he, 0 LTR Hebrew nodes)**
**המשך מ: M05-c225 DONE (2026-10-27): pnpm test full run — 615 files passed / 2 skipped, 7064 tests passed / 28 skipped, 0 failures; no drift found, no code change**
**המשך מ: M07-c225 DONE (2026-10-27): TODO/FIXME scan of src/scripts/migrations — 5 markers total (cardcom.ts:249, :312, r2-migration.ts:103-106), all already filed in docs/BACKLOG.md items 1-3 (all >7 days old; blocked on Cardcom prod creds / feature work + service-role key); no new markers, no code change**
**המשך מ: M09-c225 DONE (2026-10-27): knip re-audit — only @capacitor/android flagged (native android/ platform dep for capacitor.config.ts, kept); no unused deps; 76 unused exports are deliberate public API (money/ledger/cardcom, shadcn ui, schema, re-exports); no code change**
**המשך מ: M11-c225 DONE (2026-10-27): sitemap.xml live 200 (apex 308→www), 75 URLs, valid XML, lastmod 2026-10-24 derived from catalogue (not clock), robots.txt points at it, 6 sampled URLs 200; note: sitemap/robots declare apex origin while apex 308s to www (domain config, not code); no code change**
**המשך מ: M04-c226 DONE (2026-10-27): pnpm type-check (tsc --noEmit) clean, 0 errors, no drift; no code change**
**המשך מ: M05-c226 DONE (2026-10-27): pnpm test full run — 615 files passed / 2 skipped, 7064 tests passed / 28 skipped, 0 failures; no drift found, no code change**
**המשך מ: M06-c226 DONE (2026-10-27): pnpm build exit 0, all routes generated, no drift; no code change**
**המשך מ: M08-c226 DONE (2026-10-27): Lighthouse mobile sample, / 47/34, product (/product/bar-drink) 46/52; load avg 11 (e2e running), TBT contention-driven; logged in logs/lighthouse-m08-c226.log; G23 95+ not met; no code change**
**המשך מ: M09-c226 DONE (2026-10-27): knip re-audit — only @capacitor/android flagged (native android/ dep for capacitor.config.ts, kept); no unused deps; unused exports are deliberate public API (money/ledger/cardcom, shadcn ui, schema); no code change**
**המשך מ: M04-c227 DONE (2026-10-27): pnpm type-check (tsc --noEmit) clean, 0 errors; committed generated docs drift only (M-CYCLE-STATUS, UI-PARITY-REPORT); no code change**
**המשך מ: M05-c227 DONE (2026-10-27): pnpm test full run — 615 files passed / 2 skipped, 7064 tests passed / 28 skipped, 0 failures; committed generated docs drift only (DB-STATUS, M-CYCLE-STATUS); no code change**
