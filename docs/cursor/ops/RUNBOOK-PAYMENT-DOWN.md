# Runbook: payment provider down

Likelihood: medium (Cardcom Interface timeouts).

## First ten minutes

1. Confirm `CHECKOUT_ENABLED`. If already false, till is closed on purpose.
2. Sentry / logs: `finalize.cashback_*` vs webhook 401 vs GetLpResult timeout.
3. Do **not** trust webhook POST body. Do not replay captured JSON as money.
4. Turn `CHECKOUT_ENABLED` off if new charges would strand. Env + wait for new instances.
5. ntfy: stranded-payments cron should already page charged-not-finalized.

## Recovery

- Cron `/api/cron/stranded-payments` retries finalize from GetLpResult.
- When Cardcom is back: leave checkout off until one staging Low Profile succeeds.
- Never set `CARDCOM_USE_MOCK` in production.

## Do not

Refund from a spreadsheet. Double-finalize. Enable sandbox.

---

## Second pass (boundary)

- Webhook body is not money. GetLpResult only (`PAYMENT-BOUNDARY.md`).
- `CHECKOUT_ENABLED` off if new charges would strand. Wait for new instances.
- Cashback and voucher issue happen in finalize, not in the POST body.
- ntfy: charged-not-finalized. Topic unguessable. No amounts.

