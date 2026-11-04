# S22: gift a coupon by email, with a personal message and a send date

Queue item S22, 04.11.2026. Scope: gift coupon by email with a personal
message and scheduled send, `/gift/[product]` and the claim route, migration
if missing.

## What already existed, and what did not

Measured before writing anything:

- **The gift itself existed end to end.** The checkout gift block
  (`CheckoutForm.tsx`: recipient email, name, greeting, send date, wrapping),
  `giftSchema`, `resolveGiftDeliverAt` and the 365-day ceiling
  (`src/lib/gifts/wrap.ts`), `sendOrderGifts` at finalize (claim token minted,
  only its SHA-256 stored, one `voucher_gifted` outbox row per coupon), and
  the claim page `/gift/[token]` with `claimGift`.
- **The scheduled send did not work in production.** Migration 226 was
  written 10.09 and never applied. Production had `orders.gift_send_at` and
  `orders.gift_scheduled_at` from some out-of-repo change, and none of the
  three 226 columns. Checkout probes `gift_wrap_fee_agorot` and, finding it
  absent, dropped both the date and the wrapping fee without telling anyone.
  Every gift went out immediately whatever date the buyer chose.
- **There was no `/gift/[product]`.** Gifting was possible only from inside
  checkout, after the shopper had already reached it.

## Migration 226: applied

Rehearsed first inside `BEGIN ... ROLLBACK` against production, then applied
with the queue's command:

```
$ supabase db query --linked -f /tmp/s22rehearse.sql   (BEGIN; 226; count; ROLLBACK;)
  "rows": [ { "n": 3 } ]
$ <gift column probe after rollback>
  12 gift columns, unchanged: the rehearsal left nothing behind

$ supabase db query --linked -f migrations/pending/226_gift_scheduling_and_wrap.sql
  "rows": []

$ <information_schema + pg_constraint + pg_indexes>
  "cols": "orders.gift_deliver_at:timestamp with time zone:null
         | orders.gift_wrap_fee_agorot:bigint:0
         | vouchers.gift_deliver_at:timestamp with time zone:null",
  "chk": 1,     (orders_gift_wrap_fee_agorot_nonneg)
  "idx": 1      (idx_vouchers_gift_deliver_at)
```

Additive only: three columns, one CHECK, one partial index. With it in place
the checkout probe finds the column, so the order records the date and the
fee, finalize parks the outbox row on `next_attempt_at`, and the drain sends
it on the first run on or after that date. The pre-existing
`gift_send_at`/`gift_scheduled_at` columns are untouched and unread.

The wrapping fee is ₪15 (`GIFT_WRAP_FEE_AGOROT`, integer agorot). It goes to
the platform and changes no supplier split. That rule was already in
`calculateSettlement`, and it starts being charged now.

## `/gift/[product]`

One dynamic segment serves both pages, because Next allows one per level and
the claim links already sent are `/gift/<token>`, so that URL cannot move.
`src/app/(store)/gift/[token]/page.tsx` dispatches:

1. Token-shaped (`isWellFormedGiftToken`: 40 to 64 base64url characters) and a
   gift exists: the claim page, unchanged.
2. Otherwise the segment is decoded as a product slug and read through
   `loadProductBySlug` (cached catalogue read, active, not deleted). A coupon
   gets `GiftPurchaseForm`. A physical product gets a sentence saying it ships to
   an address and cannot be gifted, which is the same rule checkout applies.
3. Neither: 404.

A token miss falls through to the product lookup, so an ASCII slug of token
length still resolves. The tab title changed from `קיבלת מתנה` to `מתנה`,
because "you received a gift" is false on the page that starts one.

**Not a second checkout.** `startGiftPurchase`
(`src/server/actions/gift-purchase.ts`) validates the fields with the same
`giftSchema` plus a required email, checks the date with
`resolveGiftDeliverAt`, refuses a non-coupon, and calls `addToCart` (which
owns stock, the per-order cap and the rate limit). It then stores the gift as
a prefill cookie and redirects to `/checkout`. Nothing is charged there.

**The prefill** (`src/lib/gifts/draft.ts`): cookie `ke_gift_draft`, httpOnly,
SameSite=Lax, `path=/checkout`, 30 minutes, base64url of UTF-8 JSON (a full
500-character Hebrew greeting is about 1.4 KB, against about 3 KB
percent-encoded). A cookie and not the query string, because the greeting is
personal and a query string ends up in history, logs and Referer headers.
It is untrusted: checkout reads it as `defaultValue`s only, the form posts the
fields again, and `submitCheckout` validates them as before.
`submitCheckout` clears the cookie on post so it cannot reopen the gift block
on the shopper's next checkout.

