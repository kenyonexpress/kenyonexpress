# Error taxonomy

This pack lives under
`docs/cursor/`
on branch
`ke-cursor-docs`.
It is markdown only. Where this file and
`docs/FAILURE-MODES.md`
disagree, the live tree on this branch is right.
`FAILURE-MODES.md`
still contains a 2026-09-01 "no deployment at all" ranking. Production preview is
`https://kenyonexpress.vercel.app`.

A failure has four faces. This file names all four so a 03:00 grep does not invent a fifth.

| Face | Where |
|---|---|
| **Class / code** | TypeScript class, `ApiErrorCode`, checkout `code`, scan `outcome`, or Postgres `SQLSTATE` |
| **Cause** | What the code actually detected |
| **User sees** | Hebrew string, or a generic collapse |
| **Operator does** | Log
`event`,
Sentry tag, ntfy, or "nothing, this is expected" |

Upstream `error.message` must not become a JSON body on a public route (
`log-coverage.test.ts`). Cron behind
`CRON_SECRET`
is the documented exception.

---

## 1. Wire envelope (route handlers)

`src/lib/api/errors.ts`
+
`src/lib/api/envelope.ts`.

Success:
`{ ok: true, data }`
Error:
`{ ok: false, error: <code>, message?, details? }`

| Code | HTTP | Cause | User sees | Operator |
|---|---|---|---|---|
| `invalid_request` | 400 | Zod / malformed JSON | Hebrew when the handler set `message` (example: `גוף הבקשה אינו JSON תקין`). Otherwise the code string. `details` may be flattened field errors. | Not an alert. Fix the client or the schema. |
| `unauthorized` | 401 | Missing/wrong bearer, no session, cron secret mismatch | Empty or generic. Webhook 401 means Cardcom will retry. | If **all** webhooks 401: rotated
`CARDCOM_WEBHOOK_SECRET`
without `_PREVIOUS`. If **all** crons 401:
`CRON_SECRET`
drift. |
| `forbidden` | 403 | Authenticated but wrong role / not a member | Hebrew from the page, not always the envelope | Check
`profiles.role`
vs
`supplier_members`.
Do not "fix" with service_role in the client. |
| `not_found` | 404 | Missing row **or** anti-enumeration collapse | For scans, also the public face of
`wrong_supplier` | Do not treat every 404 as a missing voucher. Grep
`voucher.redeem`
/
`outcome`. |
| `conflict` | 409 | Idempotent clash, already redeemed, unique violation turned public | Hebrew scan: `השובר כבר מומש` | Usually expected. Two tills, one code. |
| `rate_limited` | 429 | Upstash or Postgres limiter | `יותר מדי סריקות, המתן רגע` / search `{ error: 'rate_limited' }` | If a single IP is 429, abuse. If everyone is 429, limiter misconfig or Redis down falling through badly. |
| `internal_error` | 500 | Unknown throw. Envelope **strips** internals. | Generic | `log.error` + Sentry. This is the bucket that used to leak WAF HTML through `/api/search`. |
| `service_unavailable` | 503 | Declared dependency down | Retry later | Provider status. Cardcom vs Supabase vs R2. |

`errorResponse(thrown)`:
`ApiError`
as-is;
`ZodError`
→
`invalid_request`;
else
`internal_error`
with no message.

---

## 2. Checkout action codes

`CheckoutActionErrorCode`
in
`src/lib/validations/checkout.ts`.
Returned as
`{ ok: false, error: <Hebrew>, code }`.
The Hebrew is the user face. The code is the operator face.

| Code | Cause | User sees (representative) | Operator |
|---|---|---|---|
| `UNAUTHENTICATED` | Pay without session | `יש להתחבר לפני התשלום` | Guest reached Pay. Proxy does not gate `/checkout` itself. Expected. |
| `VALIDATION` | Zod on beginCheckout body | Field-level Hebrew from the form | Client bug or stale app. |
| `NOT_FOUND` | Product / cart line gone | Product unavailable copy | Catalogue edit during checkout. |
| `INSUFFICIENT_STOCK` | Stock check failed | Hebrew stock message | Real stock vs the ₪1 master row (must stay unsellable). |
| `INSUFFICIENT_WALLET` | Wallet apply > balance | Wallet copy | Do not "top up" from admin without a ledger event. |
| `CONSENT_REQUIRED` | Checkout consents missing | Consent copy | Legal. Not a retry. |
| `ADDRESS_REQUIRED` | Physical line, no address | Address step | Coupon-only carts should not hit this. |
| `EXPIRED` | Cart / Low Profile window | Start over | Abandoned Low Profile. Cron
`stranded-payments`
is the sweeper. |
| `IDEMPOTENT_REPLAY` | Same
`idempotencyKey` | Often treated as success-equivalent | Do not create a second order. |
| `PAYMENT_PROVIDER_ERROR` | Cardcom HTTP / parse | Generic pay failure | `capturePaymentError` stage
`cardcom_*`.
ntfy if money may have moved. |
| `PAYMENT_DECLINED` | Issuer said no | Declined page
`/checkout/failed`.
Cart survives (test). | Not our outage. |
| `RATE_LIMITED` | Checkout limiter | Retry later | Bot or double-submit. |
| `CHECKOUT_DISABLED` | `CHECKOUT_ENABLED`
not exact
`true` | `התשלום מושבת כרגע, נסו שוב מאוחר יותר` | Kill switch. Launch: must be on for commercial. Incident: leave it off. |
| `INTERNAL` | Anything else | Generic | Same as
`internal_error`. |

