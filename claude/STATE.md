
The canonical state file on this branch is the root `STATE.md`. This file
exists because the goal queue names `claude/STATE.md`; it holds the resume
line only, and the full block for each goal is in the root file.

**המשך מ: F43 DONE mobile 8.53%**

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
