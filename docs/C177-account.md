# C177 ACCOUNT AREA

Date: 2026-11-03 (+07). Branch: closeout/v1-final.

## Spec vs what ships

| Spec item | Before C177 | After C177 |
|---|---|---|
| Orders list | `/account/orders` via `getMyOrders`, `OrderCard`, detail page `/account/orders/[id]` with cancel flow (F05) | unchanged |
| Vouchers | `/account/coupons` (109 lines). `/account/vouchers` and `/account/my-vouchers` redirect there permanently | unchanged |
| Wallet | `/account/wallet` via `getWalletSummary` + `getWalletLedger` | unchanged |
| Settings | `/account/details` (`getAccountProfile`), `/account/security`, `/account/privacy`, `/account/addresses`, `/account/tokens` | unchanged |
| Toggle "everything in app only" | `AllInAppToggle` wrote a consent row (280) and a `notification_preferences` row `kind='all', channel='in_app'`. **Nothing read that row.** `mayNotify` matched only per-kind rows, and the email leg of `/api/cron/notifications` never checked preferences at all. The switch saved and did nothing | the switch now takes effect, details below |

## The fix

- `src/lib/notifications/preferences.ts`: `ALL_IN_APP_KIND`, `isAllInApp(rows)`. In `mayNotify`, for an optional kind with the mode on: `in_app` and `push` are true, `email` and `whatsapp` are false, and the mode outranks per-kind rows. Required kinds (`order_paid`, `voucher_issued`, `voucher_gifted`, `refund_completed`) are still checked first, so a receipt or a voucher still arrives by mail.
- `src/app/api/cron/notifications/route.ts`: preference rows are read once per outbox row (`loadPreferenceRows`) and handed to all three legs. If the email leg is switched off, the row is settled as `status='dead'`, `last_error='suppressed: customer notification preference'`. It is `dead` because 095's status CHECK has no `skipped`, and adding one would need a migration. WhatsApp is not attempted on that row. The response gains a `suppressed` counter. Per-kind email opt-outs, which were also ignored before, are now honoured by the same check.
- `src/lib/whatsapp/outbox.ts`: `sendOutboxWhatsapp` takes the preference rows and checks `mayNotify(kind, 'whatsapp')`.
- `src/server/actions/notification-consent.ts`: writes `ALL_IN_APP_KIND` rather than the literal string.
- `AllInAppToggle` copy now says what the switch does: optional updates go to the app and the browser only, with no email and no WhatsApp, while receipts, vouchers and refunds still come by email.

No migration and no DB write. No forbidden file was touched.

## Gates

pnpm type-check:
```
$ tsc --noEmit
TSC_EXIT=0
```

pnpm lint:
```
Diagnostics not shown: 6.
Checked 7093 files in 2s. No fixes applied.
Found 26 warnings.
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
LINT_EXIT=0
```

Targeted (cron notifications + notifications lib, including the new `route.preferences.test.ts` and the "everything in the app only" block in `preferences.test.ts`):
```
 Test Files  3 passed (3)
      Tests  20 passed (20)
```

Related suites (cron notifications, notifications, whatsapp, push, sms, components/account, app/(account), server/actions):
```
 Test Files  73 passed (73)
      Tests  768 passed (768)
```

pnpm test (full):
```
 Test Files  869 passed | 3 skipped (872)
      Tests  9622 passed | 39 skipped (9661)
TEST_EXIT=0
```

## Build / compare: BLOCKED on prod PostgREST

Health at 2026-11-02T23:31:57Z:
```
[{"name":"db","healthy":true,"status":"ACTIVE_HEALTHY"},{"name":"rest","healthy":false,"status":"UNHEALTHY","info":{"db_schema":"public,graphql_public"},"error":"Service health check failed"}]
```

`supabase db query --linked` (counting `notification_preferences` rows) printed only `Initialising login role...` and then nothing, twice, so the query was skipped. pnpm build was not run: REST is in the same state that failed C173 and C176 on 503 while collecting page data. The account routes are not on the compare list (home, product, /c, /c/<slug>), and this change does not render on any of those pages. Without a build, though, there is no compare output to prove the gate.

RESULT: BLOCKED supabase-rest-down (code shipped, build/compare not runnable)
