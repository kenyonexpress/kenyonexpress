# PRICING-DISPLAY-RULES

Every number a shopper sees must be the number checkout will charge. Coupon
display is derived from `buildCouponOffer` (`src/lib/commerce/coupon-offer.ts`),
the same object JSON-LD and the commission engine read. The storefront once
printed `price * 0.1` while the cart charged `coupon_price_ils`. That must not
return.

Money in storage is integer agorot. The page formatter is `shekels` in
`src/lib/money-format.ts` (agorot in, `₪1,234.56` out). Do not call
`Intl` currency style on a product card: it emits directional marks that
reorder the glyph next to Hebrew.

---

## 1. Coupon display

| Slot | Source | How it looks |
|---|---|---|
| Original / sticker | `fullPriceIls` (`products.price_ils`) | strikethrough (`line-through`), muted |
| Voucher / pay now | `paidOnlineIls` (`products.coupon_price_ils`, absolute, no default) | prominent, deal red / live token |
| Pay at business | `balanceAtBusinessIls` = sticker minus online, floored at 0 | explicit sentence, never implied |
| Savings amount | sticker minus online | optional second line |
| Savings percent | `discountPercent` = round((1 - online/sticker) * 100) | badge. Whole percent |

Copy that must appear on PDP, card, and checkout when the line is a coupon:

`שולם באתר` / `יתרה בבית העסק`

Checkout contract test looks for `יתרה לתשלום בעסק (בקופון)` and
`יתרה בעסק: ₪…`. Physical lines must **not** show that pair.

Unsellable coupon (`missing-price` or `expired`): describe, do not invent 10%.
Hide add-to-cart. JSON-LD: `OutOfStock`, no zero price.

`platform_percent` is never shown to the shopper.

---

## 2. Physical display

| Slot | Source |
|---|---|
| Price | `kenyon_price` (on-site charge, 100%) |
| Compare-at | `full_price` when strictly higher, strikethrough |
| Shipping | only if the line has a real shipping amount. There is no hardcoded postage. Coupon lines: no shipping row |
| Stock | quantity when tracked; null means not tracked, not "sold out" |

Physical checkout does not show "יתרה בעסק".

---

## 3. Currency formatting (Hebrew RTL)

Canonical:

`shekels(agorot)` → `₪` + grouped whole shekels + `.` + two-digit agorot.

Glyph **before** the digits, matching the live site, not after.

Header badge may use `shekelsRounded` (half-up to whole shekels) so a cart of
₪99.60 reads ₪100.

`formatIls` in `src/lib/commerce/money.ts` is for logs and documents (Intl
`he-IL` currency). Product UI uses `shekels`.

Do not format with `toFixed` on a shekel float in new UI. Existing cards that
still do are debt; new work goes through agorot.

Negative: leading minus, then the same pattern.

---

## 4. Rounding rules from agorot

All arithmetic is integer. `applyBp` is half-up:
`round(amount * bp / 10000)` with no float.

Display:

- Divide with `/` and `%` on the integer inside `shekels`. The shekel part
  handed to `toLocaleString` is already whole.
- Never `agorot / 100` as a float passed to a formatter.
- Discount badge percent is the one place a 0 to 100 integer is shown, not
  money.

---

## 5. Tax display (VAT included)

Legal copy (migrated): `מחיר המוצר באתר כולל מע"מ` unless stated otherwise.

Shopper prices are VAT-inclusive. Do not add an 18% line on the product card.
Invoices extract VAT by subtraction at 18% (`docs/DECISIONS.md` D-9). That
split belongs on the tax document, not on the tile.

Coupon: the **online** amount includes VAT on that amount. The remainder at
the business is collected by the business, not by us; we do not print their
VAT.

---

## 6. Price change handling on existing carts

The cart is not a frozen quote until `beginCheckout`.

On every cart read, lines are re-priced from the live catalogue
(`src/lib/cart/pricing.ts`):

- Missing `platform_percent`: line `unavailable`, no invented percent.
- Missing coupon price: coupon line unavailable.
- Stock 0: unavailable.
- Soft-deleted or not `active`: unavailable.

At checkout, `platform_percent`, coupon price, cashback percent, and supplier
identity are **snapshotted** onto `order_items`. After that, an admin changing
the product does not rewrite the paid order.

UI: an unavailable line stays visible with a Hebrew reason and is excluded
from the charge. Do not silently drop it (that looks like theft of a deal).

Guest cart in Zustand / cookie is identities and quantities, not prices. The
server is the price list.

Wallet field is clamped to the **current** on-site charge, so a price drop
cannot leave an applied wallet larger than the new total.
