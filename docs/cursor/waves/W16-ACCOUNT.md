# W16 Account unified

Code-agent spec. Account group already exists (`/account/*`). This wave is **one identity**, not a second profile table.

---

## What the wave builds

1. One session: Google / password / phone OTP all land on the same `profiles` row. `profiles.role` is not writable by the user (`enforce_profile_privilege_columns`).
2. Guest cart merge + wishlist merge in the same `/auth/callback` so neither vanishes.
3. `/account/security` MFA stays optional. Do not force MFA on customers at launch.
4. Saved cards: display only; charge is server-to-server (`submitCheckout`). Never put PAN in our DB.

---

## Tables

`profiles`, `auth.users`, `carts`, wishlist table(s), `push_tokens`.

---

## RLS

Owner SELECT/UPDATE of non-privilege columns. Role / `supplier_id` frozen. service_role bypasses the trigger (`auth.uid()` NULL). Server role assignment is the whole responsibility.

---

## Money invariants

Account pages display wallet via `v_wallet_ledger` (may still expose `*_ils`; parse, do not multiply by 100). No client-set agorot.

---

## Tests

`account.ts` actions, `cart-merge-never-duplicates.test.ts`, `saved-cards.test.ts`, `phone-otp.test.ts`, `safe-next.test.ts`. Guest cookie pair: `ke_session_id` vs PostgREST `session_id=`.

---

## Feature flag

`PHONE_AUTH_ENABLED`. Off: OTP UI hidden, existing phone users can still hold a session.

---

## Close

One profile per auth user. Merge does not duplicate cart lines. Privilege columns stay frozen.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
