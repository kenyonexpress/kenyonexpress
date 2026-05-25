---
name: cardcom-payments
description: Use whenever working on payment flow, checkout, tokenization, or anything in src/server/actions/payments/.
---

## Platform model

KenyonExpress is a PLATFORM, not a supplier. It connects customers to suppliers and takes a commission. The platform never holds inventory.

## Payment split by product type

### Physical product
- Customer pays 100% of the price on checkout.
- Platform keeps 10% (commission).
- 90% goes to the supplier via Cardcom Multi-Account split at time of payment.
- No manual payout step needed -- Cardcom splits at transaction time.

### Coupon product
- Customer pays 10% only, on the KenyonExpress site.
- The remaining 90% is paid directly at the business on coupon scan.
- No escrow, no payout from platform to supplier.
- Coupon status transitions: `active` -> `redeemed` (on QR scan at business).
- Coupon expires (status `expired`) at `expiry_date` if not scanned.

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
