# Test map (quality)

Companion to `docs/cursor/TEST-MAP.md` (pack file, G1–G25). This file is the **close list** for W47.

Deleting a money test listed in the pack TEST-MAP allows float, skip finalize, or double voucher. Do not delete e2e `full-purchase-redeem`, `physical-purchase`, `admin-refund`.

## Gaps still open (must exist before wave close)

G15 duplicate pending prefixes. G16 `percentageOf` ≡ `applyBp`. G17/G21 two cookie names. G18 webhooks `createAdminClient`. G20 production analytics whitelist. G23 ntfy without DSN. G26 percent parsers >2 decimals. Support 403 refund. `error` vs enum. `is_coupon_enabled` vs checkout `item.type`.

Offline pin: `rls-manifest.test.ts` does not prove production drift.

Full inventory with "if deleted" column: `docs/cursor/TEST-MAP.md` (pack file). Critical subset:

| File | Protects | If deleted |
|---|---|---|
| `src/lib/money.test.ts` | Agorot/Bp, half-up | 1 agora split drift |
| `src/__tests__/money-no-float.test.ts` | No parseFloat on money path | Next `round2(price * factor)` |
| `src/lib/commerce/commission.test.ts` | Coupon 100/0, physical fee then subtract | Global 10% on coupons |
| `src/lib/commerce/coupon-offer.test.ts` | Missing coupon price unsellable | Percent-of-face quote |
| `src/lib/commerce/implausible-discount.test.ts` | ₪1/₪400 blocked from sale | Master SKU bought |
| `src/server/actions/payments/checkout.test.ts` | Server re-prices | Shopper-set prices |
| `src/app/api/payments/cardcom/webhook/route.test.ts` | `?s=` + GetLpResult | Trust POST amount |
| `src/server/domain/vouchers/redemption.test.ts` | WHERE issued | Double scan |
| `src/server/actions/payments/refund.test.ts` | No card after redeem | Refund a meal |
| `src/lib/auth/rls-write-policies.test.ts` | No USING (true) writes | Open order_items |
| `src/app/api/cron/notifications/route.test.ts` | Drain sends mail | "Finalize emails" lie |
| e2e `full-purchase-redeem` | Pay + issue + scan | Silent money path |

## Second pass

Cashback tests must assert **finalize** key `order:<id>:cashback`, not scan. Cookie tests must cover both `ke_session_id` and constructed `session_id=`. Pending 169–172 tests must use full filenames.