Kill switch is a **string compare**, not truthy. `TRUE` / `1` / `yes` do not enable checkout.

---

## 3. Domain classes (thrown, then mapped)

These must not leak English `Error.message` to a browser.

| Class | File | Codes | Cause | User / admin | Operator |
|---|---|---|---|---|---|
| `ApiError` | `src/lib/api/errors.ts` | §1 | Handler boundary | Envelope | Log |
| `RefundError` | `src/server/domain/orders/refund.ts` | `NOT_REFUNDABLE`, `INVALID_AMOUNT` | Redeemed/expired voucher blocks **card** refund; amount not integer agorot / over charge | Admin Hebrew from
`describeRefundBlockers` | Goodwill = wallet credit, **not** this planner. Do not bypass. |
| `SettlementTransitionError` | `src/server/domain/orders/state-machine.ts` | `ILLEGAL_TRANSITION` | Illegal settlement edge | Admin: cannot | Bug if a paid path hits it. Alert. |
| `IllegalTransitionError` | `src/lib/checkout/state-machine.ts` | (machine, from, to) | Order/payment/coupon UI machine | Should be unreachable in UI | Treat as a programmer error |
| `VoucherTransitionError` | `src/server/domain/vouchers/state-machine.ts` | `ILLEGAL_TRANSITION`, `WRONG_SUPPLIER`, `PAST_EXPIRY`, `NOT_YET_EXPIRED` | Event vs `issued`/`redeemed`/… | Scanner public outcomes §4 | Terminal states are absorbing. Post-scan refund is not this machine. |
| `VoucherIssueError` | `src/server/domain/vouchers/issue.ts` | message | Issue insert failed after retries | Buyer: paid, no voucher (worst) | **ntfy money path**. Retry finalize. Do not double-charge. |
| `VoucherCodeCollisionError` | `src/server/domain/vouchers/code.ts` | | Short code unique clash | Retried internally | If it escapes, issue path is exhausted |
| `VoucherQrSecretMissingError` | `src/server/domain/vouchers/qr.ts` | | `VOUCHER_QR_SECRET` unset | QR cannot sign/verify | Launch blocker. Rotation: keep previous. |
| `CardcomAccountError` | `src/lib/payments/accounts.ts` | | Unknown
`cardcom_account_id`, sandbox/prod mix | Pay fails | Token from terminal A charged on B looks like "not found" |
| `UnbalancedJournalError` | `src/lib/ledger.ts` | | Lines do not sum to 0 | Request 500 | **Stop.** Do not "adjust". Conservation is the product. |
| `SupabaseTimeoutError` | `src/lib/supabase/timeout-fetch.ts` | | Fetch abort | Retry / 503 | If clustered: Supabase or the wrap is too tight |
| `UpstashError` | `src/lib/rate-limit/upstash.ts` | | Redis REST error | Limiter fallback | Degraded, not a charge |

`RangeError`
from
`amountToCollect`
: voucher snapshot
`face != coupon_price + due`.
User must not see the English. Operator: row is corrupt; do not scan-succeed it.

---

## 4. Voucher scan outcomes

Pure module:
`src/server/domain/vouchers/redemption.ts`.
HTTP:
`src/app/api/supplier/vouchers/redeem/route.ts`
and lookup.
DB enum
`voucher_scan_outcome`.

| Outcome | HTTP (redeem) | User (till Hebrew) | Notes |
|---|---|---|---|
| `success` | 200 | Collect cash
`remaining_amount_due` | Writes
`vouchers.status=redeemed`,
redemption row. Server event
`voucher_redeemed`
(silent until 169). |
| `already_redeemed` | 409 | `השובר כבר מומש` | Expected duplicate scan |
| `expired` | (mapped) | Expired copy | Sweep
`/api/cron/expire-vouchers`
or on-the-spot past
`expires_at` |
| `cancelled` / `refunded` | (mapped) | Not redeemable | Admin already moved money |
| `wrong_supplier` | **collapsed to
`not_found`** | Same as missing | Honest value stays in audit / internal validate. Anti-enumeration. |
| `not_found` | 404 | Not found | Missing **or** wrong supplier |
| `rate_limited` | 429 | `יותר מדי סריקות, המתן רגע` | Per identity |
| invalid QR / bad signature | 4xx | Not found / invalid | `VOUCHER_QR_SECRET`
wrong = **every** issued QR dies. Keep previous. |

Staff PIN is attribution only. Wrong PIN does not hide the till. Do not treat PIN failure as
`forbidden`
on the voucher.

