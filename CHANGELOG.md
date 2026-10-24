# Changelog

## v1.0.0-mvp-rc3 - 2026-10-23

Release candidate 3 of the MVP, cut from closeout/v1-final.

### Added
- Nationwide city default and missing-location admin page (F04)
- Customer cancellation page, per-product window, consent toggle (F05)
- CSV import columns, parse-time validation and dry-run preview (F06)
- Supplier card verification before a lead is created (F07)
- Club tiers as data with a per-customer tier view (F08)
- Affiliate campaigns, click tracking, attribution and wallet payouts (F09)
- Weekend and free-shipping chips on real product data (F10)
- Browser push for coupon expiry reminders (F11)
- Passkeys and WhatsApp sign-in codes (F12)
- Maintenance flag in the database, Turnstile on checkout and supplier form (F13)

### Changed
- Phone home layout moved toward Electro v7 (F03)
- Location replaces category label on product cards and PDP (F02)

### Database
- Applied 26 pending migrations to production (F01, C02)

### Known issues
- Vitest: 14 failing tests in 11 files (F36)
- Visual parity gate (<11 percent vs Electro v7) not met at 380 and 768 on home; 1440 passes (8.29 percent). See scripts/parity-baselines.json
