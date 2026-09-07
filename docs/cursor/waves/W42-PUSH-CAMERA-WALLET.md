# W42 Push, camera, wallet

Code-agent spec. Push drain exists. Apple `.pkpass` exists. Camera is the till scanner (web `ScanClient` + mobile). Google Wallet route does **not** exist.

---

## What it builds

1. Push: W31 leftover; keep templates + `PUSH_ENABLED`.
2. Camera: web scan + permission copy. Do not send frames to a server.
3. Apple Wallet: user-scoped voucher; 404 if unconfigured. QR payload is the redeem capability: session RLS is the gate.
4. Do not add Google URL as live.

---

## Tables

`push_tokens`, `vouchers`.

---

## RLS

Apple GET uses `getCustomerVoucher` user client. Other people's ids look like 404.

---

## Money invariants

Pass must not print a price that checkout would not charge. Coupon on-site vs face: show the deal the till honors (face remaining at shop) **and** not imply a second charge on site.

---

## Tests before close

`pass-model.test.ts`, `google-wallet.test.ts` (module, not route). Push templates. Scan input.

---

## Feature flag

`PUSH_ENABLED`. Apple cluster env. Camera is just the page.

---

## Docs updated

`SECURITY-REVIEW.md` (QR in pkpass), `CUSTOMER-FAQ.md`.

---

## Edge cases

`no-store` on pkpass. Stale tab after redeem: till already_redeemed.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Add to Apple | הוספה ל-Apple Wallet |
| Camera deny | צריך הרשאת מצלמה לסריקה |
| Push opt-in | לקבל התראות על הקופון |

---

## Open questions

| Q | Best answer |
|---|---|
| Google Wallet? | **Not shipped.** Do not document a URL. |

---

## Second pass (capabilities)

- pkpass is `no-store`. QR is a capability. Do not email screenshots as a workaround (`RUNBOOK-R2-DOWN.md`).
- Push: `PUSH_ENABLED` + token + template. Withdraw = delete token (`CONSENT-MODEL.md`).
- Camera on till: membership session. No service_role in the APK (W18).
- Apple pass images can 404 if R2 is down; on-site QR still works.