Mobile offline queue must not invent
`success`
locally (
`docs/cursor/TEST-MAP.md`
G13).

---

## 5. Auth (Hebrew map, not codes)

`src/server/actions/auth.ts`
`ERROR_MAP`
matches **English substrings from Supabase**. Unmapped → generic
`אירעה שגיאה, נסו שוב`
+ log
`auth.error_unmapped`.

| Provider needle | User sees |
|---|---|
| `Invalid login credentials` | `כתובת אימייל או סיסמה שגויים` |
| `Email not confirmed` | `כתובת האימייל טרם אומתה — בדקו את תיבת הדואר` |
| `User already registered` | `כתובת האימייל כבר רשומה במערכת` |
| `Password should be at least 6 characters` | `הסיסמה חייבת להכיל לפחות 6 תווים` |
| `Signup is disabled` | `ההרשמה סגורה כרגע` |
| `Email rate limit exceeded` / `Too many requests` | `יותר מדי ניסיונות — נסו שוב מאוחר יותר` |
| `Auth session missing` | `קישור האיפוס פג או שכבר נעשה בו שימוש — בקשו קישור חדש` |

Phone (
`phoneAuthErrorHebrew`):

| Needle | User sees |
|---|---|
| `Token has expired or is invalid` | `הקוד שגוי או שפג תוקפו` |
| `Invalid phone` | `מספר הטלפון אינו תקין` |
| `over_sms_send_rate_limit` | `יותר מדי בקשות, המתינו דקה ונסו שוב` |
| `sms provider` / unsupported provider | `שליחת SMS אינה זמינה כרגע` |
| else | `אירעה שגיאה, נסו שוב` (never the Twilio account id) |

Landline: refused **before** send (
`isSmsCapableIsraeli`).
Phone auth hidden unless
`PHONE_AUTH_ENABLED`.

Operator: if customers report generic errors, grep
`auth.error_unmapped`.
Supabase reworded a needle.

---

## 6. Postgres / PostgREST codes this codebase treats as control flow

Not exceptions. Expected answers.

| SQLSTATE / PostgREST | Meaning here | User | Operator |
|---|---|---|---|
| `23505` | Unique violation: webhook replay, voucher code retry, invoice number, review twice, subscription charge | Idempotent success or Hebrew "already" | Do not alert. |
| `23514` | CHECK failed (money conservation, statutory fee cap, …) | 500 / admin error | **Even `service_role` loses.** The row is illegal. Fix the writer. |
| `42501` | RLS / privilege | Empty data or forbidden | Policy bug or using user client for a zero-policy table (webhooks tab). |
| `42P01` / `PGRST205` | Undefined table | Pending-schema helpers return "not yet" | Payouts UI:
`42P01`
is **dead code**, not a migration you apply on a whim. |
| `PGRST202` / `42883` | Undefined RPC | Retention cron returns
`ok: true, pending: '157_…'`
on purpose | Do not page. Human apply. A red cron for a known pending file trains people to ignore red crons. |
| `42703` | Undefined column | First payment can die if generation probe is wrong | `order-money-columns.ts`. Production is the **`ils`** generation. Wrong literal in a query. |

---

## 7. Account deletion

`planAccountDeletion`
(
`src/lib/account/delete-account.ts`):

| Reason | User sees |
|---|---|
| `not_signed_in` | `יש להתחבר` |
| `confirmation_mismatch` | `יש להקליד "מחק את החשבון שלי" בדיוק כדי לאשר` |

Action then
`fn_anonymize_user`.
If RPC missing (
`PGRST202`),
TS fallback hashes email. Operator: apply 150 rather than living on the fallback. Kept vs erased lists are in
`docs/cursor/DATA-RETENTION.md`.

---

## 8. What is not an error class (but looks like one)

| Symptom | Actually | Do not |
|---|---|---|
| Admin payouts 500 | Table never existed in historical production | "Fix the RPC" |
| Analytics
`purchase`
= 0 rows | 169 whitelist not applied; ingest skips server names | Assume till is closed |
| Search empty | Meilisearch unset → ILIKE; or query WAF | Return upstream HTML |
| Image full resolution | sharp 0.34 nested copy, AVIF `bad seek` | Blame R2 |
| `CARDCOM_SANDBOX` boot fail | Intentional | Bypass in production |
| Empty `/admin/payments` webhooks | User client + zero policies (`42501` / `[]`) | Not "Cardcom is down" |
| Guest cart empty after a rename | `ke_session_id` vs `session_id=` mismatch | Not a "cache" bug |

---

## 9. Alert vs ignore

**Phone (ntfy) + Sentry money:** charged and not finalized; voucher issue failed after pay; refund provider error after we decided to refund; redeem RPC failed after a valid QR.

**Sentry only:** catalogue 500, 404 storms, validation.

**Log only:** unmapped auth needle, pending RPC, 23505 replay, rate limit of one actor.

**Silence is the bug:**
`finalizeOrder`
catch that credits nothing and logs nothing. See
`docs/cursor/TEST-MAP.md`
G11 (stock consume must not un-pay).
