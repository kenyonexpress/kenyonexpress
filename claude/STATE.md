
The canonical state file on this branch is the root `STATE.md`. This file
exists because the goal queue names `claude/STATE.md`; it holds the resume
line only, and the full block for each goal is in the root file.
**המשך מ: M09-c193 DONE removed dead TopBarUserSection.tsx; remaining knip deps are false positives (@mdx-js/loader peer of @next/mdx, @types/*, @capacitor/* native scaffold); dead-export list left (API surface); tsc clean, vitest 7055 pass**
**המשך מ: M05-c193 DONE pnpm test clean (614 files pass, 7055 tests pass, 28 skipped); drift committed (docs/M-CYCLE-STATUS.md)**
**המשך מ: M09-c192 DONE removed unused @mdx-js/react + dead FaLinkedin/FaPinterest icons; other deps verified in use; knip dead-export list left (test-only/API surface); tsc clean, vitest 7055 pass**
**המשך מ: M04-c193 DONE pnpm type-check clean (tsc --noEmit, 0 errors); drift committed (docs/M-CYCLE-STATUS.md, docs/UI-PARITY-REPORT.md)**
**המשך מ: M04-c192 DONE pnpm type-check clean (tsc --noEmit, 0 errors); drift committed (UI-PARITY-REPORT rows, migration-310/fraud-table helper scripts)**
**המשך מ: M18-c191 DONE STATE.md already under 300 lines (claude/STATE.md 178), remainder in docs/STATE-ARCHIVE.md**
**המשך מ: M16-c191 DONE /product/[slug] emits Product + BreadcrumbList JSON-LD (json-ld.test 26/26); no code change**
**המשך מ: M06-c190 DONE pnpm build clean (all routes generated), no drift, nothing to fix**
**המשך מ: M18-c190 DONE STATE.md already under 300 lines (claude/STATE.md 168), remainder in docs/STATE-ARCHIVE.md**
**המשך מ: M18-c189 DONE STATE.md already under 300 lines (claude/STATE.md 161), remainder in docs/STATE-ARCHIVE.md**
**המשך מ: M11-c189 DONE sitemap.xml live: www 200 application/xml, 75 URLs, lastmod 2026-10-24, sitemap/robots tests 17/17; note locs+robots use apex which 308s to www (Vercel primary-domain setting, not code)**
**המשך מ: M18-c188 DONE STATE.md already under 300 lines (claude/STATE.md 154, root 182), remainder in docs/STATE-ARCHIVE.md**
**המשך מ: M15-c188 DONE-DEFERRED console check / and /product: / clean (only dev img-aspect warnings at 1440); /product logs suppliers.verification_status missing (42703) until migrations/pending/301 applied via Supabase MCP (auth unavailable)**
**המשך מ: M16-c187 DONE all product pages (/product/[slug], single template) emit JSON-LD Product + BreadcrumbList via lib/seo/json-ld.ts; json-ld.test.ts 26/26 pass; gift sub-route noindex**
**המשך מ: M04-c187 DONE pnpm type-check clean (tsc --noEmit, 0 errors), no drift**
**המשך מ: M18-c186 DONE STATE.md already under 300 lines (claude/STATE.md 139, root 180), remainder in docs/STATE-ARCHIVE.md**
**המשך מ: M04-c186 DONE pnpm type-check clean (tsc --noEmit, 0 errors), no drift**
**המשך מ: M05-c184 DONE pnpm test 602 files passed, 6954 tests, no drift**

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
המשך מ: M06-c182 DONE
M09-c182 2026-10-25: knip run. Removed unused react-hook-form + dead src/components/ui/form.tsx (no importers); type-check + build green. Kept @capacitor/android (android/ native project), drizzle-orm/postgres (knip false positive, drizzle.config needs SUPABASE_DB_URL). Unused exports/types (~236, mostly type-only public API) left in place: low value, wide blast radius; list in knip output.
RESULT: DONE
המשך מ: M09-c182 DONE
M11-c182 2026-10-25: sitemap.xml verified. Live www.kenyonexpress.co.il/sitemap.xml 200 application/xml, 75 URLs, newest lastmod 2026-10-24 (catalogue-driven); apex 308 -> www, sampled <loc> URLs resolve 200; robots.txt references sitemap; sitemap/robots vitest 17/17 pass. No code change.
RESULT: DONE
המשך מ: M11-c182 DONE
M17-c182 2026-10-25: RTL live check (www, Playwright, 380/768/1440) on / and /product/אוזניות-איירפודס-3. Both: html lang=he dir=rtl, no horizontal overflow, 0 LTR-direction elements with Hebrew text on /product. On /: only the 3 hero slide lines (standard_line/promo_small/promo_large) carry dir=ltr in locked src/components/home/HeroSlider.tsx (Electro v7 hero reference); not touched. No code changes.
RESULT: DONE
C02 2026-10-25: health gates (typecheck, lint, build) all green on closeout/v1-final, no fixes needed.
RESULT: DONE
המשך מ: C02 DONE
C04 2026-10-25: product parity measured vs Electro product capture: 380 42.77%, 768 33.85%, 1440 22.89% (all FAIL). Causes: anon key 401, suppliers.verification_status column missing, grid-count mismatch (needed COMPARE_ALLOW_GRID_MISMATCH=1). Report in docs/L3-PARITY-REPORT.md. No code changes.
RESULT: BLOCKED supabase-anon-key-401 + gate 22-43pct
המשך מ: C04 BLOCKED

C05: BLOCKED, migration 301 unapplied (Supabase MCP unauthenticated), e2e guest flow unverified; unit tests 278 pass. See docs/L4-CHECKOUT-REPORT.md

C06: BLOCKED, supabase-anon-key-401, account pages need a session (guest gets 307 to /login). See docs/L5-ACCOUNT-REPORT.md
המשך מ: C06 BLOCKED

C07: DONE, admin product upload verified end to end (manual + CSV): create, publish, /product/<slug> 200, delete, cleanup. Fixed free_shipping insert failure, unreachable CSV commit, weak dry-run validation. See docs/L6-ADMIN-REPORT.md
RESULT: DONE
המשך מ: C07 DONE

C08: BLOCKED, compare gate not met (home 46/41/30%, product 43/34/23% at 380/768/1440; Electro snapshot structurally unreachable, no /c baseline). Zero sideways scroll PASSED on all 14 pages at 380. See docs/L7-MOBILE-REPORT.md
RESULT: BLOCKED compare-gate-unreachable-vs-reference
המשך מ: C08 BLOCKED
C09: PWA verified end to end (manifest, SW, offline, install criteria 0 errors). Fixed prod-CSP nonce blocking all hydration/SW registration (proxy.ts), sw.js revalidation header, banner brand text. See docs/L8-PWA-REPORT.md
RESULT: DONE
המשך מ: C09 DONE

C10: BIG-SITE-GAP audit written, docs/BIG-SITE-GAP.md (EXISTS/PARTIAL/MISSING matrix, P0 none, 13 P1, 8 P2). Static audit only.
RESULT: DONE
המשך מ: C10 DONE

C11: no P0 items in docs/BIG-SITE-GAP.md (C10 matrix: P0 none), nothing to build. No code changes.
RESULT: DONE
המשך מ: C11 DONE

C12: JSON-LD added to /c and /c/<city>; docs/REDIRECTS.md and docs/L11-GROWTH-REPORT.md written; rest already present.
RESULT: DONE
המשך מ: C12 DONE

C13: hardening audited and verified (Upstash limits, Turnstile, CSP/HSTS, gitleaks, flags, maintenance all present, 135 tests pass). Sentry extra alert rules DONE-DEFERRED (no SENTRY_AUTH_TOKEN). See docs/L12-HARDEN-REPORT.md
RESULT: DONE
המשך מ: C13 DONE
המשך מ: C15 DONE (2026-10-25): docs/LAUNCH-CHECKLIST.md rewritten (PUSH NOW green/automatic + decided items; HOLD 7 human-only blockers: Cardcom prod creds, DNS, Resend, Supabase OAuth/migrations, Turnstile, business details, Sentry token) and docs/MANUAL.md created (7 owner-only steps, no secret values). Docs only.

M04-c183: pnpm type-check clean (tsc --noEmit exit 0), no drift to fix.
RESULT: DONE
המשך מ: M04-c183 DONE

M06-c183: pnpm build succeeds (Next.js production build, all routes generated), no drift to fix.
RESULT: DONE
המשך מ: M06-c183 DONE

M07-c183: TODO/FIXME scan. Resolved 2 (whatsapp.test placeholder, screenshot-all comment). Filed 3 in docs/BACKLOG.md (2x cardcom, r2-migration). stock-notifications TODO is 7 days old, re-check next scan.
RESULT: DONE
המשך מ: M07-c183 DONE

M09-c183: Unused deps + dead exports. knip: no removable deps (flagged capacitor/lighthouse/mdx are config/script-used). Removed 7 unreferenced src files (VendorDetailClient, CategorySort, store/CategoryNav, store/CategorySidebar, store/PromoBanners, db/schema/order-items, revslider-authored). Kept r2-migration.ts (BACKLOG #3). Exports/types left: public API/tested surface. tsc, vitest (6954 pass), biome green. No rendered-UI change; build/compare not re-run.
RESULT: DONE
המשך מ: M09-c183 DONE
המשך מ: M11-c183 DONE (sitemap.xml 200 on www, 75 urls, lastmod 2026-10-24; locs use apex host which 308s to www - env NEXT_PUBLIC_APP_URL note)
המשך מ: M17-c183 DONE (RTL probe on /, /product/barbecue, /product/pampers-* at 380/768/1440: html dir=rtl lang=he, 0 overflow, 0 LTR-Hebrew leaks, 0 text-align:left; only intentional dir=ltr = hero Latin promo text + email/tel inputs)
M09-c184: Unused deps + dead exports re-audit. knip: only unused dep is @capacitor/android (needed by android/ Capacitor platform, kept). Remaining src unused-file hits are entry/test/dynamic/backlog-kept (c183 already removed the safe ones); exports/types are tested public surface. No code change, no UI impact.
RESULT: DONE
המשך מ: M09-c184 DONE
M18-c184: STATE.md trim check. claude/STATE.md is 123 lines (<300), docs/STATE-ARCHIVE.md already holds the archived history; nothing further to move. No code change.
RESULT: DONE
המשך מ: M18-c184 DONE
M09-c185: Unused deps + dead exports re-audit. knip: only unused dep is @capacitor/android (needed by android/ Capacitor platform, kept). Unused-file hits are entry/test/script/backlog-kept and locked components (untouched); exports are tested public surface, same as c183/c184. No code change, no UI impact.
RESULT: DONE
המשך מ: M09-c185 DONE
M15-c185: Console check on / and /product/<slug> at 380/768/1440 (dev server). / clean apart from dev-only noise. /product logs error product_detail.supplier_load_failed: column suppliers.verification_status does not exist (migrations/pending/301_supplier_verification_status.sql not applied; Supabase MCP not authorized in this session). No code change.
RESULT: BLOCKED migration 301 unapplied, Supabase MCP unauthorized
המשך מ: M15-c185 BLOCKED
המשך מ: M16-c185 DONE
המשך מ: M17-c185 DONE (live RTL probe / and /product/עוזרת-אישית-שירותי-משרד at 380/768/1440: html dir=rtl lang=he, 0 overflow, 0 text-align:left, 0 LTR leaks on /product; on / only 11 dir=ltr hero promo paragraphs in locked hero, untouched; no code changes)
המשך מ: M18-c185 DONE STATE.md trimmed 299 ->      178 lines, older log lines archived to docs/STATE-ARCHIVE.md
המשך מ: M05-c186 DONE (pnpm test 6962 pass/0 fail; F59 drift fixed: scheduled-gifts cron registered, migration 305 listed, GiftButton console removed, cron voucher read handles error)
המשך מ: M06-c186 DONE (pnpm build passes; drift committed: not-found title, M-CYCLE-STATUS, claude_STATE, F59 status doc)
המשך מ: M10-c186 DONE-DEFERRED (85 files in migrations/pending, not verified applied: Supabase MCP unauthorized in this session and anon key 401; 301_supplier_verification_status.sql known unapplied via product_detail.supplier_load_failed; apply one at a time via apply_migration once Supabase access is restored)
המשך מ: M14-c186 DONE-DEFERRED (SENTRY_AUTH_TOKEN is placeholder/absent in .env.local, .env.production, .env.vercel; Sentry release vs HEAD not verified; re-run once real token set)
המשך מ: M17-c186 DONE (RTL live probe on / and /product sample at 380/768/1440: html lang=he dir=rtl, 0 horizontal overflow, 0 LTR-direction Hebrew containers, 0 text-align:left or float leaks; no code changes)
המשך מ: M07-c187 DONE (TODO/FIXME scan: 7 TODOs older than 7 days, all filed in docs/BACKLOG.md; stock-notifications revalidateTag added as #4; no source changes)
המשך מ: M10-c187 DONE-DEFERRED (85 files in migrations/pending, not verified applied: Supabase MCP unauthorized in this session; 301_supplier_verification_status.sql still known unapplied; apply one at a time via apply_migration once Supabase access is restored)
המשך מ: M13-c187 DONE
המשך מ: M17-c187 BLOCKED locked-component (RTL probe / and /product at 380/768/1440: dir=rtl lang=he, 0 overflow, product clean, static scan clean; / at 768+1440 has 11 Hebrew <p dir="ltr"> in src/components/home/HeroSlider.tsx:555-628 (standard_line/promo lines) - fix needs locked file; no code changes)
המשך מ: M02-c188 BLOCKED gate-fail (compare.mjs --page=product, COMPARE_ALLOW_GRID_MISMATCH=1 since live snapshot shows 1 card vs local 4: 380px 53.74%, 768px 41.96%, 1440px 26.32%, all >11%; height ratios 0.58x/0.43x/0.35x so figures are structural-mismatch not pixel gate; no code changes)
המשך מ: M06-c188 DONE (pnpm build passes; committed untracked drift src/lib/rate-limit.ts + docs/TURNSTILE-SETUP.md)
המשך מ: M07-c188 DONE (TODO/FIXME scan: 6 markers in 4 groups, all >7 days old, all already filed in docs/BACKLOG.md #1-4; no new markers; no code changes)
המשך מ: M09-c188 DONE (deps audit: 0 removable - @mdx-js/loader+react are @next/mdx peers, capacitor platforms/husky/lint-staged/@types are implicit tooling; 53 unreferenced lib function exports are payment/ledger/R2/push/ops infra kept for launch, not deleted; no code changes)
המשך מ: M16-c188 DONE (JSON-LD audit: only indexable product page src/app/(store)/product/[slug]/page.tsx emits Product + BreadcrumbList via src/lib/seo/json-ld.ts, both built from resolved page values; gift sub-page is noindex; json-ld.test.ts 26/26 pass; note: Product LD includes aggregateRating from getProductReviews, conflicts with no-reviews rule, left untouched as out of scope; no code changes)
המשך מ: M17-c188 DONE (RTL check / and /product/[slug] at 380/768/1440: html lang=he dir=rtl, body direction rtl, scrollWidth==viewport, 0 Hebrew text nodes with text-align:left or direction:ltr; rtl-lint hits on home/product files are all false positives (comments, centered 50% pseudo-element, OG image); no code changes)
המשך מ: M05-c189 DONE (pnpm test 7034 pass/0 fail after fixing F63/F64 drift: removed stray duplicate supabase/migrations/130_suppliers_open_weekends.sql, added preflight_306 + README row + regenerated manifest, aligned auth/checkout/supplier-lead rate-limit call sites to policies table, classified rateLimit gate/check_rate_limit caller/fetch allowlist/supplier-apply exemption in tests; biome + tsc clean)
המשך מ: M06-c189 DONE (pnpm build green on closeout/v1-final at f22442efd, all routes compiled, no drift to fix; no code changes; docs/M-CYCLE-STATUS.md timestamp diff is cron-generated, left unstaged)
המשך מ: M09-c189 DONE (deps re-audit: 12 packages with no direct source import, all implicit tooling/peers/types - @mdx-js/loader+react are @next/mdx peers, @capacitor core/android/ios are native platform deps, @biomejs/biome and @vitest/coverage-v8 are CLI/provider, @types/* feed tsc; 0 removable; dead lib exports are payment/ledger/R2/push/ops infra kept for launch; no code changes)
המשך מ: M10-c189 DONE-DEFERRED (87 files in migrations/pending, not verified applied: Supabase MCP unauthorized in this session; 301_supplier_verification_status.sql still known unapplied; apply one at a time via apply_migration once Supabase access is restored)
המשך מ: M15-c189 DONE (console check on prod build via next start: / and /product/עוזרת-אישית-שירותי-משרד at 1440 + 380, 0 console errors/warnings, 0 pageerrors, 0 failed requests, 0 HTTP >=400; no code changes)
המשך מ: M04-c190 DONE (pnpm type-check green, tsc exit 0; only drift was docs/M-CYCLE-STATUS.md timestamps, committed)
המשך מ: M05-c190 DONE (pnpm test 7034 pass/0 fail, 612 files; only drift was docs/M-CYCLE-STATUS.md timestamps, committed)
המשך מ: M09-c190 DONE (no unused deps removable: lighthouse used via pnpm exec, capacitor needed by native projects/config, mdx peers of @next/mdx; un-exported ~130 dead exports in src/lib via knip; type-check green; pnpm test has 8 failures from F66 fraud work (migration inventory, use-fingerprint console, finalize.ts reads), unrelated)
המשך מ: M10-c190 DONE-DEFERRED (      86 files in migrations/pending, not verified applied: Supabase MCP unauthorized in this session; apply one at a time via apply_migration once Supabase access is restored)
המשך מ: M11-c190 DONE (sitemap.xml + robots.txt 200 on www, 75 URLs, served 24.10 lastmod fresh; finding: sitemap locs use apex kenyonexpress.co.il which 308s to www - set NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il in Vercel; also lists e2e-test-physical and '-copy' products)
המשך מ: M04-c191 DONE (type-check green; committed 16 drifted files - unused-const underscore renames, migration 310 manifest entry; untracked 310/fraud scripts left uncommitted)
המשך מ: M05-c191 DONE (pnpm test 7055 pass/0 fail, 614 files; fixed F66 drift: removed supabase/migrations/310 copy, added preflight_310 + README row + manifest, named discarded read errors in fraud-alerts/[id] + finalize.ts, dropped console.error in use-fingerprint; type-check green)
המשך מ: M06-c191 DONE (pnpm build exit 0; committed M-CYCLE-STATUS.md timestamp drift; untracked 310/fraud scripts left uncommitted)
המשך מ: M07-c191 DONE (TODO/FIXME scan: 4 markers older than 7 days, all already in docs/BACKLOG.md, none new or resolvable without Cardcom creds/feature work; BACKLOG header re-verified)
המשך מ: M08-c191 DONE (Lighthouse mobile local prod build, 2 runs each: / perf 39-43 a11y 100 bp 92 seo 100; /product perf 51-55 a11y 100 bp 92 seo 100; logged in logs/lighthouse-m08-c191.log; G23 95+ still open)
המשך מ: M09-c191 DONE (deps all in use incl. tooling/peer deps; un-exported 6 dead internal symbols; tsc, biome, vitest green)
המשך מ: M10-c191 DONE-DEFERRED (87 sql files in migrations/pending, not verified applied: Supabase MCP unauthorized in this session; 301_supplier_verification_status.sql still known unapplied; apply one at a time via apply_migration once Supabase access is restored)
המשך מ: M17-c191 BLOCKED locked-component (RTL check on / and 2 /product samples at 380/768/1440: dir=rtl, lang=he, 0 overflow, 0 LTR leaks on /product; on / the only leak is hero slide copy under dir=ltr wrappers in src/components/home/HeroSlider.tsx:555-628, locked file, not edited)
המשך מ: M05-c192 DONE (pnpm test green: 614 files passed, 7055 tests passed, 28 skipped; committed only logs/lighthouse-m08-c191.log; left uncommitted src/app/(store)/page.tsx + 2 docs edits from a concurrent process, which remove CitiesRow/DealChips contrary to C24)
המשך מ: M06-c192 DONE (pnpm build green; committed docs drift docs/M-CYCLE-STATUS.md + docs/UI-PARITY-REPORT.md; left uncommitted src/lib/product-detail.ts, a concurrent edit dropping verification_status from the suppliers select, not mine)
המשך מ: M16-c192 DONE (verified: only indexable PDP src/app/(store)/product/[slug]/page.tsx emits JSON-LD Product + BreadcrumbList via src/lib/seo/json-ld.ts; gift sub-page is noindex; json-ld.test.ts 26/26 green; no code changes)
המשך מ: M06-c193 DONE (pnpm build green exit 0; no drift in tree after build, nothing else to commit; no code changes)
המשך מ: M10-c193 DONE-DEFERRED (migrations/pending has 89 files, applied/ has 63; cannot verify against production because Supabase MCP is unauthenticated in this session and service role key awaits C51 recovery; nothing applied, no code changes)
