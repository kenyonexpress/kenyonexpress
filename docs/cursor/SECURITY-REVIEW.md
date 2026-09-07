# Security review (threat model)

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only. Companion:
`docs/SECURITY-POSTURE.md`,
`docs/cursor/RLS-CATALOG.md`,
`docs/cursor/ERROR-TAXONOMY.md`,
ADR 0005 / 0007.

Scope: what an attacker can try against **checkout, redemption, refunds, the supplier portal, and the admin panel**, and what stops it **in this tree today**. Residual risk is named. "Stops" means a concrete control, not a hope.

Assets worth stealing, in order: voucher value (bearer at a counter), card charges, wallet mint, PII, supplier commercials, admin.

---

## 1. Trust boundaries

```
internet
  ├─ anon (catalogue read; guest cart write via session_id)
  ├─ authenticated user (RLS: own orders, own wallet read, own reviews)
  ├─ supplier_members (till HTTP + DEFINER RPCs; profiles.role often still customer)
  ├─ admin / super_admin / content_uploader / support (proxy optimistic; actions re-check)
  ├─ Cardcom (POST is a doorbell; GetLpResult is money)
  ├─ scheduler (Bearer CRON_SECRET)
  └─ Next server (service_role). Never a browser. Never apps/mobile.
```

`src/proxy.ts`
is not the security kernel. Every money action re-gates. `/checkout` itself is public (guests). `/checkout/frame-return`
is ungated on purpose (iframe, no Lax cookies).

---

## 2. Checkout and Cardcom

| # | Attempt | What stops it today | Residual |
|---|---|---|---|
| C1 | POST a fake "paid" webhook | Unguessable `?s=` compared **constant-time to both current and previous** secrets (no short-circuit). Body **ignored for amount**. Server
`GetLpResult`
is the only trusted amount/status/token. | Secret in the URL is still a secret. Leak of
`CARDCOM_WEBHOOK_SECRET`
lets an attacker *notify*; they still cannot invent a Low Profile result unless they also beat Cardcom. Rotate with `_PREVIOUS`. |
| C2 | Replay the same webhook | `finalizeOrder`
returns
`{ ok: true, replay: true }`
if
`paid_at`
set. `23505`
on
`payment_events.external_event_id`. | Logic bugs in a new writer that skips
`paid_at`.
There must be **one** paid writer. |
| C3 | Charge ₪1, webhook claims ₪400 | Amount mismatch vs order agorot after GetLpResult | Must ntfy (
`capturePaymentError`).
If that path is silent, this is catastrophic. |
| C4 | Two tabs, two Low Profiles, one cart | Idempotency key on
`beginCheckout`; stock consume after pay | Residual: two **different** keys before pay. High (FAILURE-MODES two-tabs). |
| C5 | Guest pays without consent / identity | Action codes
`CONSENT_REQUIRED`,
`UNAUTHENTICATED`
on Pay | `/checkout` browsing is open. Intended. |
| C6 | `CARDCOM_SANDBOX=true` in Production | Boot refuses | Someone "fixes" boot. Kill switch
`CHECKOUT_ENABLED`
must stay a strict string. |
| C7 | Mock provider left on | Env + preflight | Looks healthy, no settlement. Launch blocker. |
| C8 | CSRF on beginCheckout | Server action + origin; payment lives on Cardcom | Frame-return must stay ungated or Cardcom cannot return. |
| C9 | Open redirect after pay | `safeNextPath` family on auth; checkout return URLs are ours | New `next=` param without the helper. |
| C10 | Client sends
`platform_percent`
or a made-up
`coupon_price` | Server re-reads product; missing percent/price → unsellable | A bug that trusts the cart JSON for agorot. Tests in money map. |
| C11 | Buy the ₪1 / ₪400 master row | Guard on product id
`9bb347f8-03ec-48ce-8ff2-2503fb74c895` | Removing the guard "because QA". 172 zeros stock (human apply). |
| C12 | Enumerate Low Profile ids | Unpredictable ids from Cardcom; our callback secret | Log bodies still go through
`redact()`. |

