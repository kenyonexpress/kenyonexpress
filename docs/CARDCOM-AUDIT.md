# Cardcom Integration Audit

Read-only audit, 2026-09-08. Sources: `docs/CARDCOM-ARCHITECTURE.md` (the
2026-07-23 design document the brief calls `claude_CARDCOM-ARCHITECTURE.md`;
no file of that exact name exists in the repo), `docs/adr/0007-cardcom-lowprofile.md`,
`docs/PAYMENT-FLOW.md`, `docs/BUSINESS-RULES.md`, and the code:
`src/lib/payments/cardcom.ts`, `src/lib/payments/accounts.ts`,
`src/lib/payments/env.ts`, `src/lib/contracts/webhooks.ts`,
`src/app/api/payments/cardcom/webhook/route.ts`, `src/server/payments/finalize.ts`,
`src/server/payments/settlement-events.ts`, `src/app/api/cron/reconcile/route.ts`,
`src/app/api/cron/stranded-payments/route.ts`, `scripts/cron-jobs.json`,
`.github/workflows/cron.yml`. Live data from `payments`, `payment_events`,
`escrow_holds`, `order_items`, `cron.job`.

---

## 1. Verdict against the five checks in the brief

| Check | Brief expected | What runs | Result |
|---|---|---|---|
| LowProfile endpoints called correctly | v11 JSON `/LowProfile/Create` + `/LowProfile/GetLpResult` | **Legacy form API** `/Interface/LowProfile.aspx` + `/Interface/GetLpResult.aspx` (decision 23.07, ADR 0007). Field names match the legacy convention (`LowProfileCode`, `IndicatorUrl`, `ReturnValue`, `Operation`, `CoinId`, `Codepage 65001`). | **PASS for the two Low Profile calls.** The design doc is banner-marked HISTORICAL and lists the four ways the build differs. **Three legacy endpoints are unverified against a live terminal** (see §4). |
| Webhook receives LpId + ReturnValue only, no signature | body carries only ids; no HMAC | Body is parsed by `cardcomWebhookPayloadSchema` (`terminalnumber`, `lowprofilecode`, `ResponseCode`, `InternalDealNumber`, `ReturnValue`, card fields, passthrough). **Nothing about money or tokens is taken from it.** The payment row is located by `lowprofilecode` (`payments.cardcom_low_profile_id`), not by `ReturnValue`. There is no HMAC; authenticity is the `?s=` URL secret compared in constant time against current + previous secret with no short circuit. | **PASS.** One deviation from "only": `ResponseCode` from the body is used to mark a payment `failed` without a GetLpResult call (§4, risk R3). |
| Signature verification via GetLpResult | server-to-server re-fetch before trust | `provider.verifyLowProfile(lowprofilecode)` on the terminal recorded on the payment (`cardcom_account_id`), amount parsed as terminal digits into agorot (`parseTerminalAmountAgorot`, no float), compared to the stored amount; mismatch = alarm + no finalize; `verify_*` and `amount_*` rows written to `payment_events`. | **PASS.** |
| Ledger split: physical immediate, coupon escrow | coupon supplier share held until redemption | **Physical:** `split_executions` row at finalize (`face = commission + supplier`, CHECK-enforced), line -> `split_executed`, `settlement_events.charge_settled` with percent snapshots. **Coupon: there is no escrow.** The whole on-site payment is platform revenue at charge (`commission = paid_on_site`, `supplier_immediate = 0`), the balance is cash at the counter, redemption moves no money (`redeem_voucher` never touches `order_items`). Enforced in TypeScript type, state machine and the live DB guard (no inbound edge to `escrow_held`). | **PASS against the locked model, FAIL against the brief's wording.** The brief still describes the pre-2026-07-24 escrow model that migration 085/125 abolished. `docs/BUSINESS-MODEL.md` §1a: "אין Escrow, אין העברת כסף לספק". The brief is what needs updating. |
| Daily reconciliation cron pattern documented | daily diff vs terminal | `/api/cron/reconcile` daily 04:00 UTC: `ListTransactions.aspx` per terminal, 48-hour window, `reconcileAgainstTerminal`, `reconciliation_gap` alert deduped per day. Plus `/api/cron/stranded-payments` every 10 min (GetLpResult on `redirected` payments 3 min..24 h old, idempotent finalize) and the webhook DLQ replay. Documented in `scripts/cron-jobs.json`, RUNBOOK, PAYMENT-FLOW. | **PASS as documented, NOT RUNNING:** no scheduler calls these routes today. `cron.job` has only `report_tables_nightly`; `vercel.json` has no `crons`; 162 is unapplied and broken on vault names; `.github/workflows/cron.yml` exists but is gated on a repo variable and targets a Vercel deployment that does not exist (STATE blocker 0). |

---

## 2. Integration points

