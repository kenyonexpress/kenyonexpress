# KenyonExpress - Project State (FINAL, F40)

Branch: closeout/v1-final. Tag: v1.0.0-mvp-rc3. Full history: docs/STATE-ARCHIVE.md. Cap: 300 lines.

LAUNCH-READY: pending-cardcom

## DONE-list
- F08-F12: core items, see archive
- F15 affiliate, F16, F17 supplier join, F18 admin product upload, F19 admin dashboards, F20 admin refunds, F21 partner QR redemption
- F22 legal pages (5 pages, Hebrew RTL), F23 a11y IS 5568, F24 SEO (JSON-LD, sitemap, robots, OG)
- F25 PWA (manifest, sw.js, offline shell), F26 web push (3 templates added), F27 observability (Sentry, PostHog, Axiom, health/ready)
- F29 email templates (gift, voucher-expiry, auth-mail), DNS: DKIM, SPF, MX, DMARC (p=none) present
- F30 WhatsApp (wa.me links only, Cloud API sign-in code as built)
- F32 Meilisearch (synonyms, suggest; MEILISEARCH_HOST and _API_KEY present in .env.production)
- F33 R2 media (presign, AVIF/WebP variants, R2Image), F34 feature flags phase 2, F35 security (gitleaks workflow)
- F37 CI audit, F39 CHANGELOG + tag v1.0.0-mvp-rc3

## BLOCKED-list
- F25 lighthouse: needs deployed-URL run + noindex decision for cart/checkout
- F31 pg_cron: migration 289 written in migrations/pending, NOT applied (Supabase MCP needs OAuth); 162 also unapplied
- F36 tests 2x green: vitest 14 red in 11 files (src/migration drift, outside tests scope)
- F38 parity gate: home 380=30.26, 768=29.0 best-known (need under 11); 1440=8.29 ok; no baselines for other pages
- F43 mobile gate 380px: same structural cause as F38
- F44 E2E 2x green: needs E2E_ADMIN_PASSWORD and RESEND_API_KEY (missing secrets, not code)

## PUSH-NOW
- Branch closeout/v1-final is in sync with origin; nothing unpushed except this STATE.md commit
- Uncommitted edits NOT mine, leave unstaged: docs/UI-PARITY-REPORT.md, scripts/apply-migration-mcp.mjs, scripts/apply-all-27-migrations.sh, scripts/apply-missing-migrations.sh

## HOLD
- Apply migrations 162 and 289 (one at a time via Supabase MCP, log to docs/MIGRATIONS-APPLIED.md) after auth
- DMARC tighten to quarantine + rua after monitoring
- Push notification kinds need a notification_outbox_kind_check migration before any send
- Flags F35 banner not mounted in layout

## MANUAL QUEUE (current item only)
1. Cardcom-prod-creds: set production credentials in the host env, then re-run checkout E2E on live. Next after this closes: Meilisearch-env.

Continue from F40 DONE: final STATE.md written, LAUNCH-READY: pending-cardcom. STOP.
Continue from Z05 DONE-AS-SHIPPED: F05 cancel-and-refund, app-only notifications toggle, migrations 185 and 280 were already built and applied (commit da60e5c63); no new code. Order domain and email tests 387/388 green (1 red: order_paid six-line email, pre-existing, outside this item). No new migration needed. UI visual gate (<11 pct at 380/768/1440) not closable: no RTL Electro v7 account baseline (same gate as F38). BLOCKED Z05 visual gate. Supabase MCP still needs OAuth for pending 162 and 289.
Continue from Z06 DONE: F06 CSV import already accepts cancellation_window_days, payout_cadence(_days), shipping_price_agorot (integer agorot), full_address, city, lat/lng (migrations 185/187/278 applied); added 5-row mapper/validation test (4 tests green). Live DB import not run: Supabase MCP needs OAuth and admin session.
Continue from Z07 DONE: F07 added POST /api/payments/verify-card-stub (404 unless CARD_VERIFY_STUB_ENABLED=true; auth + Idempotency-Key; deterministic id, 100 agorot, no provider call, no DB write, charged:false); 4 tests green. No UI, no migration.
Continue from Z08 DONE-AS-SHIPPED: F11 club tiers already built (migration 282 club_tiers + v_user_tier, editable name_he/threshold/benefits_json admin at /admin/club-tiers with audit log, sidebar link, account tier page; commit 714b01d7f). Added /admin/clubs permanent redirect to /admin/club-tiers (no pixel change, no visual gate, no migration). Club tests 6 green, biome clean. Note: 282 not listed in docs/MIGRATIONS-APPLIED.md, state in prod unverified (Supabase MCP needs OAuth).
Continue from Z09 DONE-AS-SHIPPED: F12 affiliate program already built (commit 10a784e9c, migration 283): per-campaign admin commission_bp, user share links at /account/affiliate, ke_aff 30-day cookie, rate snapshot in affiliate_attributions, wallet payout via fn_wallet_transfer idempotent affiliate:<order>, 14-day hold, reversal on cancel/refund, no self-earn, applyBp from money.ts. Affiliate rules tests green. Only change: AFFILIATE-DESIGN.md status refreshed. pending-migrations-inventory test red from stray 000_infrastructure_dependencies.sql, outside this item. 283 not in MIGRATIONS-APPLIED.md, prod unverified (Supabase MCP needs OAuth). No UI change, no visual gate.
Continue from Z10 DONE-AS-SHIPPED: F13 chips already wired (commits 8bd3339d8, 102139a3f): DealChips on /products, parseDealChips, category-page filters weekend_only=true and shipping_price_agorot=0, ProductCard badges. Correction: migration 185 holds only cancellation_window_days and payout_cadence; chip fields come from 284 (weekend_only) and 278 (shipping_price_agorot, applied). 284 not in MIGRATIONS-APPLIED.md, prod unverified (Supabase MCP needs OAuth), so ?weekend=1 may error on live DB until applied. deal-chips tests 3 green. No code change, no UI change, no visual gate.
