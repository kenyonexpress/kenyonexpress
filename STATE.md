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