| # | Point | File | Direction | Retry | Verified against live terminal |
|---|---|---|---|---|---|
| 1 | Create hosted page | `cardcom.ts createLowProfile` -> `/Interface/LowProfile.aspx` | out | transport-only retry (a duplicate page charges nothing) | not from this machine (no `CARDCOM_*` here); field set follows the documented legacy convention |
| 2 | Callback | `POST /api/payments/cardcom/webhook?s=<secret>` | in | Cardcom retries on non-2xx; route answers 503 when the journal insert fails or the payment read fails, 200 for replay / unknown / verified-but-contradicted | n/a |
| 3 | Re-verify | `verifyLowProfile` -> `/Interface/GetLpResult.aspx` (`LowProfileCode`) | out | transport-only retry (read-only) | the field names `Amount`, `InternalDealNumber`, `Token`, `Last4CardDigits`, `CardBrand`, `CardValidityMonth/Year` are the legacy ones; the two existing `succeeded` payments in production carry a `cardcom_low_profile_id`, so the round trip has worked at least on the test terminal |
| 4 | Saved-card charge | `chargeWithToken` -> `/Interface/ChargeToken.aspx` | out | **never** | not verified |
| 5 | Refund / same-day void | `refundByTransactionId` -> `/Interface/RefundDeal.aspx` (`InternalDealNumber`, `CancelOnly`) | out | **never** | **not verified; `TODO(cardcom)` in the code** |
| 6 | Tax document / credit note / coupon receipt | `createDocument` -> `/Interface/BillGoldPost.aspx` (`InvoiceHead.*`, `InvoiceLines{n}.*`, `InvoiceType` 3 / 4 via env) | out | **never** | **not verified; `TODO(cardcom)` in the code**; a wrong guess fails visibly (queue row stays unissued), never a wrong document |
| 7 | Terminal report | `listTransactions` -> `/Interface/ListTransactions.aspx` (`Transaction{n}.InternalDealNumber/Sum/DealType/Date`) | out | transport-only retry | **not verified**; an unrecognised shape yields an empty list, which the reconciler treats as low-severity `missing_remotely`, so it cannot false-alarm |
| 8 | Finalize | `finalizeOrder` (single writer of `orders.status = paid`) | internal | idempotent on `paid_at`, voucher count cap, `split_executions` UNIQUE, wallet transfer keys | n/a |
| 9 | Money journal | `settlement_events` upsert on `idempotency_key`, never throws | internal | n/a | 0 rows live (no real purchase yet) |
| 10 | Forensics | `payment_events` append-only (trigger), 38 event types | internal | n/a | 0 rows live |

**Multi-terminal:** `accounts.ts` builds a registry (`platform` from `CARDCOM_TERMINAL_NUMBER`, extras from `CARDCOM_ACCOUNTS` JSON with `supplierIds`), all-or-nothing routing per order, `cardcom_account_id` stored on `payments` and `payment_tokens` so verify and token charges go back to the minting terminal. Terminal `1000` is forced sandbox regardless of flag.

---

## 3. Sandbox vs production keys: where they live

| Variable | Read by | Meaning |
|---|---|---|
| `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` | `accounts.ts`, `env.ts` | the platform terminal (merchant of record). `ApiPassword` is sent only on `RefundDeal.aspx`. |
| `CARDCOM_WEBHOOK_SECRET` (+ `_PREVIOUS`) | `env.ts acceptedWebhookSecrets`, checkout builds `IndicatorUrl = ${appUrl}/api/payments/cardcom/webhook?s=<secret>` | the only callback authenticator; two-secret rotation window |
| `CARDCOM_SANDBOX` | `accounts.ts isSandbox`, `deploy-preflight.mjs`, `env.ts` | marks the platform terminal as test. **Refused at boot in `NODE_ENV=production`** unless `CARDCOM_ALLOW_SANDBOX=true`; `deploy-preflight.mjs` refuses the deploy outright. Terminal `1000` is sandbox whatever the flag says. |
| `CARDCOM_USE_MOCK` | `env.ts` | `mock-cardcom.ts`, no network; for tests and local dev only |
| `CARDCOM_ACCOUNTS` | `accounts.ts` | JSON array of supplier terminals; may not redefine `platform`; duplicate ids refused |
| `CARDCOM_API_BASE_URL` | `cardcom.ts baseUrl()` | sandbox host override; blank is treated as absent (a `/Interface/...` relative URL would otherwise throw) |
| `CARDCOM_CREDIT_NOTE_TYPE` / `CARDCOM_COUPON_RECEIPT_TYPE` | `cardcom.ts createDocument` | document type codes, defaults 3 / 4, adjustable without a deploy |

