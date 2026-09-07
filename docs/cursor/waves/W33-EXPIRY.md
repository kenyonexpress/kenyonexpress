# W33 Expiry

Code-agent spec. Cron `/api/cron/expire-vouchers` 23:15 UTC. `issued → expired` lock. Must not Cardcom-refund from this cron. Goodwill wallet is a separate documented path if used.

---

## What it builds

1. Keep SQL lock. UI shows expiry on the voucher.
2. Email `voucher_expiring` only if CHECK accepts it (it should after the kinds fix).
3. Consumer law: `offer_valid_until` displayed. Do not silently extend.

---

## Tables

`vouchers`, `notification_outbox`.

---

## RLS

Cron service_role. Customer cannot self-expire to game refunds.

---

## Money invariants

Expiry is not a card refund. Breakage stays platform. Do not credit cashback twice. Wallet goodwill only via admin + `fn_wallet_transfer` idempotent key.

---

## Tests before close

`expire-vouchers/route.test.ts`. Cron does not call Cardcom. Expired scan outcome `expired`. Settled: till must not retry expired.

---

## Feature flag

None.

---

## Docs updated

`SCHEDULER-JOBS.md`, `CUSTOMER-FAQ.md`.

---

## Edge cases

Timezone: display Israel. Cron UTC 23:15 is 01:15/02:15 Israel (DST). Document. Same-day legal windows use Asia/Jerusalem elsewhere.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Expires | בתוקף עד |
| Expired | פג תוקף |
| Mail | הקופון שלך עומד לפוג |

---

## Open questions

| Q | Best answer |
|---|---|
| Auto wallet credit on expiry? | **No** by default. Breakage. Admin goodwill only. |

---

## Second pass (cron not Cardcom)

- `/api/cron/expire-vouchers` is `issued → expired` with a lock. It does not refund the card.
- Money was taken at pay. Expiry is breakage unless admin wallet goodwill.
- Mail `voucher_expiring` only if that kind is in CHECK and consent allows transactional.
- Israel calendar, not UTC midnight, if the column is a date.

