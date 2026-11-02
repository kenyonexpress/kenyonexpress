# C179 - supplier apply (/supplier/apply)

Date: 2026-11-03. Branch `closeout/v1-final`.

## What already shipped
- `/supplier/apply` is a 308 to `/suppliers` (`next.config.ts:258`). `/supplier/*` is the
  login-gated portal; the public join page is `/suppliers`, with the title `הצטרפו כעסקים`.
- Click-wrap: `SupplierLeadForm` shows the clauses of `src/lib/legal/supplier-agreement.ts`
  (version `2026-10-21`) plus a required `agreement` checkbox and a hidden `agreement_hash`.
  The server action refuses any hash that is not `supplierAgreementHash()` of the current text.
- Record: `createSupplierLead` writes `supplier_agreements` (version_hash, version_date,
  ip_address, user_agent, created_at; migration 292, applied) and an `audit_log` row with
  `accepted_at`.
- ₪1 card verification: `startSupplierCardVerification` (Cardcom LowProfile, 100 agorot,
  token saved, the shekel voided), gated by the `card_verify_enabled` flag and by
  `PAYMENTS_PROD_ENABLED` for a live terminal (C101).

## Fixed in C179
With card verification on, the lead and its acceptance are created only after Cardcom
answers, so the acceptance timestamp was the card's completion time, not the click.
The action now stamps `accepted_at` when the form is submitted. It travels in the
verification row's payload, and `createSupplierLead` writes it to
`supplier_agreements.created_at` and to the audit row. Older stored payloads with no
`accepted_at` fall back to now. Files: `src/server/actions/supplier-lead.ts`,
`src/server/supplier/lead-create.ts`, plus 2 new tests in `supplier-agreements.test.ts`.

## Proof (command output)

```
$ node node_modules/vitest/vitest.mjs run src/server/supplier src/app/api/supplier src/lib/legal
 Test Files  12 passed (12)
      Tests  107 passed (107)

$ pnpm type-check
$ tsc --noEmit
tsc=0

$ npx biome check src/server/supplier src/server/actions/supplier-lead.ts
Checked 6 files in 22ms. No fixes applied.
```

Rendered on `next dev -p 3179` (this checkout):

```
supplier/apply 308 -> http://localhost:3179/suppliers
suppliers 200 143931B
הצטרפו כעסקים: 8
name="agreement": 1
name="agreement_hash": 1
1 ש&quot;ח: 1
קארדקום: 2
dir="rtl": 5
name="agreement_hash" value="c98a3266de93858385905c49867126615c451f03d51850c2defc1ff6500dd220"
<title>הצטרפו כעסקים | קניון EXPRESS</title>

server hash c98a3266de93858385905c49867126615c451f03d51850c2defc1ff6500dd220 2026-10-21
```

The hash on the page matches the server's hash of the agreement text.

## Not run
- Production DB read (flag value, `supplier_agreements` row count): `supabase db query
  --linked` answered `Failed to create login role: Connection terminated due to connection
  timeout`. This is the same production outage as C171 to C178.
- compare.mjs: no visual change in this item (server code only), and `/suppliers` is not
  one of the gated routes.
- Live ₪1 Cardcom smoke: needs sandbox credentials and a person typing a test card on the
  hosted page (same as C101).

No forbidden files touched.

RESULT: DONE
