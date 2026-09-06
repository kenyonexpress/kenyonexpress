# Role journeys

End-to-end numbered journeys with decision branches. At each step: what is visible, what is forbidden, what is logged.

Status: binding for this worktree. Docs only.

Product roles (see `docs/DATA-CONTRACTS.md` §0):

| Brief | Production |
|---|---|
| customer | `profiles.role = customer` |
| coupon_partner | `supplier_members.member_role = scanner` (owners/managers may scan too) |
| content_uploader | `profiles.role = content_uploader` |
| admin | `is_admin()` |

Money: integer agorot. `platform_percent` is never shown to a customer or scanner. No escrow language.

Companions: `docs/ARCHITECTURE-CART-CHECKOUT.md`, `docs/VOUCHER-LIFECYCLE.md`, `docs/SUPPLIER-PAGE.md`, `docs/COPY-HE.md`, `docs/ui-design-system/PAGE-ANATOMY.md`.

Logging: PostHog/commerce events, `audit_log` for staff, `payment_events` / `payment_webhook_events` for Cardcom, `voucher_redemptions` for scans, Sentry/Axiom on failures. Do not log PAN, CVV, or raw `cardcom_token`.

---

## 1. Customer buys a coupon

Guest may browse and cart. Login is required at pay (Google / OTP), then `mergeGuestCart`.

### Steps

1. **Land on home or category.** Visible: Electro chrome, live prices, yellow CTA. Forbidden: `platform_percent`, cost, uploader UI. Logged: page view if consent granted (ConsentBanner). No consent: no GA/Meta.

2. **Open `/product/{slug}` (type coupon).** Visible: gallery, H1, `מחיר רגיל` / `מחיר בקניון`, split `לתשלום באתר עכשיו` / `יתרה לתשלום בבית העסק`, expiry `{n}` days, supplier block, ATC. Forbidden: split percents, escrow, SKU, buy-now physical colour as the primary story. Logged: product view; WhatsApp share click **before** the window opens (`whatsapp_click` + `product_id`).

3. **Branch: offer not sellable.** Visible: `המבצע הסתיים` or `הקופון אינו זמין לרכישה`. Forbidden: a working ATC. Logged: none required beyond the view.

4. **Pick variant (if any) and qty.** Visible: qty field, ceiling `max_per_order`. Forbidden: qty above ceiling. Logged: none until add succeeds.

5. **Add to cart.** Visible: toast / mini-cart count. Forbidden: firing purchase analytics on a **refused** add. Logged: add_to_cart only if the server accepted. Cart row stores product/variant/qty, not a frozen percent yet.

6. **Branch: guest.** Visible: cart still works. Forbidden: claiming an account voucher. Logged: `carts` by session. `anon` write is this table only.

7. **`/cart`.** Visible: lines, `{price}` on-site, `המשך לתשלום`. Forbidden: remainder-at-business as if already paid; checkout link working if a line is unavailable. Logged: none extra.

8. **Branch: line unavailable** (deleted product, missing coupon price, stock/cap). Visible: per-line warning; CTA `aria-disabled`. Forbidden: Enter-key bypass. Logged: cart validation codes.

9. **Click pay → `/checkout`.** Visible: steps identity → (skip address if coupon-only) → review → confirm. Review must repeat on-site vs at-business. Forbidden: empty pay button (bounce to cart); Cardcom secrets in the client. Logged: `begin_checkout`.

10. **Branch: not authenticated.** Visible: Google / OTP, then return with `ke.checkout.resume`. Forbidden: dropping the guest cart (merge, do not wipe). Logged: auth success, not the password.

11. **`beginCheckout`.** Server re-prices, requires coupon price, **snapshots** `platform_percent` onto `order_items`, creates `orders` + `payments`. Visible: Cardcom iframe / redirect. Forbidden: reading live percent after this point for this order. Logged: `payment_events` checkout_started; order id `{ref}`.

12. **Branch: Cardcom fails / user backs out.** Visible: `/checkout/failed`, `החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה.` Forbidden: issuing vouchers; emptying the cart. Logged: payment failed; no `voucher_issued`.

13. **Webhook `succeeded` (source of truth, idempotent).** Visible later: `/checkout/return` then account. Forbidden: a second voucher set on retry. Logged: `payment_webhook_events`; finalize; `notification_outbox` `voucher_issued` (not a duplicate `order_paid` if vouchers exist).

14. **Return page then email + `/coupon/{id}`.** Visible: pending `מאמתים את התשלום...` until paid; then `התשלום הצליח!`, `{ref}`, `{price}` on site, voucher cards. Forbidden: 404 because of a missing money column (probe); QR on failed payment; `platform_percent`. Logged: email drain; reconcile.

### Decision tree (short)

