# Known issues

The v1.2.0 ledger of what is knowingly imperfect. Every entry names its
severity and the reason it is not fixed in code; nothing here is a surprise
waiting to be re-discovered.

| # | Severity | Owner | Issue | Why it stays |
| --- | --- | --- | --- | --- |
| 1 | **BLOCKER (env, not code)** | Ofir | Production checkout runs against the mock Cardcom provider (`CARDCOM_USE_MOCK=true`, no terminal credentials) | The fix is credentials only Ofir has (03-9436100). Removing the flag alone makes it worse. `docs/DEPLOYMENT.md` has the exact order. |
| 2 | high | Ofir | Two `TODO(cardcom)` in `src/lib/payments/cardcom.ts` (:246, :309): the legacy refund and document endpoints' exact field names are unconfirmed against a live terminal | Cannot be confirmed without the production terminal — same blocker as #1. Verified against docs, not against the wire. |
| 3 | high | קוד (פרויקט layout) | Mobile layouts (380/768) diverge structurally from live (height ratio 0.59; whole-page diffs 35-43%) | A layout project, not a tuning pass. Desktop (1440) is under the 11% gate at 7.08%. |
| 4 | medium | Ofir | 14 of 45 active products carry slugs that describe a different product ("copy", numeric, wrong item) | Content: rewriting slugs changes public URLs and needs 301s plus a per-product decision. |
| 5 | medium | Ofir (MCP) | 31 migrations sit in `migrations/pending/` unapplied — five of them are what turns payment_events, refunds destination, analytics, payouts and ai_usage fully on | Applying is a hard stop reserved for Ofir via MCP, in APPLY-ORDER.md order. Each of this closeout's six carries a rolled-back production dry run. |
| 6 | medium | קוד (אחרי 150) | Subscriptions have no pause/card-swap verbs and no status emails; renewal journal events not emitted | Named in docs/SUBSCRIPTIONS.md; the email kinds ship in a migration first (outbox constraint). |
| 7 | low | dependabot | `pnpm audit --prod`: 2 high / 1 low transitive advisories | Report-only in the nightly; fixes are dependency PRs (dependabot now targets main again). |
| 8 | low | Ofir | Hero headline antialiasing differs from live (Open Sans there, Heebo here, 51px glyphs) — the floor under the 5% fold target at 1440 | Heebo is a standing project rule; swapping fonts is Ofir's call. |
| 9 | low | קוד (perf) | Shared first-load client JS is 255.6 KB gz vs the 180 KB spec budget; `scripts/bundle-gate.mjs` ratchets at 260 KB so it cannot grow | Cutting 75 KB from the shared bundle is a profiling project (largest chunk 129.9 KB); the ratchet holds the line meanwhile. |
