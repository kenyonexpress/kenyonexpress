# ANALYTICS-PLAN

First-party analytics. There is no PostHog in this repository. Browser events
post to `/api/a`, land in `fn_ingest_analytics_events`, and are gated on the
consent cookie. Money moments are written server-side from checkout, redeem,
and refund, and are **not** gated on consent: they are records of a transaction
the user started.

Companion: `src/lib/analytics/events.ts` (taxonomy),
`src/lib/analytics/consent.ts` (what the banner actually promises),
`src/app/(admin)/admin/analytics/page.tsx` (the only dashboard).

---

## 1. Event taxonomy

The names below are the whitelist. An event the client cannot build is an event
the server will drop. Keep `CLIENT_EVENT_NAMES`, `SERVER_EVENT_NAMES`, and the
database registry in lockstep (migration 151 seeded the client eight; server
names need the ingest whitelist to include them or they are silently skipped).

### 1.1 Client events (browser, consent required)

| Event | Required props | When fired |
|---|---|---|
| `page_view` | none | every storefront navigation the tracker sees |
| `view_product` | `product_id` | product page |
| `view_category` | `category_id` | category archive |
| `add_to_cart` | `product_id`, `quantity` | add |
| `remove_from_cart` | `product_id` | remove |
| `checkout_step` | `step` (`identity` \| `address` \| `payment_redirect`) | checkout wizard |
| `web_vital` | `metric`, `value` | LCP, CLS, INP, TTFB, FCP. Sampled at 25% of sessions |
| `whatsapp_click` | none (product_id when the tap is on a PDP) | WhatsApp exit; purchase then happens off-platform |

Envelope (every client event): `event_id` (UUID), `occurred_at`, `source`
(`web` \| `pwa`), `source_app: shop`, `session_id`, optional `path`,
`referrer`, `utm`, `props` (flat JSON, cap 4 KB, PII-free by convention).
Batch max 20.

### 1.2 Server events (never accepted from a browser, never consent-gated)

| Event | When fired | Props (typical) |
|---|---|---|
| `begin_checkout` | `beginCheckout` | order / cart identity |
| `purchase` | `finalizeOrder` after paid | order id, counts. **No revenue in the event.** Revenue is read from `orders` / `order_items` |
| `voucher_redeemed` | successful `redeem_voucher` | voucher / order item |
| `order_refunded` | admin `refundOrder` after money moved | order id |

`trackServerEvent` stamps `p_ip: null` and `p_user_agent: null`. `anonymous_id`
is the httpOnly guest-cart cookie, read on the server, so the browser cannot
forge another visitor's id.

### 1.3 Third-party pixels (consent required, wording version 2)

GA4 and Meta receive derived commerce payloads from
`src/lib/analytics/ecommerce.ts`. Money is converted from agorot to decimal
ILS **once**, in that builder. `redeem_coupon` is a custom GA4 event only: it
is not a purchase, and sending it to Meta as one would double-count ad
revenue.

The consent banner used to promise "no third party". Version 2 of the wording
re-asks everyone, because GA4 and Meta make that sentence false.

---

## 2. Funnel definitions

Admin funnel (`funnelWithRates` on `/admin/analytics`) is built from the
event stream plus paid orders, not from a PostHog board.

### Browse to purchase

```
page_view
  -> view_category / view_product
  -> add_to_cart
  -> checkout_step:identity
  -> checkout_step:address
  -> checkout_step:payment_redirect
  -> begin_checkout          (server)
  -> purchase                (server, after GetLpResult + finalize)
```

A WhatsApp tap is an **exit**. It is counted with the product when it came
from a PDP. It is not a step toward `purchase` on this site.

### Coupon to redemption

```
purchase (order has coupon lines, vouchers issued)
  -> voucher_redeemed (one event per successful scan)
```

Redemption is not a second purchase. The money moved at `purchase`. The scan
is a fulfilment event. Do not add redeemed face value into revenue.