**Not stopped by HMAC.** There is none on legacy aspx. Do not add a check that "verifies" the POST amount.

---

## 3. Redemption (web till + mobile)

| # | Attempt | What stops it today | Residual |
|---|---|---|---|
| V1 | Redeem a code at the wrong business | RPC
`redeem_voucher`
takes supplier from
`supplier_members`
+
`auth.uid()`,
**not from the body**. Pure layer returns
`wrong_supplier`; HTTP collapses to
`not_found`. | Employee at the **right** business can redeem without the customer if they know the code. Audit:
`voucher_redemptions`
IP/UA/staff_id. |
| V2 | Redeem twice (two devices) | Conditional
`UPDATE … WHERE status = 'issued'`.
Second →
`already_redeemed`
409. | Mobile offline queue inventing local success (G13). Drain must be the RPC, not a client flag. |
| V3 | Forge QR | HMAC/payload with
`VOUCHER_QR_SECRET`.
Route verifies **before** DB. | Secret leak + missing previous key during rotation = every issued QR dead (availability), or forgeable (integrity) if they have the current key. |
| V4 | Brute short codes | Rate limit per identity; codes are not 4 digits | Lookup endpoint exists. Same collapse for wrong supplier. |
| V5 | Pass `supplier_id` in JSON | Ignored | A new route that "helps" the app by trusting the field. |
| V6 | Use service_role in
`apps/mobile` | Architecture: anon + DEFINER RPCs. Documented as R26 if violated. | A "quick fix" that puts the key in
`app.json`.
Catastrophic. |
| V7 | Staff PIN as login | PIN is attribution. Wrong PIN does not hide the till. | Shoulder-surfing PIN does not grant a new supplier. Compromised **member** session does. |
| V8 | Scan after refund/cancel | Terminal voucher states. Outcome
`refunded`/`cancelled`. | Operator goodwill via wallet, not a second redeem. |

---

## 4. Refunds and wallet

| # | Attempt | What stops it today | Residual |
|---|---|---|---|
| R1 | Card-refund a redeemed voucher | `planOrderRefund`
blocks. Admin UI
`describeRefundBlockers`
Hebrew **before** click. | Social-engineer an admin to wallet-credit anyway (that path is explicit goodwill). |
| R2 | Support role calls
`refundOrder` | Money gates
`is_admin()`,
not
`is_support()`.
Support is read-expanded. | A new action that copies the wrong helper. Test:
`audit-required`,
permissions tests. |
| R3 | Refund over charge / float fee | Integer CHECK: fee = min(5%, ₪100); 0 on defect/duplicate.
`applyBp`,
not
`* 0.05`.
`23514`
even for service_role. | New code path using
`Math.round(x * 0.05)`. |
| R4 | Double refund | Order status guard, like
`paid_at` | Provider-side vs our row split-brain. Reconcile cron. |
| R5 | Mint wallet | `fn_wallet_transfer`
server-only, idempotent keys (
`order:<id>:cashback`).
Fossil
`wallet_balances`
must stay 0 rows. | Client insert policy too wide (flag in RLS catalog). |
| R6 | Apply someone else's wallet | User-scoped read + server debit of **session** user | Guest has no wallet. |
| R7 | Un-pay by throwing after Cardcom success | Finalize must not reverse
`paid`
on stock failure (G11) | A patch that "rolls back the order" after capture. |

Cashback credits at **finalize**, not at scan. A scanner cannot farm cashback.

---

## 5. Supplier portal

