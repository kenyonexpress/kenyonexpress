# Cardcom activation — the owner's checklist

**For Ofir, when the real Cardcom credentials arrive (~27.09.2026). Five
minutes of Vercel dashboard work, then two verification steps. No agent
touches these values — `CLAUDE.md` and every session's own rules treat
env var changes on a live payment path as a stop-and-ask action, and this
doc exists so the answer to "what do I actually do" does not depend on
one being available to ask.**

The code is already complete and behind env checks: `pnpm build` is green
today with none of these variables set, because `CARDCOM_USE_MOCK` falls
back to the mock provider whenever `CARDCOM_TERMINAL_NUMBER` is absent
outside production (`src/lib/payments/env.ts`). Nothing below is a code
change.

## 1. The three variables

In the Vercel dashboard, on the **production** deployment's environment
variables (not Preview, not Development):

| Variable | What it is |
|---|---|
| `CARDCOM_TERMINAL_NUMBER` | The terminal number Cardcom issues with the account. |
| `CARDCOM_API_NAME` | The API username for that terminal. |
| `CARDCOM_API_PASSWORD` | The API password for that terminal. |

`CARDCOM_WEBHOOK_SECRET` should already be set from earlier work (it is
required in production independent of these three, and boot fails
without it). If it is not, generate one (`openssl rand -hex 32`) and set
it too — it is the value baked into every `IndicatorUrl` Cardcom calls
back to, not something Cardcom gives you.

## 2. The one variable that must NOT be true

**Check `CARDCOM_USE_MOCK` on the production environment. It must be
unset, or explicitly `false`.**

This is the step this checklist exists to force. On 2026-09-10,
production ran with `CARDCOM_USE_MOCK="true"` and `CHECKOUT_ENABLED="true"`
set together, with none of the three real credentials present anywhere.
The result was not "checkout is broken": a real shopper on the real
domain could complete checkout, have their voucher issued, and have
**no card charged at all**, silently, in the direction that gives goods
away. A boot guard now refuses to start production with that exact
combination (`src/lib/env.ts`'s `superRefine`, checked by
`src/lib/payments/env.ts`'s `mockOnCustomerFacingDeploy`), so if this
variable is left on by mistake, the site will not come up rather than
take payments through the mock — but the fix is still to remove it, not
to rely on the guard.

If `CHECKOUT_ENABLED` is not already `true` in production, set it too:
without it checkout is refused in production by design (`checkoutEnabled`
in `src/lib/payments/env.ts` defaults closed there, and open everywhere
else).

## 3. Redeploy

Any env var change on Vercel requires a new deployment to take effect —
saving the variable alone does not restart the running instance. Trigger
a redeploy of production after step 1 and 2 (redeploying the current
commit is enough; no code change is needed).

## 4. Verify: `/api/health`

`GET /api/health` on production (see `src/lib/health/checks.ts`) reports
a `cardcom` dependency. Before this step it will say `אין מפתחות
Cardcom; אין סליקה ואין הנפקת חשבוניות` ("no Cardcom keys; no charging
and no invoicing"). After the redeploy it should report the terminal as
configured. This is a read-only check — it does not charge anything.

## 5. Verify: the money-path E2E specs, against a MOCK build

**Do not run these against the credentials from step 1 with real
customer accounts against production in a way that charges a real
card unintentionally** — run them the same way every prior session has,
against a local mock build, to prove the code paths are healthy before
trusting them with the real terminal:

```bash
CARDCOM_USE_MOCK=true pnpm build
CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://127.0.0.1:3431 PORT=3431 pnpm start &
E2E_BASE_URL=http://127.0.0.1:3431 \
E2E_FORWARDED_FOR=10.77.0.9 \
E2E_ADMIN_EMAIL=e2e-admin@kenyonexpress.co.il \
pnpm exec playwright test \
  e2e/full-purchase-redeem.spec.ts \
  e2e/physical-purchase.spec.ts \
  e2e/admin-refund.spec.ts \
  --project=chromium --workers=1
```

`CARDCOM_USE_MOCK` must be set at **build** time, not only at start
time: the frame policy that allows the mock payment iframe is inlined
into the edge middleware bundle at `next build`, so a build made without
it silently blocks the iframe and every money spec times out even though
nothing is actually broken. `NEXT_PUBLIC_APP_URL` must match the exact
host and port the server is started on, for the same reason (the mock
provider builds its return-frame URL from it). All three specs write
real rows against whatever database the build points at — they are not
sandboxed — so this step should run against the same non-production
database prior verification runs have used, never against the real
Cardcom terminal.

Expect all three green. If they are not, that is a real regression to
fix before trusting the terminal switch, not something to skip past.

## 6. Verify the first real payment

Once 1–5 are done, place one small real purchase yourself (a low-value
voucher) with a real card, end to end, and confirm:

- The order reaches `paid` (not `pending`) in the admin orders view.
- `/api/health`'s Cardcom check and the Cardcom merchant dashboard both
  show the transaction.
- The voucher issues and the confirmation email/WhatsApp arrives.
- The card was actually charged the amount shown (check your bank/card
  statement, not just the app — the whole point of this checklist is
  that "the app says it worked" was insufficient once already).

If anything in step 6 looks wrong, set `CARDCOM_USE_MOCK` is still
**not** the fix — that would re-open the exact hole this document exists
to close. Set `CHECKOUT_ENABLED=false` instead to take checkout offline
while it's investigated, redeploy, and treat it as an incident.
