# Gap audit, phase5 domains

Written 2026-09-02. Every verdict below was checked by reading the code or by
querying production, never by trusting an earlier document. Where a previous
document and the code disagreed, the code won and the disagreement is recorded.

**What this audit is.** For each domain: does the implementation exist, is it
wired to something that calls it, and does production agree. It is not a
line-by-line correctness review of each domain, and it does not claim to be.
Where a domain is marked EXISTS, that means the code path is present and
reachable, not that every rule inside it has been re-derived.

**Production, measured:** 80 products (45 active), 12 categories, 12 suppliers,
0 vouchers, 13 wallet accounts, 0 homepage_sections, 4 orders, 3 order lines,
2 payments, 0 payment_events.

| # | Domain | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Checkout, Cardcom LowProfile | EXISTS | `src/server/actions/payments/checkout.ts`, `src/lib/payments/cardcom.ts` `createLowProfile` |
| 1b | Webhook idempotency | EXISTS | `src/app/api/payments/cardcom/webhook/route.ts:85` dedups on `23505` against a unique `(provider, external_event_id)` |
| 1c | QStash on the payment webhook | **NOT THIS** | QStash is the SEARCH indexer transport (`src/app/api/search/index-job/route.ts`, `index-dlq`). The Cardcom webhook does not use it and does not need it; its idempotency is the unique index above. The domain name in the brief is wrong, not the code. |
| 2 | Order state machine | EXISTS, and now enforced in the DB | `src/server/domain/orders/state-machine.ts`, `status-transitions.json`, and migration 137's three triggers, live and verified 144/144 in `tests/sql/status_transition_guards.sql` |
| 3 | Dynamic split from snapshotted `platform_percent` | EXISTS | `src/lib/checkout/split.ts`; `checkout.ts:367` selects `platform_percent` per product and `:440`/`:629` pass it into the split, so the rate is snapshotted per line |
| 4 | Refund engine, 14 days | PARTIAL | The table is right and IS in production (`refunds`, with `requested_agorot`, `granted_agorot`, `cancellation_fee_agorot`); migration 131 forces `refund_due_by = requested_at + 14 days` by trigger. `src/server/actions/payments/refund.ts` writes the fee and moves the line to `refunded`. **Gap: the wallet-versus-original-method choice is not a modelled destination.** |
| 5 | Voucher QR + atomic redemption | EXISTS, and proven | `redeem_voucher` decides the race with one conditional UPDATE predicated on `status='issued'`; `scripts/_voucher-race.mjs` drives two concurrent transactions to prove exactly one collects |
| 6 | Supplier page | EXISTS | `src/app/(supplier)/` with `scan` and `supplier` routes; `src/lib/supplier/rbac.ts` |
| 7 | Content uploader CRUD + R2 | EXISTS | `src/server/actions/admin/upload.ts`, `images.ts`, `src/lib/storage/r2.ts` (presigned PUT, SigV4 via Web Crypto), falls back to Supabase Storage when unconfigured |
| 8 | Admin panel | EXISTS | 38 `page.tsx` routes under `src/app/(admin)`, 17 server-action modules |
| 9 | Wallet | EXISTS | `src/app/(account)/account/wallet`, `src/lib/wallet/` (Apple `pkpass` + Google Wallet), `fn_wallet_transfer`, and `wallet_accounts_user_balance_floor` live (146) |
| 10 | Referrals | EXISTS | `src/server/referrals/claim.ts`, `program.test.ts`, `wired.test.ts`, wired from `finalize.ts` |
| 11 | Sentry, env-gated | EXISTS | `src/lib/observability/sentry.ts:51,104` — every capture returns immediately without `SENTRY_DSN`; entirely inert unset |
| 12 | Playwright E2E | EXISTS | 15 specs in `e2e/`, including `full-purchase-redeem`, `coupon-scan`, `checkout`, `a11y`, `rtl-mobile` |
| 13 | Perf / SEO | PARTIAL | `src/app/robots.ts` and `sitemap.ts` exist; only **5** files define `generateMetadata`, so most routes carry no per-page metadata |
| 14 | CI | EXISTS | `.github/workflows/`: `ci.yml`, `production-smoke.yml`, `cron.yml`, `load.yml`, `commit-monitor.yml`, `dependabot-auto-merge.yml` |

## The gaps worth acting on

**4. Refund destination is not modelled.** The engine computes and records a
cancellation fee and moves the line to `refunded`, and the statutory 14-day
clock is enforced in the database. What is missing is the choice the brief
names: wallet credit versus the original payment method is not a column, not an
enum, and not a branch. Today a refund is one shape.

**13. Metadata coverage is 5 files.** `robots.ts` and `sitemap.ts` are right,
but product, category and search pages mostly inherit the root metadata, so
titles and descriptions are not per-page.

**Content, not code: 0 `homepage_sections` rows and 0 vouchers in production.**
The homepage CMS table is live and empty, so the homepage serves its authored
fallback constants. That is a content task, not a gap in the code.

## Two premises in the brief that do not hold

**QStash is not the payment webhook's idempotency mechanism** and never was. It
is the transport for the search indexer. The webhook's idempotency is a unique
index on `(provider, external_event_id)` with `23505` handled as a replay.

**PR #6 is already merged and is not a draft.** It is
`docs: מדריך הזנת דיל חדש (CONTENT-OPERATIONS-GUIDE)` on `phase5/homepage`,
merged. There is no draft PR to promote, so "take PR #6 from draft to ready"
cannot be done as written.

## Already closed earlier in this session

- `escrow_held` has no live writer anywhere; the 137 guard is correct as applied.
- All 144 transitions in the three guards verified against the deployed triggers.
- The `compare.mjs` hang (stage 2 of the brief) is already fixed: an
  unsettleable `img.decode()` on lazy images inside a `display:none` column,
  with `page.evaluate` carrying no timeout. See `9aa1bc61b`.
- Cardcom now has a 15s deadline and a retry policy that refuses to retry
  anything that charges or moves money.
- Every Supabase call has a 10s deadline, applied at all seven client factories.