```
sellable? no → stop on PDP
add accepted? no → toast, stay
line available? no → cart stuck
auth at pay? no → login, merge, resume
charge succeeded? no → failed page, keep cart
webhook duplicate? → same vouchers, 200
```

---

## 2. Customer buys a physical product

Same chrome through cart. Differences from §1 are money, address, and fulfilment. No voucher.

### Steps

1. **PDP physical.** Visible: single `{price}`, strike if any, stock, ShippingInfo, **buy now** `#c94b28`, ATC. Forbidden: on-site / at-business split; "מוחזק עד מסירה"; the percent. Logged: product view.

2. **Branch: stock 0 or missing `platform_percent`.** Visible: `אזל מהמלאי` or ATC refuse (unsellable). Forbidden: checkout of a 0% silent default. Logged: unavailable line if it reached the cart earlier.

3. **Cart** may mix coupon + physical lines. Visible: both `{price}` on-site. Forbidden: mixing a **subscription** into this cart. Logged: same as §1.

4. **Checkout `needsAddress` true.** Visible: step `כתובת למשלוח`. Forbidden: skipping address; scanner seeing this address unless policy allows physical fulfilment (not coupon_partner's job). Logged: address verify failures Hebrew (COPY-HE).

5. **Pay.** Visible: full on-site total. Server snapshots `platform_percent` and splits ledger immediately (`commission_agorot` / `supplier_immediate_agorot`). Forbidden: escrow_held write. Logged: payment + `split_executions` / settlement events; `supplier_sale` email (worded as a sale, **not** a payout of coupon prepaid).

6. **Success.** Visible: order history chip `שולמה` / fulfilment later `shipped`. Forbidden: a QR. Logged: `order_paid` email (because no vouchers); supplier notify to ship.

7. **Branch: refund window.** Visible: account / legal returns copy. Forbidden: customer self-serve rewrite of `platform_percent`. Logged: `refunds` + `refund_completed` email without a bank date promise.

---

## 3. Customer redeems a voucher by QR at the business

This is the **holder** journey at the till. The scan itself is §4.

### Steps

1. **Open `/coupon/{id}` on the phone** (or wallet pass). Visible: if signed out, redirect `/login?next=…` (not 404). If not owner: 404. Forbidden: store header/footer/cart (cashier waiting). Logged: none that print the QR payload.

2. **Branch: not presentable** (redeemed / expired / cancelled / refunded, or clock past `expires_at` even if column still `issued`). Visible: chip, no QR. Redeemed: `מומש ב־{date}`. Forbidden: inviting a scan that will fail in front of the customer. Logged: n/a.

3. **Present QR or read `{code}` grouped.** Visible: 240px QR, code LTR, `לתשלום בבית העסק` large. Forbidden: mirroring the QR; WhatsApp to the business that includes `{code}`. Logged: n/a on this page.

4. **Branch: QR image fail.** Visible: `לא ניתן להציג QR כרגע. הקריאו את הקוד לקופאי.` Forbidden: a broken-image icon as the only fallback.

5. **Cashier scans (journey 4).** Customer pays remainder in cash to the **business**, not to KenyonExpress. Visible to customer after: status `מומש`, email `הקופון מומש · {name}` with `{datetime}` and `{price}` collected, plus `אם לא אתם מימשתם את הקופון, פנו אלינו מיד.` Forbidden: a second live QR. Logged: see §4; customer-side `voucher_redeemed` outbox.

6. **Branch: network drop mid-scan.** Customer keeps the presentable screen until a success email/status. Do not locally mark redeemed. Logged: incomplete scan is not `redeemed`.

---

## 4. coupon_partner scans and marks a redemption

Portal `/supplier/scan` (alias `/scan`). Auth + active membership. `coupon_partner` = scanner: **read-only commercial**, scan + history.

### Steps

1. **Login `/supplier/login`.** Visible: supplier auth. Forbidden: bouncing `access-denied` and login in a loop (both public). Logged: login audit if staff path.

2. **Branch: authenticated but no membership.** Visible: `/supplier/access-denied`. Forbidden: enumerating other suppliers' vouchers. Logged: deny.

3. **Scan UI or camera opens `/redeem/{token}`.** Visible: camera and **always** manual entry, RTL, code LTR. Confirm on `/scan` is `אשר וממש`. Confirm on `/redeem/{token}` is `אשר מימוש`. A photographed customer QR without membership is login or not-found, never a spend. Forbidden: platform percent, payout dashboard as if coupon prepaid were owed (it is not). Logged: rate limit by IP/member; forged HMAC `invalid_signature` even logged-out.

4. **Confirm.** Visible: normalised code. Forbidden: double submit creating two `redeemed` (idempotency_key). Logged: lookup may write a non-success `voucher_redemptions` row.

5. **Branch: outcomes** (COPY-HE §11):

| Result | Visible | Forbidden | Logged |
|---|---|---|---|
| success | `השובר מומש בהצלחה` + **large** `{price}` remainder | showing on-site amount as what to collect | `redeem_voucher` UPDATE issued→redeemed; redemption success; order_item settlement; customer email |
| already_redeemed | `השובר כבר מומש` | implying a new collect | outcome already_redeemed |
| expired | `תוקף השובר פג` | | expired (clock, not only column) |
| not_found | `קוד שובר לא נמצא` | leaking whether the code exists at another supplier | not_found / wrong_supplier as not_found to this user |
| unauthorized | `אין הרשאת ספק` | | unauthorized |
| rate_limited | `יותר מדי סריקות, המתן רגע` | | rate_limited |

6. **History `/supplier/redemptions`.** Visible: this supplier's scans including failures. Forbidden: outstanding unredeemed book (policy hides live liability until `redeemed_by_supplier_id` is set). Logged: already in redemptions.

7. **Owner/manager extras.** Visible: orders list, members admin (owner). Scanner cannot grant owner and cannot see split terms. Logged: `audit_log` on member changes.

---

## 5. content_uploader creates and publishes a product

No money access. Cannot change `profiles.role`. Cannot read `order_items.platform_percent` as a finance tool.

### Steps

1. **Admin/catalogue form** (uploader). Visible: Hebrew fields, type coupon vs physical, prices in ILS input that save as agorot, `coupon_expiry_days` if coupon, images + `alt_he`, supplier, category. Forbidden: skipping `platform_percent` on publish of a physical; silent 5% from a fossil column; customer DOM preview that shows the percent.

2. **Save draft.** Visible: `status = draft`. Forbidden: public `/product/{slug}` (404). Logged: `audit_log` created/updated.

3. **Branch: validation.** Missing coupon price / percent / supplier / category / image: cannot go `active`. Visible: Hebrew field errors (`מחיר בקניון נדרש`, etc.). Logged: none on failed zod.

4. **Submit / approve** depending on `approval_status`. Uploader may not self-approve if the gate requires admin. Visible: pending. Logged: submitted_at, approval_note.

5. **Publish `status = active`.** Visible on storefront: PDP/category. Forbidden: mutating historical orders. Logged: status_change; search outbox reindex (`search_index_outbox`, product_id not FK so delete still reindexes).

6. **Later edit of `platform_percent`.** Visible: new value on the form. Forbidden: any UPDATE to existing `order_items.platform_percent`. Logged: product updated; new checkouts only.

7. **Branch: type change on a live SKU.** Visible: new PDP template. Forbidden: rewriting old `order_items.product_type`. Logged: product updated.

---

## 6. Admin adjusts `platform_percent` and reviews orders

### Adjust percent

1. **Open product in admin.** Visible: current `platform_percent` and split pair (sums 100). Forbidden: a storefront preview that leaks the field. Logged: page in admin.

2. **Change the percent.** Visible: confirmation that this applies to **future** sales. Forbidden: a control labelled "apply to past orders". Logged: `audit_log` updated + old/new values (no secrets).

3. **Branch: products still NULL percent.** Visible: cannot publish / cannot checkout those SKUs. Forbidden: backfill with a guessed 10%. Logged: checkout refusals `physical_no_percent`.

### Review orders

4. **`/admin/orders`.** Visible: `{ref}`, `{price}`, status chips, customer identity for support. Forbidden: Cardcom PAN; treating `escrow_held` as a live tab (removed). Logged: admin views if audited.

5. **Order detail.** Visible: lines with snapshotted money, voucher codes for coupon lines, refund actions. Forbidden: editing `platform_percent` on the line to "fix" a later catalogue change. Logged: refund/cancel via actions + `audit_log` manual_override when used.

6. **Branch: refund redeemed coupon.** Visible: blocked copy (deal consumed at the business). Forbidden: un-redeem. Logged: refusal; wallet credit only if a separate goodwill path exists.

7. **Branch: payment succeeded, webhook lost.** Visible: pending until Indicator/cron/`GetLpResult`. Forbidden: telling the customer they were not charged if Cardcom captured. Logged: `payment_webhook_events` gap; reconciliation_gap ops mail. Recovery: EDGE-CASES § webhook.

8. **Role change.** Visible: `profiles.role` picker. Forbidden: target user changing themselves; admin demoting the last super_admin without a plan. Logged: `permission_change`.

---

## 7. What every journey forbids (checklist)

| Actor | Never sees / never does |
|---|---|
| customer | `platform_percent`, cost, escrow, other users' QR, raw Cardcom token |
| coupon_partner | other suppliers' live voucher book, split %, payout-as-if-coupon-prepaid |
| content_uploader | ledger writes, role escalation, historical percent rewrite |
| admin | silent percent default, apply-to-history, PAN in logs |

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-09-07 | Six journeys: coupon buy, physical buy, customer QR, partner scan, uploader publish, admin percent + orders |