Checkout change (`CheckoutForm.tsx`, an open V-route, not frozen): new
optional `giftPrefill` prop; the gift box starts ticked when it is present
and each field gets a `defaultValue`. Without a prefill it renders exactly as
before (tested).

New strings are in `messages/he.json` / `en.json` under `gift.purchase.*`.
The i18n ceiling (603) did not move.

**Entry point.** The product page is frozen, so there is no "send as gift"
button on it. `/gift/<slug>` is reachable by link (share, email, campaign),
and the checkout gift block is still there for anyone already in the cart.

## Browser run (built server, port 3322, production DB)

```
$ curl /gift/e2e-test-coupon                         200  form rendered (name="gift_recipient_email")
$ curl /gift/<physical product slug>                 200  "נשלח לכתובת ולא במייל", no form
$ curl /gift/AAAA...(43 chars, no such gift)          200  NEXT_HTTP_ERROR_FALLBACK;404
$ curl /gift/no-such-product-slug                    200  NEXT_HTTP_ERROR_FALLBACK;404
```

(200 with the not-found boundary is how a `notFound()` inside `<Suspense>`
streams under cacheComponents. The claim page already behaved this way.)

Playwright, real Chromium: fill `/gift/e2e-test-coupon`, submit, land on
checkout, read the checkout form (scoped to `form.checkout-page__grid`,
because Next 16 keeps the previous route mounted and hidden):

```json
{
 "url": "/checkout",
 "giftTicked": true,
 "email": "s22-probe@example.com",
 "name": "דנה",
 "message": "יום הולדת שמח מ-S22",
 "deliverAt": "2026-11-14",
 "expected": "2026-11-14",
 "wrap": true,
 "draftCookie": [ { "path": "/checkout", "httpOnly": true, "sameSite": "Lax" } ]
}
```

No payment was made. The scheduled path after payment (finalize to
`next_attempt_at`, a date past the coupon's expiry dropped to "now", replay
idempotency) is covered by the existing `gift-vouchers.test.ts`.

## Tests

New:

- `src/lib/gifts/draft.test.ts` (4): round trip, size under the cookie
  ceiling, refuses to encode without a valid email, malformed or tampered
  values read as no draft.
- `src/server/actions/gift-purchase.test.ts` (7): success adds to cart, sets
  the cookie (httpOnly, Lax, `/checkout`) and redirects; bad email, past date,
  date over 365 days, physical product, inactive product and cart refusal all
  return an error and set nothing.
- `src/app/(store)/checkout/gift-prefill.test.tsx` (2): prefill opens the
  block ticked and filled; no prefill leaves it as before.

Changed: `auth-coverage.test.ts` declares `startGiftPurchase` public, with
its reason (a guest add-to-cart plus a cookie on the caller, rate limited by
`addToCart`, nothing charged).

## Gates

```
$ pnpm type-check
$ tsc --noEmit                      exit 0

$ pnpm lint                         exit 0
Checked 2188 files in 616ms. No fixes applied.
i18n gate: clean (603 Hebrew literals in scope, ceiling 603)
input-dir gate: clean (28 tel/email/url inputs, all carry dir)
docs-index-gate: OK.

$ pnpm test  (vitest run)
 Test Files  677 passed | 1 skipped (678)
      Tests  8073 passed | 13 skipped (8086)

$ pnpm build                        build_exit=0
├   /gift/[token]                    1h      1d
│ └ ◐ /gift/[token]                  1h      1d
```

## Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 src/components/gifts/GiftPurchaseForm.tsx          | 117 +++++++++++++++++++++
 .../notifications/ExpiryEmailSwitch.test.tsx       |  34 ++++++
 src/components/notifications/ExpiryEmailSwitch.tsx |  52 +++++++++
 .../notifications/PushTopicsSwitch.test.tsx        |  74 +++++++++++++
 src/components/notifications/PushTopicsSwitch.tsx  |  90 ++++++++++++++++
 .../supplier-apply/SupplierCardCheck.tsx           |  53 ++++++++++
 .../turnstile/SupplierApplyChallenge.tsx           |  49 +++++++++
 src/components/turnstile/TurnstileRefresh.tsx      |  71 +++++++++++++
 8 files changed, 540 insertions(+)

$ for f in <each file above>; do git cat-file -e design-locked-2026-10-19:$f && echo "EXISTED AT TAG: $f"; done
(no output: none of the eight existed at the tag)
```

Only one of these is this item's file (`GiftPurchaseForm.tsx`, new). The
other seven are S17, S20 and S21 files, all new since the tag. The two pages
this item edits, `/gift/[token]` and `/checkout`, are not on the frozen list:
the claim page is not one of the frozen routes, and checkout is an open
V-route.
