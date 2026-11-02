# C176 THANK YOU + ORDER PAGE

Date: 2026-11-03 (+07). Branch: closeout/v1-final.

## Spec vs what ships

| Spec item | Before C176 | After C176 |
|---|---|---|
| QR voucher | thank-you `coupon-qr`, order page `<img>` (already shipped) | unchanged |
| 8-digit code | NOT shown on either page. The 10-char `code` was shown, and `vouchers.redemption_code` (migration 325, applied) was never read | thank-you `coupon-redemption-code` + order page show `formatRedemptionCode` (XXXX-XXXX). The order page also groups the 10-char code via `formatVoucherCode` |
| Invoice download (Cardcom document module) | `/account/orders/[id]/invoice` route: session + `user_id` check, then redirect to `getOrderInvoice` documentUrl (`src/server/payments/invoices.ts`, Cardcom document). Linked from both pages | unchanged |
| Order details | order page: summary, lines, shipping, supplier, vouchers; thank-you: order no. + total | unchanged |
| wa.me to supplier | order page: yes (`waChatLink(line.supplier.phone)`). Thank-you: store number only | thank-you: per-coupon `coupon-supplier-whatsapp` link, `whatsapp ?? contact_phone` via `suppliers!vouchers_supplier_id_fkey` (hinted embed, added to `vouchers-supplier-embed.test.ts`) |

## Production schema proof (supabase db query --linked)

```
      "fk": "vouchers_supplier_id_fkey",
      "supplier_cols": "contact_phone,name,whatsapp",
      "voucher_col": "redemption_code"
```

vouchers with an 8-digit code:
```
      "total": 695,
      "with_code": 488
```

## Gates

pnpm type-check: `tsc --noEmit` exit 0, no output.

pnpm lint:
```

The number of diagnostics exceeds the number allowed by Biome.
Diagnostics not shown: 6.
Checked 7092 files in 2s. No fixes applied.
Found 26 warnings.
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
LINT_EXIT=0
```

vitest (src/server/queries src/lib/orders checkout account voucher-code):
```
 Test Files  22 passed (22)
      Tests  166 passed (166)
```

## Build / compare: BLOCKED on prod PostgREST

Health at 2026-11-02T23:22Z:
```
[{"name":"db","healthy":true,"status":"ACTIVE_HEALTHY"},{"name":"rest","healthy":false,"status":"UNHEALTHY","info":{"db_schema":"public,graphql_public"},"error":"Service health check failed"}]
```

pnpm build (one attempt, C173 already failed twice the same way):
```
{"ts":"2026-11-02T23:24:23.964Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"products","status":503,"duration_ms":5561}
{"ts":"2026-11-02T23:24:25.009Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"suppliers","status":503,"duration_ms":6609}
{"ts":"2026-11-02T23:24:25.011Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"coupon_deals","status":503,"duration_ms":7136}
{"ts":"2026-11-02T23:24:26.142Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"categories","status":503,"duration_ms":7768}
{"ts":"2026-11-02T23:24:27.968Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"products","status":503,"duration_ms":3993}
{"ts":"2026-11-02T23:24:31.408Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"categories","status":503,"duration_ms":5255}
{"ts":"2026-11-02T23:24:31.541Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"suppliers","status":503,"duration_ms":6520}
{"ts":"2026-11-02T23:24:32.564Z","level":"error","event":"db.query_failed","request_id":null,"method":"GET","target":"products","status":503,"duration_ms":4561}
> Build error occurred
Error: Failed to collect page data for /product/[slug]
BUILD_EXIT=1
```

No build, so no render of /checkout/return and no compare run. This change does not touch home, product or /c, the gated pages.

RESULT: BLOCKED supabase-rest-down (code shipped, build/compare not runnable)