Drop-off that is not in the funnel: voucher expired (nightly job), refunded
before scan, gifted and unused.

---

## 3. Cohort definitions

There is no saved cohort UI. Definitions below are how to cut the same
tables the dashboard already reads.

| Cohort | Rule |
|---|---|
| First-time buyer | `profiles` with exactly one `orders.status` in (`paid`, `partially_fulfilled`, `fulfilled`, `platform_settled`) |
| Repeat buyer | two or more such orders |
| Coupon buyer | at least one paid `order_items` whose snapshotted type is `coupon` |
| Physical buyer | at least one paid line whose type is `physical` |
| Mixed | both in the window |
| Redeemed coupon buyer | coupon buyer with at least one `vouchers.status = redeemed` |
| Unredeemed coupon buyer | issued voucher past neither expiry nor refund |

`splitByProductType` on the analytics page is the live split of **sales
lines**, not of people. A person can sit in both coupon and physical cohorts
in the same month.

---

## 4. Key metrics and formulas

Money is integer agorot in storage. Display on the admin page currently reads
`...Ils` columns through `shekelsFromIls`. Do not mix the two in one formula.

| Metric | Formula | Source |
|---|---|---|
| Conversion rate | `purchases / sessions` in the window. Session = analytics `session_id` with idle 30 minutes | events + orders |
| AOV (average order value) | `sum(paid order total agorot) / count(paid orders)` | `orders` |
| Take rate | platform share / paid GMV, using snapshotted `platform_percent` per line (`takeRateByPlatformPercent`) | `order_items` |
| Redemption rate | `count(vouchers.status = redeemed) / count(vouchers issued in window)` | `vouchers` |
| Refund rate (count) | `count(orders.status = refunded) / count(orders that reached paid)` | `orders` |
| Refund rate (money) | `sum(refunds.granted_agorot) / sum(paid totals)` | `refunds`, `orders` |
| Coupon vs physical mix | GMV and count from `splitByProductType` | `order_items` |

Revenue is **never** taken from the `purchase` event payload. The event is a
fact that finalize succeeded. The amount is the ledger.

---

## 5. Dashboard layout spec

`/admin/analytics`, admin-tier only (`canSeeMoney`). Never cached.

Controls: period toggle, daily (30 bars), weekly (90 days), monthly (12
months).

Row 1, four `StatsCard`s: sales total, order count, AOV, take rate.

Row 2: sales bar series (`BarSeries`) in the chosen bucket.

Row 3: funnel bars (`FunnelBars`) with step-to-step rates.

Row 4: coupon vs physical split.

Row 5: top products, top suppliers.

Do not put `platform_percent` of a live product on this page as a forecast.
The take rate is historical, from snapshots.

---

## 6. Privacy: what we do not track

| Do not | Why |
|---|---|
| PAN, CVV, Cardcom token | PCI. Tokens are last4 + brand in UI |
| Email, phone, name in `props` | convention on the ingest schema; 4 KB JSON is not a place for identity |
| Client-forged `anonymous_id` | the guest id is httpOnly; `/api/a` stamps it |
| IP on server events | `p_ip: null` in `trackServerEvent` |
| Browser events without consent | `isTrackingAllowed` re-read on every event; revoke is immediate |
| Stale consent | wording version 2; old "no third party" grant is invalid |
| Money in analytics rows | revenue stays on `orders` |
| Other visitors' guest ids | client cannot read `ke_session_id` |

IP on the **beacon** path: `/api/a` may see the request IP for rate limiting
(`analytics` policy: 120 / 60s per IP). That is a limiter key, not a stored
analytics dimension. Do not add IP as a column on `analytics_events`.

Session id lives in `localStorage` (`ke_a_session`), rolling 30 minutes.
Attribution UTM lives in a first-party cookie for 30 days, written only after
consent.

Business records (orders, payments, redemptions, wallet, `begin_checkout`)
are not optional telemetry. They are the shop.
