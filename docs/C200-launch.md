# C200 LAUNCH v2.1.0 (2026-11-04)

RESULT: BLOCKED payment-safety

The safety gate failed at step (a), so nothing was deployed, no tag was
created and no LAUNCH.flag was written. `docs/LAUNCH-CHECKLIST.md` was left
unchanged, because it must not say RELEASED.

## (a) Production env: FAIL

```
$ T=$(mktemp /tmp/ke-prodenv.XXXXXX); vercel env pull "$T" --environment=production --yes --project kenyonexpress
! 36 Secret values cannot be pulled from the `production` Environment. Wrote "[SENSITIVE]" as placeholders
$ grep -E '^(CARDCOM_USE_MOCK|CARDCOM_SANDBOX|CHECKOUT_ENABLED|VERCEL_ENV)=' "$T"
CARDCOM_SANDBOX="[SENSITIVE]"
CARDCOM_USE_MOCK="true"
CHECKOUT_ENABLED="[SENSITIVE]"
VERCEL_ENV="production"
$ rm -f "$T"; ls "$T"
ls: /tmp/ke-prodenv.3ZEpkf: No such file or directory

$ vercel env ls production | grep -E 'CARDCOM_USE_MOCK|CARDCOM_SANDBOX|CHECKOUT_ENABLED'
 CARDCOM_SANDBOX      Hidden    Secret    Production   30d ago
 CHECKOUT_ENABLED     Hidden    Secret    Production   41d ago
 CARDCOM_USE_MOCK     eyJ2Ij…   Config    Production   64d ago
```

`CARDCOM_USE_MOCK` is `true` in production. `CARDCOM_SANDBOX` is a Secret, so
the CLI cannot read it, and "is NOT true" cannot be proven either.

## (b) Feature flag: PASS

```
$ supabase db query --linked "select * from public.feature_flags where key ilike '%payment%' or key ilike '%checkout%';"
{ "bool_value": false, "json_value": null, "key": "payment_production", "updated_at": "2026-11-01 22:36:51.522741+00" }
```

## (c) and (d): not run, and the code says they cannot pass with (a) as it is

`src/server/actions/payments/checkout.ts:1310`:

```
if (!loadCardcomEnv().useMock && !(await getSupabaseFlags()).payment_production) {
  return { error: 'התשלום באתר טרם נפתח. ההזמנה לא נשלחה ולא בוצע חיוב.', code: 'payment_disabled' }
}
```

When `useMock` is true, the `payment_production=false` flag is skipped. The
`payment_disabled` message never fires in production as configured, and the
request goes on to the mock provider (`src/lib/payments/index.ts:40`). The
September guard described in memory (mock + `VERCEL_ENV=production` forces
`checkoutEnabled=false`) is no longer in `src/lib/payments/env.ts`. Lines 61-92
return `checkoutEnabled` from `CHECKOUT_ENABLED` alone, and that value is hidden.

Orders in the production DB over the last 3 days:

```
paid 725 (latest 2026-11-03 18:57 UTC) | pending 17 | cancelled 1
```

Some or all of these may come from E2E mock builds that write to the
production DB. They cannot be told apart from shopper orders here. I did not
run a Playwright checkout against www: with the mock active, it could create
exactly the unpaid "paid" row that gate (c) is meant to rule out.

## Why I did not fix it in place

The obvious fix is to flip `CARDCOM_USE_MOCK` to false in production. The
production env also holds real `CARDCOM_TERMINAL_NUMBER` / `CARDCOM_API_*`
values, so that flip would make the real Cardcom provider live. After it,
`payment_production=false` would be the only thing between a shopper and a
real charge. That is a production payment-config change that the gate
instructions route to BLOCKED. It is not a code defect to fix and re-measure.

## Needed to unblock (code, then re-run C200)

1. Make the `payment_disabled` check in `runSubmitCheckout` apply when
   `VERCEL_ENV === 'production'` whatever `useMock` says (or restore the
   env.ts mock+production guard), with a test.
2. Set production `CARDCOM_USE_MOCK` to false, or remove it, only after (1)
   is deployed. Read `CARDCOM_SANDBOX` from the dashboard.
3. Re-run C200 gates (a) to (d).
