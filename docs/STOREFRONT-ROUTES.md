# Storefront route inventory

Every customer- or cashier-facing URL in the App Router, with index policy and the anatomy/copy file that owns it. Admin `/admin/**` is out of scope. Measured from `src/app/**/page.tsx` on 2026-09-07.

Status: binding map. Docs only.

| Path | Audience | robots | Anatomy |
|---|---|---|---|
| `/` | customer | index | PAGE-ANATOMY §1 |
| `/products` | customer | index page 1 | §2.6 H1 `חנות` |
| `/category/[slug]` | customer | index; noindex if filtered | §2 |
| `/product/[slug]` | customer | index if active | §3 coupon / §4 physical |
| `/cart` | customer | noindex | §5 |
| `/checkout` | customer | noindex | §6 |
| `/checkout/return` | customer | noindex | §17 |
| `/checkout/confirmation` | customer | redirect to return | §17 |
| `/checkout/failed` | customer | noindex | §6.5 |
| `/checkout/frame-return` | customer | noindex | Cardcom iframe breakout |
| `/checkout/app-return` | app | noindex | app channel |
| `/s/[id]` | customer | index if active | §10 |
| `/suppliers` | prospect | index | join-us marketing, not a store |
| `/city/[slug]` | customer | index | §18 |
| `/search` | customer | noindex | §11; no header field |
| `/coupon/[id]` | owner | noindex nofollow | §9 |
| `/gift/[token]` | recipient | noindex nofollow | §20.1 URL is the credential |
| `/redeem/[token]` | cashier | noindex nofollow | §20.2 |
| `/account/**` | customer | noindex | §7 to §8.6 |
| `/login` `/signup` `/forgot-password` `/reset-password` `/mfa` | auth | noindex follow | COPY-HE §3.5 |
| `/supplier/login` `/supplier/access-denied` | partner | noindex | ROLE-JOURNEYS §4 |
| `/supplier/**` `/scan` | partner | noindex | scan + history |
| `/legal/*` plus WP aliases | customer | index | §19 |
| `/about` `/contact` `/faq` `/blog` | customer | index | §19 |
| `/offline` | PWA | noindex | §19 |
| 404 / 500 | all | noindex | §12 to §13 |

Money and percent never appear as SEO fields. Sitemap include/exclude: `docs/SEO-CONTENT-PLAN.md` §6.

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Inventory after anatomy deepen (return, city, legal, gift, redeem) |
| 2026-09-07 | Point `/products` at §2.6, account at §8.6 |