**Physical location today:** none of these exist in this audit environment, in the repo, or in the Vercel project, because the Vercel project does not exist (STATE.md blocker 0). `docs/VERCEL-SETUP.md` lists them for the dashboard. `deploy-preflight.mjs` requires all four core `CARDCOM_*` plus `CRON_SECRET` and refuses `CARDCOM_SANDBOX=true`. The 2 live `payments` rows have `cardcom_account_id = NULL` (pre-registry; `registry.get(null)` resolves them to `platform`).

---

## 4. Risk assessment

| Id | Risk | Severity | Evidence | Mitigation in place / needed |
|---|---|---|---|---|
| R1 | **Three money-adjacent legacy endpoints never exercised against a live terminal**: `RefundDeal.aspx`, `BillGoldPost.aspx`, `ListTransactions.aspx` field names are a best reading of the legacy convention | HIGH before first real refund / invoice | `TODO(cardcom)` comments in `cardcom.ts`; no `CARDCOM_*` in any environment reachable by the agents | Failure modes are loud, not silent (refund returns `success:false`, invoice queue stays unissued, reconciliation reports "missing remotely" at low severity). Needs one sandbox session with real credentials before go-live; not a code change. |
| R2 | **No scheduler is running the payment safety nets** (`stranded-payments` 10 min, `reconcile` daily, `invoices`, `notifications`) | HIGH at launch | `cron.job` = 1 job (reporting); `vercel.json` no crons; 162 unapplied and wrong vault names; GH workflow gated | Chain: Vercel project -> deploy -> `CRON_SECRET` -> rename vault rows or fix 162 -> apply 162 (or enable the GH workflow variable). Until then a lost callback is found only when a human looks. |
| R3 | Failure branch trusts the callback body: `ResponseCode <> 0` marks the payment `failed` (from `initiated`/`redirected`) **without** calling GetLpResult | MEDIUM-LOW | `route.ts` step 2 failure branch | Requires the URL secret, so only a leaked secret or Cardcom itself can send it. Consequence of a wrong `failed`: the later real success webhook finalizes the order (`finalizeOrder` updates `payments` only from `initiated`/`redirected`, so the payment row stays `failed` while the order is `paid`, and the guard `fn_payments_status_guard` has no `failed -> succeeded` edge). Recommendation: re-verify before marking failed, or leave the row `redirected` for the stranded-payments job. |
| R4 | Coupon supplier payout does not exist and the brief still assumes escrow | MEDIUM (process) | BUSINESS-RULES §3, guard has no inbound escrow edge, 2 legacy `escrow_holds` rows from 2026-07-21 still `held` with their `order_items` in `escrow_held` | The model is locked and enforced in three layers. The two legacy rows should be moved out (`escrow_held -> refunded` or `-> redeemed`) or the fixture orders deleted, so reports stop showing a held balance for a model that no longer exists. Update the brief. |
| R5 | `IndicatorUrl` is built from `NEXT_PUBLIC_APP_URL`; DNS is not live and the docs point at the domain | MEDIUM at launch | `checkout.ts:938`, VERCEL-SETUP table, 162 header ("app_url is the *.vercel.app alias, NOT the domain") | Until DNS resolves, `NEXT_PUBLIC_APP_URL` must be the `*.vercel.app` alias or every callback goes nowhere. Same for the vault `APP_BASE_URL`. |
| R6 | Callback secret rotation depends on `_PREVIOUS` being set on both sides | LOW | two-secret window implemented, alarm on `callback_rejected` when a parsed Cardcom body carries no accepted secret | Procedure exists in `.env.example`; the alarm makes a one-sided rotation loud. |
| R7 | 3DS is "terminal's own setting" unless `threeDSecureLowProfileFields()` is configured | LOW-MEDIUM (liability shift) | `cardcom.ts createLowProfile` | Confirm the production terminal has 3DS enabled at Cardcom; the code cannot verify it. |
| R8 | `payment_events` and `settlement_events` have never carried a real row | INFO | 0 rows each; 2 payments are E2E fixtures from 2026-07-21 | First real purchase is the first end-to-end proof; keep the stranded-payments job and the DLQ in place from minute one. |

---

## 5. What the design document got right and wrong, for whoever reads it next

Right and still true: no HMAC on callbacks; GetLpResult as the only truth; J5 holds for a week so it cannot be an escrow; tokens and Low Profile ids are terminal-scoped; `ApiPassword` only on money-back calls; statutory cancellation fee `min(5%, ₪100)`; VAT 18%.

Wrong or superseded: v11 JSON endpoints (legacy `.aspx` in use); `payment_intents` / `ledger_entries` tables (live: `payments`, `payment_events`, `settlement_events`, `split_executions`); decimal-string amounts (integer agorot everywhere); `commissionPct ?? 5` (no default exists, `platform_percent` is mandatory per product); coupon escrow with a supplier `held` share (no escrow; 100% platform revenue at charge, cash balance at the counter); Cloudflare Worker webhook (a Next.js route with a URL secret).
