---
name: cardcom-payments
description: Use whenever working on payment flow, checkout, tokenization, or anything in src/server/actions/payments/.
---

## Platform model

KenyonExpress is a PLATFORM, not a supplier. It connects customers to suppliers and takes a commission. The platform never holds inventory.

## Payment split by product type

Commission is `products.platform_percent`: a MANDATORY per-product value the
admin sets. There is no default rate anywhere (docs/CONTRADICTIONS.md C1/C2).
It is snapshotted into `order_items` at purchase.

### Physical product
- Customer pays 100% of the price on checkout.
- Platform keeps `platform_percent` of that amount; the rest goes to the supplier.
- Cardcom has no atomic split, so the split is recorded in our ledger and settled
  by payout (T+3 business days, minimum 100 ILS accrued balance).

### Coupon product
- Customer pays the coupon price set on that product, on the KenyonExpress site.
- The remainder is paid directly at the business on coupon scan.
- Commission is taken from the upfront only, never from the full face value.
- The upfront is recorded as an INTERNAL `held` entry in our own ledger until
  redemption. There is no external escrow and no J5 authorization.
- Coupon status transitions: `active` -> `redeemed` (on QR scan at business).
- Expiry is `products.coupon_expiry_days` per product (30 / 60 / 90 or any
  integer). On expiry without redemption the upfront is credited to the
  customer's digital wallet.

## First purchase incentive

- First purchase: customer receives a 10% discount on the total.
- Card is tokenized (Cardcom token) during first purchase for one-click future checkout.
- Token stored in `payment_tokens` table, never the raw card number.

## Wallet cashback

- Every 5th purchase triggers 5% cashback added to the customer's wallet.
- Wallet credit is internal site credit only.
- It NEVER cashes out -- no bank transfer, no refund to card.
- Applied as a discount on the next order at checkout, not automatically.

## Authentication flow

- Sign-in: Google OAuth on first visit.
- Subsequent sign-in: OTP (email or phone), not password.
- Guest cart: allowed. User can browse and add to cart without logging in.
- Login required: only when the customer clicks "Pay" at checkout.
- On login, merge guest cart into user cart.

## Cardcom integration rules

- All Cardcom calls go through server actions in `src/server/actions/payments/`.
- Never call Cardcom from client components.
- Always validate the Cardcom callback signature before updating order status.
- Use `adminClient` (service role) for order status updates -- never the user's client.
- Log every Cardcom webhook event to `audit_log` before acting on it.