| # | Attempt | What stops it today | Residual |
|---|---|---|---|
| S1 | Customer hits
`/supplier/scan` | Proxy gate + membership. Access-denied page. | Optimistic proxy; page must re-check. |
| S2 | Member of A reads B's redemptions | Queries tenant-scoped (
`supplier-tenant-scope.test`) | A query that filters in JS after a wide select. |
| S3 | Uploader / supplier edits
`platform_percent` | Admin-only write; uploader prohibitions tests | Form "default 10". Unsellable is correct. |
| S4 | CSV payout download as data steal | Payout tables dead
`42P01`.
Coupon model owes 0. | Future payout UI without RLS. |
| S5 | IDOR
`/api/supplier/vouchers/lookup` | Same membership RPC rules | Token in mobile logs. |

---

## 6. Admin panel

| # | Attempt | What stops it today | Residual |
|---|---|---|---|
| A1 | Guess
`/admin` | Proxy checks role set `{admin, super_admin, content_uploader, support}`. Unauthenticated → login. | Role in
`profiles.role`,
**not**
`app_metadata`.
A JWT claim check that ignores profiles is a hole. |
| A2 | content_uploader on money screens | `requireSection`
per page; actions re-check; uploader prohibitions | New nav item without section map. |
| A3 | Raise own role via profile form | RLS: users cannot set
`role`.
Admin users action + audit. | service_role script in a random
`scripts/*.mjs`
without audit. |
| A4 | SQL from reports UI | Parameterised RPCs; pending-reports treats
`42P01`
as not-yet | Concatenated report name (there is a report route). Must stay on an allowlist. |
| A5 | Read
`payment_webhook_events`
with user client | Zero-policy / commented bug in 172_rls. Must
`createAdminClient`
on that tab (G18). | Shipping the tab on the user-scoped client: empty or 42501, or if policies go wide, PII dump. |
| A6 | XSS in Hebrew fields | Admin is logged-in. Reviews: no HTML. React escaping. | `dangerouslySetInnerHTML`
on a deal description. |
| A7 | CSRF on refund button | Server actions | Get-based refund would be a crime. There isn't one. |

---

## 7. Session, guest, and RLS classics

| # | Attempt | What stops it today | Residual |
|---|---|---|---|
| G1 | Steal guest cart by cookie name mixup | Guest client sends
`session_id`,
**not** the browser jar, **not**
`ke_session_id`.
`anon.test.ts`. | Policy SQL drift (G17). |
| G2 | `has_role('customer')` as allow | Documented footgun: true for every profile | One new policy using it. |
| G3 | Disable RLS on a new table | Lint / catalog; 0 disabled measured historically | "Just this once" for a report table. |
| G4 | DEFINER function with caller-controlled uid | Known class; memory + reviews 154 as the model (policy is the gate) | New RPC that takes
`p_user_id`
from the client. |
| G5 | Leak service_role | `admin.ts`
server only; boot leaky-name guard
`NEXT_PUBLIC_*SECRET*`;
`compromised-keys.mjs`
hash refuse | Git history already had a foreign expired key. Rotation runbook. |

---

## 8. What the platform does **not** claim

- PCI: we do not see PAN. Cardcom iframe. Tokens are Cardcom tokens, not cards.
- HMAC on Cardcom callbacks: absent. Compensating controls in §2.
- Perfect secrecy of voucher codes: they are spoken at a counter. The control is supplier membership + one-shot status, not encryption of the short code.
- That
  `support`
  is harmless: they can read more than a customer. They must not refund.
- That CSP is nonce-strict: still
  `'unsafe-inline'`
  until proxy nonces (
  `next.config.ts`
  comment). XSS is then a real class.

---

## 9. Launch-adjacent security chores (human)

Not code. Ordered in
`docs/cursor/LAUNCH-BLOCKERS.md`:
rotate exposed secrets, production Cardcom (not sandbox), never put service_role in the phone app, confirm webhook secret is **ours** (`openssl rand -hex 32`), Resend domain so voucher codes do not bounce to a shared inbox.

If this review and
`docs/SECURITY-POSTURE.md`
diverge: this file follows
`src/proxy.ts`,
legacy aspx, and the 28.07 no-escrow model.
