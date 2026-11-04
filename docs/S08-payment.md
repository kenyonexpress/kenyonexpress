# S08: payment adapter (04.11.2026)

**Scope.** Queue item S08. A payment adapter in `src/server/payments` with a
sandbox mode chosen by env. It covers creating a payment, an idempotent webhook
handler, `payment_events` rows, guarded order state transitions, and a
tokenization hook on first purchase. Missing production credentials mean
sandbox only. They never block this item.

## What was there before

Most of the money path already existed and is not rewritten here:

| Piece | Where | State before S08 |
|---|---|---|
| Provider (Cardcom legacy + mock) | `src/lib/payments/{cardcom,mock-cardcom,index}.ts` | working |
| Webhook journal, deduped on `(provider, external_event_id)` | `src/app/api/payments/cardcom/webhook/route.ts` | inline in the route |
| `payment_events` writer | `src/server/payments/payment-events.ts` | working, 38-value enum pinned to migration 130 |
| Legal line moves | `src/server/domain/orders/state-machine.ts` | throws on an illegal move |
| Token storage | `src/server/payments/finalize.ts` (the only `payment_tokens` writer) | working |

**The gap was the env.** In a production build (`NODE_ENV=production`) with no
`CARDCOM_TERMINAL_NUMBER`, `loadCardcomEnv` fell through to `required()` and
**threw** `Missing required env: CARDCOM_TERMINAL_NUMBER`. Every checkout and
every webhook on that build answered 500. The production credentials do not
exist yet, so this was the state of any deploy.

## What S08 adds

### `src/server/payments/adapter.ts` (new)

| Export | What it does |
|---|---|
| `resolvePaymentMode(env)` | `{ mode: 'live' \| 'sandbox', checkoutAllowed, reason, missing[] }`. **Never throws.** Sandbox means the mock provider, `CARDCOM_USE_MOCK=true`, a test run, Cardcom's shared test terminal `1000`, or `CARDCOM_SANDBOX=true`. Partial credentials report as sandbox with checkout closed and name the missing variable. |
| `createPayment(input, deps)` | Opens the hosted page. It refuses with `CHECKOUT_DISABLED` **before the provider is called** when the mode closes checkout, and turns a provider error into `PROVIDER_FAILED` instead of a throw. |
| `journalWebhookEvent(admin, row)` | Inserts into `payment_webhook_events` and returns `new`, `replay` (unique violation 23505) or `failed`. The route now uses it. `failed` must answer 5xx so Cardcom retries. |
| `guardOrderTransition(from, event)` | The state machine as a result: `{ ok: true, to }` or `{ ok: false, code: 'ILLEGAL_TRANSITION' }`. |
| `planTokenization({ saveCardOptIn, chargingSavedToken, threeDSFallback })` | Whether the hosted page mints a Cardcom token. Yes on a new-card purchase with save-card on (the schema defaults it on, so the first purchase saves the card). No while charging an existing token. Always yes after a 3DS fallback. `beginCheckout` now calls it. |

### `src/lib/payments/env.ts`: no credentials means sandbox

- **No `CARDCOM_TERMINAL_NUMBER` at all:** the mock provider runs, whatever
  `NODE_ENV` is. Nothing throws.
- **A production build where that sandbox was inferred, not requested:**
  checkout is **closed**, with `refusedReason = "no Cardcom credentials on a
  production build: sandbox only, ..."`. No order can be created without a
  charge. This is the same rule as the 10.09 mock-on-production guard, which
  stays as it is.
- **`CARDCOM_USE_MOCK=true` set explicitly** (the local E2E mock build) keeps
  checkout open whenever `CHECKOUT_ENABLED=true`, except on
  `VERCEL_ENV=production`.
- **Partial credentials still throw** in `loadCardcomEnv`. A terminal with no
  password is a configuration mistake, not an absence. `resolvePaymentMode`
  catches it and reports it.
- **`getPaymentProvider` refuses the inferred sandbox**
  (`sandboxInferredInProduction`). The mock approves everything. Without this,
  the stranded-payments cron, subscription renewal, reconcile and the DLQ
  replay would verify and charge against it on a production build and close
  real pending orders with no money taken. Every server-to-server call there
  keeps failing loudly, as it did when the loader threw. Pages and the webhook
  route no longer 500 on load.
- **`src/lib/security/frame-policy.ts`**: the CSP's copy of the mock rule
  follows the new rule, so `frame-src 'self'` opens exactly when the mock serves.

### Wiring

- `route.ts`: the inline insert and the `UNIQUE_VIOLATION` constant are
  replaced with `journalWebhookEvent`. Behaviour is unchanged: replay answers
  200 and writes a `callback_replay` event, any other failure answers 503 and
  raises an alarm. The rest of the flow (secret, GetLpResult re-verify, amount
  match, `finalizeOrder`, `payment_events` rows) is unchanged.
