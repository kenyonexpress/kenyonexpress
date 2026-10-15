# Launch status

Measured 2026-10-16 on branch closeout/v1-final, tagged v2.0.0-rc4 (rc1 to rc3 already existed and were not moved).

## WORKS (verified green)

- Unit and integration tests: `pnpm test` passes, 394 files, 4692 tests (25 skipped for missing DB env).
- Type-check: no error in `src/` (the only errors are in the git-ignored `.next/types`).
- Production build: `pnpm build` compiles.
- Browser suite without a database: 255 of 257 passed on one full run (2 skipped); a second full run passed 253 and failed only the two guest-cart specs on the per-IP cart write limiter (120 per hour), which a second run from one address exhausts.
- Parity gate, home at 1440: 9.3% against the localized reference (gate 11%).
- Mobile: 14 pages at 380, 390 and 430, all HTTP 200 with zero sideways scroll (`docs/MOBILE-AUDIT.md`).
- Storefront icons come from Electro v7's own font files (`docs/ICON-AUDIT.md`).
- Business-join page with a click-wrap agreement; hash, time and IP stored in the audit log.
- Consumer cancellation fee and window (pure, tested); scheduled gift delivery; CSV bulk product import; club tier standing; location pin with Waze link; cities row and `/c/<city>` pages.
- Maintenance mode flag, Turnstile on contact and signup (inert until keys are set), gitleaks CI job (non-blocking at first).
- DNS: Vercel nameservers, Resend DKIM present, SPF on the send subdomain, DMARC at p=none.

## NOT DONE (needs a decision, a migration approval, or an external account)

- Home at 380 is 30.24% against the WordPress reference (gate 11%): a mobile layout project (KNOWN-ISSUES 3).
- Bottom navigation bar and sticky add-to-cart on mobile: not built.
- F05 customer cancel and refund action, app-only notification toggle: need a rehearsed migration.
- F06 form fields for cancellation window and payout cadence: wait for migration 185.
- F07 one-shekel card verification at signup.
- F12 affiliate campaigns and payouts: design in `docs/AFFILIATE-DESIGN.md`.
- F13 weekend and free-shipping chips: no data behind them.
- F14 web push subscription; F15 passkeys and WhatsApp OTP.
- F19 feature flags table; F20 R2 nightly backup (R2 not enabled).
- Pending migrations 185, 186, 187 are written, not applied.
- 66 physical products have no city (PENDING_LOCATION).

## REQUIRES-OFIR

- Cardcom production credentials.
- DNS nameservers at box.co.il, if not Vercel.
- Meta WhatsApp business verification.
- Israeli lawyer review after the first 10 sales.
