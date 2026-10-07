# Shipping: carriers, quotes, labels, tracking

Written 2026-10-08 (STEP 43). What is built, what is measured, and what is an
assumption waiting for a courier account.

## 1. The two prices

Every shipping number in this codebase is one of two things, and they are
never the same column:

| Price | Who pays whom | Where it lives | Value today |
| --- | --- | --- | --- |
| Shopper price | the shopper pays the platform, on the card | `shipping_zones` (197, live) folded by `src/lib/shipping/quote.ts`; `shipments.shopper_agorot` after 258 | 0 in every zone |
| Carrier cost | the platform pays the courier | the carrier's quote; `shipments.carrier_cost_agorot` after 258 | the courier's quote, mock list prices today |

The site prints "משלוח מהיר חינם" on every page and `shipping_zones` is seeded
free everywhere. A courier's quote is therefore never passed to the shopper by
this code. Charging for shipping is a change to a row in `shipping_zones`,
which is a business decision and a data change, not a code change.

Both are integer agorot. The only place a shekel decimal appears is the carrier
wire (`providers/http.ts`), converted at the boundary through `lib/money.ts`.

## 2. The modules

| File | Holds |
| --- | --- |
| `src/lib/shipping/carrier-registry.ts` | The closed list of API carriers (`israel_post`, `chita`, `yamit`), their services and bands, their env prefixes. |
| `src/lib/shipping/carriers.ts` | The OLD, forgiving list: free text an admin typed into a Hebrew label and a tracking link. The registry writes its `legacyCarrierText` into `order_items.carrier` so both agree. |
| `src/lib/shipping/env.ts` | `loadShippingEnv`: credentials per carrier, mock by default. |
| `src/lib/shipping/providers/types.ts` | The provider contract: quote, createLabel, track, optional cancel. |
| `src/lib/shipping/providers/mock.ts` | The in-process carrier. Deterministic, clock-injected; tracking numbers `KEMOCK-<CC>-<base36 minutes>-<hash>` carry their birth time so any instance can track them. |
| `src/lib/shipping/providers/http.ts` | JSON-over-HTTPS adapter. See section 5. |
| `src/lib/shipping/zones.ts` | City to zone, zone policy to shopper price, 197's seed as the fallback. |
| `src/lib/shipping/quote.ts` | Carrier quotes plus zone policy into the checkout options. |
| `src/lib/shipping/tracking.ts` | Status vocabulary, Hebrew labels, timeline steps, event merge. |
| `src/lib/shipping/label-pdf.ts` | The A6 label the platform prints when the carrier returns no PDF (always under the mock). |
| `src/server/shipping/quotes.ts` | Server fold for checkout: zone row, weight estimate, parallel provider quotes with `allSettled`. |
| `src/server/shipping/shipments.ts` | Create a label for an order: provider call, `order_items` write, `shipments` insert (tolerant), R2 archive, shipped notification, audit. |
| `src/server/shipping/tracking-poll.ts` | The poller: refresh active shipments, merge events, deliver lines when the carrier says delivered. |
| `src/server/queries/shipments.ts` | Customer-facing read, RLS-scoped, with the two-step fallback when 258 is not applied. |
| `src/server/actions/shipping.ts` | `getShippingQuotes` for the checkout form, rate-limited (`shipping-quote`). |
| `src/server/actions/admin/shipments.ts` | `createShipmentLabel`, `refreshShipmentTracking` (orders:write). |
| `src/app/api/admin/shipments/[id]/label/route.ts` | Streams the label PDF to an admin. |
| `src/app/api/cron/shipments-track/route.ts` | Hourly poll. |
| `migrations/pending/258_shipments_and_order_carrier.sql` | The table and the two order columns. Not applied. |

## 3. Checkout

The form quotes on city change (`CarrierPicker`), through the server action,
and renders one radio per carrier service: carrier, service, band, and the
shopper price ("חינם" at zero). The pick posts as `shipping_option`
(`<carrier>:<service>`), validated against the registry by zod, and the
action writes `orders.shipping_carrier` / `shipping_service` in their own
UPDATE (42703 tolerated until 258) and a Hebrew line into `orders.notes`,
which the supplier and the admin read today. No pick is a valid pick: the
admin chooses at label time.

Nothing here changes the card charge while every zone is free; the cart's
`shipping.cost` stays the registry's zero and `calculateSettlement` is not
touched. The day a zone row carries a rate, the shopper price on the option
is the number to put on the order, and 236's `shipping_agorot` is its column.

## 4. Fulfilment

On the order page the admin picks a carrier and service (the shopper's choice
is pre-selected) and presses "צור תווית". The server reads the order and its
address, calls the provider, writes `carrier` + `tracking_number` on every
pending physical line and moves them to `shipped` through the same
`planTransition` machine as the manual buttons, inserts the `shipments` row,
archives the PDF in R2 when R2 exists, enqueues the shipped mail/WhatsApp
through `enqueueShippedNotifications` (same dedupe key as before), and writes
one audit row. The label opens from `/api/admin/shipments/<id>/label`
(rendered on demand when nothing is archived).

The poller (`/api/cron/shipments-track`, hourly) asks each provider about
every non-final shipment, merges events newest first, and when the carrier
says delivered it marks the shipped lines delivered through the same machine
and lets `enqueueDeliveredNotification` fold the order. A refresh button on the
order page runs the same code for one shipment.

## 5. The HTTP contract is ours, not theirs

Measured 2026-10-08: none of the three couriers publishes a developer
reference. Israel Post issues API keys by email against a whitelisted server
IP; Chita's only public trace is a PHP client with create / label / cancel;
Yamit integrates through partner apps. No account exists for any of them.

`providers/http.ts` therefore implements the smallest shape a courier
integration needs, and the environment points it at a base URL:

| Verb | Path | Body in | Body out |
| --- | --- | --- | --- |
| POST | `/v1/quotes` | `destination{city,zip}`, `parcel{weight_grams,declared_value_ils,pieces}` | `quotes[{service_code, price_ils, min_days?, max_days?, quote_ref?}]` |
| POST | `/v1/shipments` | service, references, `recipient{...}`, `parcel{...}`, `label_format` | `tracking_number, shipment_id?, label_pdf_base64?, price_ils?` |
| GET | `/v1/shipments/{tracking}/tracking` | | `status?, estimated_delivery?, events[{at, status?, description?, location?}]` |
| POST | `/v1/shipments/{id}/cancel` | | |

Auth is `Authorization: Bearer <key>` plus `X-Account-Id` when set. Every call
has a timeout (`SHIPPING_CARRIER_TIMEOUT_MS`, default 8 s) and every failure
is a typed `CarrierError`; the callers degrade (zero-rate option at checkout,
manual tracking at the admin) and never 500. When a real contract arrives,
the three `parse*` schemas and the paths are what change.

Until then the mock is the provider in every environment, including
production, and `shipments.provider_kind = 'mock'` says so on every row.

## 6. What is still open

- Apply 258 (approval, like every pending file).
- A courier account, then the real wire shape for that courier.
- A rate in `shipping_zones` is a business decision; the code already honours
  one.
- `products.weight_grams` is NULL on every row; quotes assume 1 kg per unit.