- `checkout.ts`: `saveToken` comes from `planTokenization`. The truth table is
  the same as the old ternary.

## Decisions made alone

1. **"Sandbox only" never opens checkout on the customer-facing deployment.**
   The task says missing production credentials mean sandbox. A sandbox that
   takes orders on the real domain would issue vouchers with no card charged.
   That exact failure was measured on 10.09 and is documented in `env.ts`. So
   the deploy runs in sandbox with checkout refused and the reason exposed.
   The site stays up, and opening checkout only needs the four Cardcom
   variables plus `CHECKOUT_ENABLED=true`.
2. **The adapter wraps the existing modules and does not replace them.**
   `finalize.ts` stays the only writer of `payment_tokens` and the paid
   transition (`saved-cards.test.ts` pins that). Moving those writes would
   reopen a path that is already tested end to end.
3. **No migration.** `payment_events`, `payment_webhook_events` and
   `payment_tokens` are all live.

## Proof

### Tests

New: `src/server/payments/adapter.test.ts` has 21 tests. Mode resolution covers
live, production with nothing set, explicit mock, mock on `VERCEL_ENV=production`,
partial credentials, test terminal, and dev. `createPayment` covers sandbox
open, refusal before the provider is called, and a provider error. The journal
tests write once and then return `replay` on redelivery, treat a new deal on the
same page as a new event, and never report a non-unique failure as a replay.
The guard covers `pending -> paid -> split_executed`, a double confirm, and a
move out of a terminal state. Tokenization has 4 cases. Two more cover `getPaymentProvider`: it refuses on a
production build with no credentials and still hands the mock to an explicit
mock build. `src/lib/payments/env.test.ts` gains 3 tests.

```
$ node node_modules/vitest/vitest.mjs run src/server/payments/adapter.test.ts src/lib/payments src/app/api/payments src/server/actions/payments src/server/payments
 Test Files  30 passed (30)
      Tests  480 passed (480)
```

(Run before the provider refusal and the CSP change. The full run below
includes both.)

```
$ node node_modules/vitest/vitest.mjs run
 Test Files  651 passed (651)
      Tests  7788 passed | 12 skipped (7800)
exit=0
```

The first full run had 4 reds, all in
`src/lib/security/frame-policy-matches-provider.test.ts`. The CSP keeps its own
copy of the "is the mock serving" rule (`usesMockPaymentProvider`, restated
because `next.config.ts` loads it before path aliases exist), and the test holds
it to `loadCardcomEnv` over an 18-cell matrix. The copy was updated to the new
rule. The test's "the loader refuses somewhere" case now asserts the refusal on
partial credentials, because no cell of the matrix refuses any more. The second
run had 1 red: the README states the docs count (289 to 290).

### type-check and lint

```
$ pnpm type-check
$ tsc --noEmit
type-check exit=0

$ biome check src scripts docs migrations supabase
Checked 2054 files in 753ms. No fixes applied.
biome tracked dirs exit=0
tokens-gate, copy-gate, asset-gate, raw-html-gate, postgrest-or-gate,
cache-invalidation-gate, rtl-logical-gate, i18n-gate, locale-format-gate,
input-dir-gate, docs-index-gate, docs-path-audit: exit=0 each
```

A bare `pnpm lint` exits 1. Every diagnostic comes from two untracked
directories this item did not create: `.lighthouseci/` (Lighthouse JSON with
inline screenshots) and `android/`. They are not committed and are not touched
here.

### Design-freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
new since tag: src/components/turnstile/SupplierApplyChallenge.tsx
new since tag: src/components/turnstile/TurnstileRefresh.tsx
```

Both files are S05's and neither existed at the tag. S08 changed no file under
`src/components` and no frozen file.

### Files

```
 src/app/api/payments/cardcom/webhook/route.ts | journal via adapter
 src/lib/payments/env.test.ts                  | +3 tests
 src/lib/payments/env.ts                       | no creds = sandbox, closed in prod
 src/lib/payments/index.ts                     | provider refuses inferred sandbox
 src/lib/security/frame-policy.ts              | CSP mock rule follows env.ts
 src/lib/security/frame-policy-matches-provider.test.ts | refusal = partial creds
 src/server/actions/payments/checkout.ts       | saveToken via planTokenization
 src/server/payments/adapter.ts                | new
 src/server/payments/adapter.test.ts           | new
 docs/S08-payment.md                           | this file
 docs/INDEX.md                                 | index row
 README.md                                     | docs count 289 -> 290
```
