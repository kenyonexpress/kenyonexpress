# W17 Guest flow

Code-agent spec. `/checkout` is ungated. Pay requires sign-in. `/checkout/frame-return` must stay ungated (Cardcom iframe, `SameSite=Lax`).

---

## What the wave builds

1. Guest shops. `src/proxy.ts` mints `ke_session_id` (httpOnly, 30d, `Secure` only when `x-forwarded-proto` is https; WebKit E2E on `http://localhost` drops unconditional Secure).
2. `createGuestCartClient` sends **constructed** `Cookie: session_id=<uuid>`, never the browser jar.
3. Sign-in on Pay. Callback merges cart. Delete `ke_session_id` after merge.

**Do not build.** Forwarding the visitor Cookie header to PostgREST. Renaming one cookie without the other (TEST-MAP G17/G21).

---

## Tables

`carts` (the **only** table `anon` may write). Lines are `items` jsonb. There is no `cart_items` table.

---

## RLS

```
session_id = (current_setting('request.cookies', true)::json ->> 'session_id')
```

Policy name is `session_id`, browser name is `ke_session_id`. Two names on purpose.

---

## Money invariants

Cart jsonb is not money. `beginCheckout` re-reads products and `calculateCommission`.

---

## Tests

`guest-session-cookie.test.ts`, `anon.test.ts` (`Cookie: session_id=`), `cart-merge-never-duplicates.test.ts`, `route-guards.test.ts` (checkout root and frame-return ungated).

---

## Feature flag

None. `CHECKOUT_ENABLED` closes the till for everyone, including guests.

---

## Close

Empty cart after rename is a cookie bug, not cache. Login inside the iframe is a proxy-gate bug.

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
