# E2E plan

Runner: Playwright against **fresh** `pnpm start`, not stale `dev`. WebKit localhost: guest `Secure` cookie off (proto http).

| Flow | Role | Device |
|---|---|---|
| Guest add coupon, pay (login on pay), voucher in account | customer | 380 chrome + webkit |
| Physical pay + address | customer | 768 |
| Scan success / already / wrong shop / expired | scanner | mobile-chrome |
| Admin refund issued coupon | admin | 1440 |
| Uploader cannot open refund | content_uploader | 1440 |
| Support cannot refund | support | 1440 |
| Checkout disabled | anyone | 380 |
| Frame-return ungated | none | iframe |
| RTL 380/768/1440 | guest | three widths |
| a11y axe sample pages | guest | 380 |
| Search empty q | guest | 380 |
| Wishlist guest then login merge | customer | 380 |

Never: production Cardcom, service_role in browser, buy master SKU (must refuse).

Existing specs: `e2e/*.spec.ts` listed in pack TEST-MAP. Close gaps: support 403, cookie rename, checkout disabled.

---

## Second pass

Fresh pnpm start. Never production Cardcom. Never buy master SKU. Support 403 refund. Frame-return ungated. RTL three widths.
