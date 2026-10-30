# C91 CARD-VERIFY-1ILS (F07) - re-run 2026-10-30

- Flow already existed: `src/server/supplier/card-verification.ts` charges 100 agorot (`agorot(100)` via money.ts) on Cardcom hosted page with token creation, verifies server-to-server, then voids. Mock provider verifies in-process; live charge on a non-sandbox terminal needs `PAYMENTS_PROD_ENABLED=true` (C101).
- Token storage: `supplier_card_tokens` (migration 281, applied), linked to the supplier lead; no card number ever touches this server. There is no `profiles` column; the supplier-side record is the profile equivalent.
- NEW: flag `card_verify_enabled`, default off (`migrations/pending/321_card_verify_enabled_flag.sql` + preflight, env `FLAG_CARD_VERIFY_ENABLED`). Off: `submitSupplierLead` skips the card step and creates the lead directly. On: existing verify flow. Wired in `src/lib/flags/index.ts`, `supabase-flags.ts`, `src/server/actions/supplier-lead.ts`.
- Tests with mock: `src/server/supplier/card-verification.test.ts`, flag tests (count 8), pending-migrations inventory updated; pnpm vitest and tsc clean.
- Not done: migration 321 apply deferred, DB credentials rejected (same blocker as C81/C83); sandbox smoke not run, Cardcom sandbox creds are placeholders (see C101).

RESULT: DONE
