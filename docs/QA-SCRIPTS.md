# QA scripts (manual)

Manual QA per flow. This is what a person does with eyes and a keyboard. Automated gates (`pnpm test`, type-check, lint, `compare.mjs`) are named so they are **not** repeated as click-tests.

This worktree does not run `pnpm`. Execute the production-build steps from the **main project root** when a human is ready. Widths: **380, 768, 1440** plus the extras in §0.

Status: scripts. Docs only.

Companions: `docs/UI-QA-CHECKLIST.md`, `docs/ERROR-COPY.md`, `docs/ROLE-MATRIX.md`, `docs/UI-PARITY-LOG.md`, `docs/DESIGN-SYSTEM.md` §8.

Record each finding with: route, width, element, expected, seen, screenshot. A finding without a width is not actionable.

---

## 0. Setup

Production build only (`pnpm build` then `PORT=3311 pnpm start`). Dev overlay and stale Turbopack CSS are false bugs.

Consent: run every flow once **undecided** and once `html[data-consent="decided"]`. The banner steals clicks on a phone (passwordless toggle on `/login` was visible and unclickable).

Toast: add to cart once per session. Toasts have no URL.

RTL: hamburger is visual **right** at 380 (inline-start). Cart is visual left. Skip link `דילוג לתוכן הראשי` is first focus.

Extra widths: 320 (PDP buy row), 374/375 (USP stack), 560 (checkout labels), 640 (consent row), 992 (checkout column), 1024 (still **handheld** header; live switches at `xl`).

---

## 1. Home (Electro home-v7)

Gate: `compare.mjs --page=home` under 11 percent. Manual sees what the gate cannot (motion, Hebrew wrap, consent).

| # | Step | Pass |
|---|---|---|
| 1 | Load `/` at 380, 768, 1440 | Hero 213 / 495 / 613. No desktop-tall hole on a phone |
| 2 | Info bar | `ברוך הבא לעולם של קניון Express` on home only. Inner pages shorter |
| 3 | No search field in header or drawer | Fail if a 534px yellow-border field appears |
| 4 | Category strip | absent at 380; in-hero at 768+ |
| 5 | Feature bar | 31px empty strip at 380; 134px from 768; at 374 items stack |
| 6 | Deals grid | 1 / 2 / 4 columns. Card footer stacks at 380, one line from 768 |
| 7 | Prices | `#dc3545` (or home-grid `#c93636`). Not yellow text. `{price}` LTR |
| 8 | ATC / card | hover goes black on purchase family; ink on `#fed700` is `#333e48` |
| 9 | Footer | handheld accordion, not a 1155px stack of desktop columns at 380 |
| 10 | Reduced motion | slider does not auto-advance |
| 11 | Live title sanity | document title may be `קניון אקספרס`. Hero must not be the only place Electro English remains without a content ticket |

---

## 2. Category and `/products`

Gate often **refuses** (catalogue). Manual still runs.

| # | Step | Pass |
|---|---|---|
| 1 | H1 Hebrew (`חנות` on archive) | one H1 |
| 2 | Grid 2 / 3 / 5 | card width ~175 / 230–234 / 234 |
| 3 | Sort | featured then `name_he`; URL sort is noindex |
| 4 | Empty | `לא נמצאו מוצרים התואמים את הבחירה שלך.` |
| 5 | Pagination | arrows mirror; current page `aria-current` |
| 6 | 404 slug | Hebrew 404, link home/products **not** `/search` |

---

## 3. Product (coupon vs physical)

Gate refuses when related-card counts differ. Do not delete related cards to pass.

| # | Step | Pass |
|---|---|---|
| 1 | Coupon split | `לתשלום באתר עכשיו` vs `יתרה לתשלום בבית העסק`. No percent |
| 2 | Physical | single `{price}`, buy-now `#c94b28`, no split |
| 3 | ATC 380 | slate / white, radius 6, full width |
| 4 | ATC 768+ | `#fed700` / `#333e48` (not white on yellow), radius 25.2 |
| 5 | Qty | plain number, no fake +/- if live has none |
| 6 | Unsellable | `המבצע הסתיים` or `הקופון אינו זמין לרכישה` or `אזל מהמלאי`; ATC dead |
| 7 | Wishlist heart | on PDP, not header. `הוסף למועדפים` / toast `נוסף למועדפים` |
| 8 | WhatsApp share | coupon share must not use sticker face as the only price; no `{code}` to the business |
| 9 | Supplier | Waze, phone LTR, mark not recoloured |

---

## 4. Cart → checkout → pay → fail / success

| # | Step | Pass |
|---|---|---|
| 1 | Empty cart | `סל הקניות שלך ריק כרגע.` CTA חזור לחנות |
| 2 | Line unavailable | warning; checkout `aria-disabled`; Enter does not bypass |
| 3 | Guest cart survives login | merge, no wipe |
| 4 | Coupon-only | address step skipped |
| 5 | Physical | address required; Hebrew verify errors |
| 6 | Wallet clamp | only when authenticated and balance > 0; debit cannot exceed min(balance, total) |
| 7 | Place order | yellow pill radius 50; terms tick; `aria-busy` |
| 8 | **Fail** Cardcom / back | `/checkout/failed`: `החיוב לא בוצע. אפשר לנסות שוב, העגלה שלך נשמרה.` Cart **not** empty. No voucher |
| 9 | Success pending | `מאמתים את התשלום...` until webhook. Do not 404 on a missing money column |
| 10 | Success paid | `התשלום הצליח!` `{ref}` LTR, on-site `{price}`, voucher cards, QR 264px, no `platform_percent` |
| 11 | Return coupon card | remainder `{price}` at business; WhatsApp of **this** coupon may include code (holder), never prefill to shop |

Keyboard: stepper `aria-current="step"`. Iframe titled. Escape from a failed iframe.

---

## 5. Account: wallet, coupons, wishlist (pass 8)

No `compare.mjs` page. Session required.

### 5.1 Wallet `/account/wallet`

| # | Step | Pass |
|---|---|---|
| 1 | H1 | `הארנק שלי` |
| 2 | Balance | `היתרה שלך` `{price}` in **heading ink**, not price red |
| 3 | Note | `קרדיט לשימוש באתר בלבד. לא ניתן למשיכה.` No withdraw button |
| 4 | Empty ledger | `עדיין אין תנועות בארנק.` |
| 5 | Credit / debit | `+{price}` / `-{price}` minus before shekel |
| 6 | Order link | `לצפייה` `#0062bd` |
| 7 | Query fail | no fake `₪0`; error banner |
| 8 | Direct PostgREST insert to `wallet_entries` | must **fail** (client read-only) |

### 5.2 Coupons `/account/coupons`

| # | Step | Pass |
|---|---|---|
| 1 | H1 / sub | `הקופונים שלי` + remainder-at-business sentence |
| 2 | List has **no QR** | codes LTR |
| 3 | Empty | `עדיין לא רכשת קופונים.` |
| 4 | Aliases | `/account/vouchers` and `/account/my-vouchers` redirect here |
| 5 | Open CTA | `הצגת הקופון ו-QR` → `/coupon/{id}` |
| 6 | Signed out on QR URL | `/login?next=…` not 404 |
| 7 | Other user’s UUID | 404, no leak |
| 8 | QR fail | `לא ניתן להציג QR כרגע. הקריאו את הקוד לקופאי.` |
| 9 | Wallet passes | omit buttons if not presentable |

### 5.3 Wishlist `/account/wishlist`

| # | Step | Pass |
|---|---|---|
| 1 | H1 | `רשימת המשאלות שלי` |
| 2 | Empty | long copy + `לכל המוצרים` → `/products` |
| 3 | Grid | 2 / 3 / 5 |
| 4 | Prices | `shekels(agorot())`, not `toLocaleString` on `price_ils` |
| 5 | Toggle fail | `הפעולה נכשלה.` |
| 6 | Header | **no** heart, **no** count badge (standing rule vs live YITH) |
| 7 | Cap 100 | Hebrew refusal |
| 8 | Inactive product | pruned, not a grey 404 card |

---

## 6. Gift and redeem

| # | Step | Pass |
|---|---|---|
| 1 | `GET /gift/{token}` | does **not** claim. Mail scanners stay inert |
| 2 | Button | `קבלת הקופון לחשבון שלי` on `#fed700` / `#333e48` |
| 3 | Pending | `מעביר את הקופון...` |
| 4 | Already claimed | `המתנה כבר נאספה` + link `/account/coupons` |
| 5 | `/redeem/{token}` | cashier only. Confirm `אשר מימוש` (not `אשר וממש`) |
| 6 | Success | `השובר מומש בהצלחה` + large remainder `{price}` |
| 7 | Double click | one redeem (idempotency key). Second: `השובר כבר מומש` |
| 8 | Wrong shop | `קוד שובר לא נמצא` (no hint it exists elsewhere) |
| 9 | `/scan` vs redeem | copy split preserved |

Roles: `docs/ROLE-MATRIX.md` §4.

---

## 7. content-uploader and admin (smoke)

| # | Step | Pass |
|---|---|---|
| 1 | Uploader | catalogue yes; orders / refunds / users / audit **no** |
| 2 | Cannot change `profiles.role` | including self |
| 3 | Publish physical without percent | blocked; no silent 5% |
| 4 | Change percent | future checkouts only; old `order_items` frozen |
| 5 | Admin refund redeemed coupon | blocked copy |
| 6 | Customer DOM preview | no `platform_percent` |

---

## 7b. Admin CRUD, the fifth flow the brief names

Section 7 is a six-row smoke test. The brief lists admin CRUD as a flow of its
own, so this is create, read, update and delete across the entities staff
actually manage.

**Roles:** `content_uploader` for catalogue (products, categories, reviews),
`admin` for everything else. Full matrix in `docs/ROLE-MATRIX.md` sections 2, 3
and 6.

### 7b.1 The invariant that spans every entity: every mutation is audited

`src/server/actions/admin/audit-required.test.ts` asserts that **every** module
under `src/server/actions/admin/` calls `writeAuditLog`, with exactly three
exemptions:

```
quick-search.ts    upload.ts    images.ts
```

Those three are read-only or produce no domain change. Everything else writes a
row carrying `actorId`, `actorRole`, `action` and `entityType`.

| # | Step | Pass |
|---|---|---|
| 1 | Perform any create, update or delete below | one `audit_log` row appears |
| 2 | Read the row | `actorId` is the signed-in staff member, not a service account |
| 3 | Perform a **read** (open a list, run quick-search) | **no** audit row. Reads are not mutations |
| 4 | Try to edit or delete an `audit_log` row | refused. It is append-only for every role, `service_role` included |

Step 4 is the one people skip. The append-only trigger is the reason the log is
worth anything in a dispute.

### 7b.2 Delete is soft, except for one entity

This is the asymmetry to test deliberately.

| Entity | Delete behaviour |
|---|---|
| Products | **soft only.** `deleted_at` plus `status: 'archived'` or `is_active: false`. Zero `.delete()` calls in `admin/products.ts` |
| Categories | **both exist.** `softDeleteCategory` sets `deleted_at`; `deleteCategory` issues a real `.delete()` |

| # | Step | Pass |
|---|---|---|
| 1 | Delete a product from the table | row disappears from listings; `deleted_at` set; the product still resolves for any historical order line |
| 2 | Bulk-delete products | same, via `admin.product.bulk_soft_delete`. Still soft |
| 3 | Delete a category from `CategoriesTable` or `CategoryTree` | the UI calls **`softDeleteCategory`**. Confirm it is the soft one |
| 4 | A category with children | decide and record what happens to the children. Do not assume cascade |
| 5 | A category holding active products | the products must not vanish from `/products` without a decision |
| 6 | Restore path | there is no restore UI. `deleted_at` is cleared in SQL only. Record that before deleting anything in a demo |

**`deleteCategory` (the hard one) is exported and has no UI caller.** Every
component path goes through `softDeleteCategory`. It remains a live server
action with a guard and no visible affordance, so it can still be invoked. Worth
knowing it exists; worth not wiring a button to it without deciding step 4
first.

### 7b.3 Products

| # | Step | Pass |
|---|---|---|
| 1 | Create as `content_uploader` | allowed. `requireSection('catalog','write')` |
| 2 | Create a **physical** product with no commission percent | blocked. No silent 5% default |
| 3 | Create a **coupon** product with no `kenyon_price` | blocked: `לא הוגדר מחיר קופון` |
| 4 | Money fields | integer agorot. A price typed as `19.99` must not become a float anywhere |
| 5 | Edit an existing product's percent | applies to **future** checkouts only. Existing `order_items` keep their captured value |
| 6 | Upload images | `admin/images.ts` and `upload.ts` are the two audit-exempt modules. Confirm no domain row changes |
| 7 | Save with an implausible discount (₪1 against ₪400) | see the guard in `src/lib/commerce/implausible-discount.ts`. It refuses at sale time; confirm the admin screen says something too |
| 8 | Same page as `support` | denied. `catalog` is `none` for support |

### 7b.4 Categories

| # | Step | Pass |
|---|---|---|
| 1 | Create with a parent | tree renders at the right depth |
| 2 | Reorder | `updateCategorySortOrder` writes an audit row |
| 3 | Hebrew name containing a price (`עד ₪99`) | the shekel sign must not migrate left of the digits. See `docs/RTL-PITFALLS.md` |
| 4 | Duplicate slug | refused with Hebrew copy, not a Postgres unique-violation string |

Step 4 is worth performing on every entity in this section: `docs/ERROR-COPY.md`
section 12.3 records five money-path strings that interpolate a raw Postgres
message into Hebrew and render it verbatim. Check the admin forms are not doing
the same.

### 7b.5 Coupons, suppliers, vendors, discounts

| # | Entity | Guard | Step |
|---|---|---|---|
| 1 | Coupon deals | `requireAdminSession` | create, edit, and confirm `content_uploader` is refused on `/admin/coupons` while **allowed** on `/admin/coupons/codes` (recorded inconsistency, ROLE-MATRIX 3.1 finding 1) |
| 2 | Suppliers | `suppliers:write` = admin | create; confirm `support` can **read** the list and not the new-supplier form |
| 3 | Vendors | `requireAdminPage` | admin only at every step |
| 4 | Discounts | `discounts:write` = admin | create; confirm `support` sees the list (`discounts:read`) and cannot open `/admin/discounts/new` |
| 5 | Reviews | `catalog:write` | `content_uploader` may moderate. Confirm approving a review updates any `AggregateRating` only when approved count > 0 |

### 7b.6 Users, the one CRUD with a three-layer guard

| # | Step | Pass |
|---|---|---|
| 1 | `admin` assigns `content_uploader` | allowed |
| 2 | `admin` assigns `admin` | **refused**, three times over: `assignableRoles`, the action's own check, and a DB trigger from migration 035 |
| 3 | `super_admin` assigns `admin` | allowed |
| 4 | Any staff changes **their own** role | refused |
| 5 | `support` opens `/admin/users` | allowed, read only |
| 6 | `support` attempts a role change | refused: `users` is `read` for support |

Step 2 is the one to actually attempt at all three layers if the environment
allows, because two of the three are application code and only the trigger
survives a bug in the other two.

## 8. coupon-partner scan

| # | Step | Pass |
|---|---|---|
| 1 | No membership | `/supplier/access-denied` (not a login loop) |
| 2 | Manual entry always there | camera fail: `לא ניתן לגשת למצלמה` |
| 3 | Rate limit | `יותר מדי סריקות, המתן רגע` |
| 4 | History | own supplier, including failures |
| 5 | No split %, no live unredeemed book | |

### 8.1 Every refusal outcome, and the trap in them

Nine outcomes, verified against `OUTCOME_MESSAGES` in
`src/app/api/supplier/vouchers/redeem/route.ts` (see `docs/ERROR-COPY.md` 6.1).
A till that has only ever been tested on `success` and `already_redeemed` has
not been tested.

| # | Set up | Expected copy | Status |
|---|---|---|---|
| 1 | valid unredeemed voucher | השובר מומש בהצלחה | 200 |
| 2 | scan the same code twice | השובר כבר מומש | 409 |
| 3 | voucher past its expiry | תוקף השובר פג | 409 |
| 4 | **voucher cancelled by an admin** | השובר בוטל | 409 |
| 5 | **voucher whose order was refunded** | השובר הוחזר ללקוח | 409 |
| 6 | a code that does not exist | קוד שובר לא נמצא | 404 |
| 7 | **malformed QR / truncated payload** | בקשה לא תקינה | 400 |
| 8 | signed in, staffs nobody | אין הרשאת ספק | 401 |
| 9 | scan repeatedly past the ceiling | יותר מדי סריקות, המתן רגע | 429 |

**Rows 4, 5 and 7 are the ones normally skipped**, and row 5 is the one that
costs money: a refunded voucher is the case where the customer genuinely
believes the code is good, because they were holding it before the refund
happened.

**The 409 trap.** Four different outcomes share `409`. A till app that branches
on the HTTP status instead of on `outcome` will show one sentence for all four,
and will tell a customer holding a refunded voucher that it was "already
redeemed". Test rows 2, 3, 4 and 5 and confirm **four different sentences**, not
four 409s.

### 8.2 The authorization is in the database, so test it there

`redeem_voucher()` derives the supplier from `supplier_members` via
`auth.uid()`. The route only carries identity. Two checks a UI pass misses:

| # | Step | Pass |
|---|---|---|
| 1 | Member of supplier A scans a voucher belonging to supplier B | refused, and the refusal is logged against A |
| 2 | Member of **two** suppliers scans their **second** supplier's voucher | **accepted.** A pass that only tests the first membership hides this |
| 3 | Same scan from the web portal (cookie) and the till app (bearer) | identical outcome. Both must reach Postgres with an identity |
| 4 | `staff_id` in the body set to another supplier's staff uuid | changes attribution only, grants nothing |

---

## 8b. Refund (admin), the flow the brief names and this file had no section for

Refund appeared only as two incidental rows (7.5 and 8.5). It is one of the
five flows the brief names and it moves money backwards, so it gets its own
script.

**Who:** `admin` / `super_admin` only. `src/server/actions/payments/refund.ts`
calls `requireAdminSession()`, which is stricter than the `payments:write`
section gate the other money actions use, and stricter than `support`, which
has no `payments` access at all. A `content_uploader` cannot see the order page
to begin with.

**Where:** `/admin/orders/[id]`, via `OrderAdminActions.tsx`.

### 8b.1 The blocker check runs before anything else

`describeRefundBlockers()` answers "may this order be refunded at all", and the
admin screen must ask it **first** and show the reason beside the button. Three
blockers, each with fixed Hebrew copy:

| # | Condition | Copy | Notes |
|---|---|---|---|
| 1 | any voucher `status = 'redeemed'` | `{n} שוברים כבר מומשו בבית העסק. הערך נצרך ולא ניתן להחזיר אותו לכרטיס.` | `{n}` is a real count, not "some" |
| 2 | any voucher `status = 'expired'` | `{n} שוברים פגו. ערכם נזקף כפחת ולא חוזר לכרטיס.` | breakage, not a refund |
| 3 | no line can transition to `REFUND` | `אין שורות שניתן להחזיר: כולן כבר מומשו או שוחררו לספק.` **or** `אין שורות שניתן להחזיר בהזמנה הזו.` | **two different strings**: the first when lines exist but are stuck, the second when none are refundable at all |

| # | Step | Pass |
|---|---|---|
| 1 | Open a refundable order as `admin` | refund control enabled, no blocker text |
| 2 | Open one with a **redeemed** voucher | control blocked, blocker 1 verbatim, correct count |
| 3 | Open one with an **expired** voucher | blocker 2 verbatim. Expired is breakage: value does **not** return to the card |
| 4 | Open one already fully refunded | blocker 3, and the **second** variant (`...בהזמנה הזו`), because nothing is stuck |
| 5 | Open one whose lines are all released to the supplier | blocker 3, **first** variant (`...או שוחררו לספק`) |
| 6 | Same order as `support` | `/admin/payments` is denied; support has no `payments` access |
| 7 | Same order as `content_uploader` | cannot reach `/admin/orders` at all |

Step 4 versus step 5 is the one to actually perform. The two strings look
interchangeable and are not: the first names the reason, the second says there
is none to give.

### 8b.2 The cancellation fee is statute, not a setting

`computeCancellationFee(chargedAgorot, isDefectClaim)` returns the **lower of 5%
or ₪100**, and zero when the claim is for a defect.

| # | Step | Pass |
|---|---|---|
| 1 | Refund a ₪500 order, not a defect | fee ₪25 (5% is below the ₪100 cap) |
| 2 | Refund a ₪5000 order, not a defect | fee **₪100**, not ₪250. The cap binds |
| 3 | Refund a ₪2000 order, **defect claim** | fee **₪0** |
| 4 | Refund a ₪0 or negative charge | fee ₪0, no throw |
| 5 | Read the fee off the screen | integer agorot throughout. Never a `toFixed` float |

These are the Israeli distance-selling law's numbers. **If a QA run disagrees
with the statute, the statute is right and the constants change with a dated
note** (`CANCELLATION_FEE_CAP_AGOROT`, `CANCELLATION_FEE_BP`). Do not "fix" a
failing test by editing the expectation.

### 8b.3 Card versus wallet, and the order of operations

| # | Step | Pass |
|---|---|---|
| 1 | Refund an order paid fully by card | money returns to the card via Cardcom; `refund_destination` records card |
| 2 | Refund an order that used wallet credit | the wallet portion returns to the wallet, the card portion to the card. Two destinations, one refund |
| 3 | Cardcom declines the refund | Hebrew failure on screen, `capturePaymentError` with `stage: 'cardcom_refund'`, **no** ledger row claiming success |
| 4 | Refund succeeds but the follow-up queue fails | the customer is still refunded. Those steps are **queued, not called**, precisely because the card is already credited by then |
| 5 | Re-submit the same refund | no double credit |
| 6 | Check `audit_log` | one row naming the actor. `requireAdminSession()` proved who at the top of the action; the log must carry it |

Step 4 is the property worth understanding before testing: the code queues the
invoice and the notification rather than calling them inline, and its comments
say why twice. A failure after the card is credited must never be surfaced as a
failed refund.

### 8b.4 What a refund must never do

- Never pull card money back for a **consumed** voucher. `planOrderRefund`
  throws `RefundError('NOT_REFUNDABLE')` for redeemed or expired vouchers. The
  commercial answer there is goodwill wallet credit or a claim, and that is a
  decision, not a refund.
- Never show `platform_percent` to the customer.
- Never partially un-transmit a released supplier share: "half a deal cannot be
  un-transmitted." A partial refund still claws the released share back whole.
- Never tell the customer they were not charged when the capture succeeded and
  only the webhook was lost. That is the pending copy, not a refund.

## 9. A11y and RTL sweep (every flow)

| # | Step | Pass |
|---|---|---|
| 1 | Skip link | first tab, target `#main-content` |
| 2 | Focus visible | 2px, never yellow-on-yellow |
| 3 | Touch | 44px min (hamburger hit area padded) |
| 4 | Prices / phones / codes | LTR islands |
| 5 | Icons | arrows mirror; logo, WhatsApp, QR, hearts do **not** |
| 6 | 404 / 500 | Hebrew only |
| 7 | Consent | Accept / Decline equal weight |
| 8 | **In-flight state is announced** | press any submit with a screen reader on: the busy state must be spoken, not only shown. 24 of 38 stateful components currently do not announce (`docs/COMPONENT-INVENTORY.md` 12.1); `cart/AddToCartButton` is the highest-traffic one |
| 9 | **Visible label is the accessible name** | say the words on a button with voice control and it must activate. An `aria-label` that differs from the visible text breaks this |

---

## 10. Public supplier `/s/[id]`

Not `/suppliers` (join-us) and not `/supplier/login`. No pixel twin.

| # | Step | Pass |
|---|---|---|
| 1 | Active supplier | eyebrow `ספק`, one H1 = `name`, city then address (omit blanks) |
| 2 | Grid | 2 / 3 / 4 at 380 / 768 / 1440 (not category 5-up) |
| 3 | Count | `מציג תוצאה יחידה` or `מציג {from} עד {to} מתוך {total} תוצאות` |
| 4 | Empty active | H1 stays; `אין מוצרים פעילים לספק הזה כרגע.` |
| 5 | Inactive / bad id | 404 `ספק לא נמצא`, **noindex**. Must not show the old name |
| 6 | Cards | no `platform_percent`. Prices agorot formatter |
| 7 | JSON-LD | LocalBusiness only with real address+city. `@id` ends `#business` on `/s/{id}`. View source: no `/supplier/` in ld+json |
| 8 | Pagination | only if `totalPages > 1`; arrows mirror |
| 9 | Join-us `/suppliers` | marketing form, not a product grid twin of `/s/{id}` |

---

## 10b. City `/city/[slug]`

| # | Step | Pass |
|---|---|---|
| 1 | Known region | H1 `דילים ב{name}` |
| 2 | Has municipalities | chips; each → `/products?city={slug}` |
| 3 | Empty region | empty copy is **not** an error; CTA to catalogue |
| 4 | Unknown slug | 404 |
| 5 | JSON-LD | one BreadcrumbList. No invented LocalBusiness |
| 6 | Count of landings | seventeen. Fail if a new thin city was added without `REGIONS` |

---

## 10c. Legal and `/offline`

| # | Step | Pass |
|---|---|---|
| 1 | Footer links | 200, Hebrew H1, no third slug |
| 2 | Returns | no escrow, no numbered commission, redeemed = done |
| 3 | WP alias | 301 or 200 with one canonical |
| 4 | `/offline` | paints with network off; retry is a link; ink `#333e48` on `#fed700` |
| 5 | Offline robots | noindex, no JSON-LD |

---

## 8b. Refund (admin-initiated)

The brief names refund as a flow of its own and it had only passing mentions
(§7 row 5, §8 row 5). This is the script. Rules read from
`src/server/actions/payments/refund.ts` and `src/server/domain/orders/refund.ts`.

**Who:** `admin` / `super_admin` only. `refundOrder` calls `requireAdminSession`
first and returns `{ code: 'FORBIDDEN', error: 'אין הרשאה' }` to anyone else.
`support` cannot refund; `content_uploader` cannot see the order.

**The cancellation fee is legally capped and must never be improvised.** Israeli
distance-selling law: the fee is the **lower of 5% of the transaction or ₪100**.
In code, `CANCELLATION_FEE_BP = 500` and `CANCELLATION_FEE_CAP_AGOROT = 10_000`,
combined with `Math.min`. A tester who sees a fee above ₪100, or above 5% on a
small order, has found a legal defect, not a rounding bug.

| # | Case | Setup | Expect |
|---|---|---|---|
| 1 | Full refund, physical, in window | paid order, no defect claim | refunded minus the capped fee; order `status: refunded`; `refunded_at` set |
| 2 | Fee cap, large order | charge well above ₪2,000 | fee is exactly **₪100**, not 5% |
| 3 | Fee percentage, small order | charge under ₪2,000 | fee is exactly **5%**, not ₪100 |
| 4 | **Defect claim** | `isDefectClaim: true` | **zero fee.** Full amount returned |
| 5 | **Partial refund** | `partialAmountIls` set | **zero fee.** Only the named amount returns |
| 6 | Cancel before transmission | order not yet passed to the supplier | `cancelOnly: true`; the deal is cancelled rather than credited, and **no** cancellation fee is charged for a pass-on that never happened |
| 7 | **Idempotency** | run the same refund twice | second call finds the order already `refunded` and no-ops. `replay: true`. **Not** a double credit, not an error toast |
| 8 | Redeemed coupon in the order | voucher already scanned at the business | blocked. `הערך נצרך ולא ניתן להחזיר אותו`. The value was consumed at the till |
| 9 | Expired voucher in the order | voucher past its date | `ערכם נזקף כפחת ולא חוזר לכרטיס` |
| 10 | Every line already redeemed or released | mixed order, nothing refundable | `אין שורות שניתן להחזיר: כולן כבר מומשו או שוחררו לספק.` |
| 11 | Provider failure | Cardcom returns an error | `PROVIDER_ERROR`. Order **stays paid**. No partial state |
| 12 | Manual resolution | the state the code cannot settle alone | `MANUAL_RESOLUTION`. Must reach a human, never a silent success |
| 13 | Unknown order | bad id | `NOT_FOUND` |
| 14 | Wrong state | already refunded / never paid | `STATE_INVALID` |

### 8b.1 What must be true afterwards, every time

| Check | Where |
|---|---|
| `orders.status` = `refunded`, `refunded_at` set, `status_reason` = the reason given | order row |
| order items `settlement_status` and `item_status` = `refunded` | order_items |
| an `audit_log` row exists with `{ status: { from: 'paid', to: 'refunded' } }` | audit_log |
| a `refund_issued` outbox event, and a `supplier_debit` where the supplier had been credited | outbox |
| a `refund_completed` notification | notifications |
| the wallet ledger moved by exactly the refunded amount, and **only** if the destination was wallet | wallet |

Migration 148 added `refund_destination` (card or wallet). Confirm the money
went to the destination the UI told the customer it would, and that the two
never disagree.

### 8b.2 Money rules that apply to every row above

- Every figure is **integer agorot**. No `toFixed`, no float anywhere on this
  path. A fee of `₪99.99999` is a defect.
- The customer-facing copy must never say "you were not charged" for a refund
  that failed mid-flight. `MANUAL_RESOLUTION` exists precisely so that case is
  escalated rather than narrated.
- `platform_percent` never appears in customer-visible refund copy.

## 10d. Crawl and indexability checks (pre-launch)

None of this is visible in a browser at a glance, and every row below is a
**verified finding** from the pass 13 audits, not a hypothetical. Run these
against the production build before launch.

`{base}` is the deployed origin.

| # | Check | Command / where | Pass |
|---|---|---|---|
| 1 | `robots.txt` serves and names the sitemap | `curl {base}/robots.txt` | 12 disallow lines; `Sitemap: {base}/sitemap.xml`; `Host:` present |
| 2 | `/redeem/` is the **first** disallow | same output | It is a signed voucher token. An indexed one is somebody's coupon in a search result |
| 3 | `/products` is **not** disallowed | same output | Absent from the list |
| 4 | Sitemap parses and is non-empty | `curl {base}/sitemap.xml` | valid XML, `<urlset>` |
| 5 | **`/city/{slug}` appears in the sitemap** | grep the sitemap for `/city/` | **Known gap:** it does not today (SEO-PLAN 5.1 finding 1). Seventeen indexable pages are missing. Fails until fixed or until the plan changes |
| 6 | **`/offline` is noindex** | `curl -s {base}/offline \| grep -i 'name="robots"'` | **Known gap:** no robots directive anywhere in its chain (SEO-PLAN 5.1 finding 3). Either add `robots: { index: false }` or stop calling it noindex |
| 7 | `/search` is noindex | `curl -s "{base}/search?q=test" \| grep -i robots` | `noindex` present. It must **not** be in robots.txt: a blocked crawl never sees the noindex |
| 8 | `/gift/{token}` is noindex, nofollow | same method | both present |
| 9 | Every sitemap URL returns 200 | loop the sitemap | no 404, no redirect chain |
| 10 | No sitemap URL is also disallowed | cross the two lists | empty intersection |
| 11 | **Home `SearchAction`** | `curl -s {base}/ \| grep -c SearchAction` | **Unresolved conflict** (SEO-PLAN 3.9 finding 1): the code emits it, section 3.1 forbids it. Whichever way it is settled, this check must agree with the doc |
| 12 | If `SearchAction` stays, `/search?q=x` answers | `curl -sI "{base}/search?q=x"` | 200. A sitelinks searchbox pointing at a dead route is a promise broken in front of the user |
| 13 | `/s/{id}` JSON-LD | view source | **Known gap:** emits none (SEO-PLAN 3.9 finding 2). `LocalBusiness` is specified and unimplemented |
| 14 | Product JSON-LD price | view source on a coupon PDP | `Offer.price` is the **on-site** amount, `ILS`, and `platform_percent` appears nowhere |
| 15 | One canonical per page, self-referencing | any indexable route | exactly one `<link rel="canonical">` |
| 16 | No `hreflang` anywhere | `curl -s {base}/ \| grep -c hreflang` | `0`, deliberately (SEO-PLAN 1.1). Do not "restore" it |
| 17 | `api/debug/sentry` | `curl -sI {base}/api/debug/sentry` | **Known gap:** unguarded and exists to throw (ROLE-MATRIX 11.4). Confirm removed or gated |

Rows 5, 6, 13 and 17 are expected to **fail today**. They are listed as checks
rather than as a to-do so that the launch pass produces a decision on each,
rather than rediscovering them.

## 12. Auth, MFA, consent, and the two panel traps (pass 14)

These are click-tests the earlier flows assumed. Widths 380, 768, 1440 plus
1024 (handheld header) and 640 (consent row). Production build. Consent once
undecided and once decided.

### 12.1 Sign-in (`/login`, `/signup`, passwordless)

| # | Step | Pass |
|---|---|---|
| 1 | Skip link first | `דילוג לתוכן הראשי` |
| 2 | H1 | `כניסה לחשבון` / `יצירת חשבון` (COPY-HE `auth.login` / `auth.signup`) |
| 3 | Google / SMS / magic | all three present, Hebrew labels. Email placeholder `you@example.com` LTR |
| 4 | **Undecided consent at 380** | passwordless toggle is clickable. Fail if the banner steals the hit target (QA §0) |
| 5 | Fail copy | `הכניסה נכשלה` then retry. Do not copy U+2014 from source comments |
| 6 | Guest cart survives | add a line while signed out, log in, cart still has the line (merge, no wipe) |
| 7 | `next=` open redirect | `//evil.example` does not leave the site (`safeNextPath`) |
| 8 | Customer never sees MFA | after login, land on `next` or `/account`, **not** `/auth/mfa` |

### 12.2 Staff MFA (`/auth/mfa`)

| # | Step | Pass |
|---|---|---|
| 1 | Staff with TOTP, session `aal1` | `/admin/*` redirects to `/auth/mfa`, **not** `/login` (password half already passed) |
| 2 | Help copy | `הזן את הקוד מאפליקציית האימות שלך כדי להמשיך לפאנל.` |
| 3 | Unreadable MFA levels | gate **closed**, `/login` (ROLE-MATRIX §1.1) |
| 4 | Customer account | `/auth/mfa` is not in the shopper journey (ROLE-MATRIX §10.1) |
| 5 | Code field | `aria-label` `קוד אימות`, digits LTR |

### 12.3 Panel trap A: support and `/admin`

ROLE-MATRIX §3.1 finding 5. A support user denied a deep link is sent to
`/admin`, and `/admin` uses `requireStaffSession()`, which **excludes**
support, so they land on `/login`.

| # | Step | Pass |
|---|---|---|
| 1 | Sign in as `support` | can open `/admin/dashboard`, `/admin/orders` |
| 2 | Open `/admin/payments` | denied, should land somewhere useful inside the panel |
| 3 | **Fail if** the URL becomes `/login` while the session is still valid | that is the loop. Record route, width, expected `/admin/dashboard` or `/admin/orders`, seen `/login` |
| 4 | Sign in as `content_uploader` | `/admin` itself is allowed (catalogue). `/admin/dashboard` is **none**. Confirm they are not bounced to login |

This is a UX defect with an access-control cause. Do not "fix" it in this
worktree (markdown only). Do not close the finding because dashboard happens
to load when they bookmark it.

### 12.4 Panel trap B: coupon parent vs coupon codes

ROLE-MATRIX §3.1 finding 1. `/admin/coupons` is `requireAdminPage()`.
`/admin/coupons/codes` is `catalog`, which `content_uploader` holds as write.

| # | Step | Pass |
|---|---|---|
| 1 | Uploader opens `/admin/coupons` | denied (admin-only parent) |
| 2 | Uploader opens `/admin/coupons/codes` | **allowed** today. Record as the inconsistency, not as a product requirement |
| 3 | Uploader cannot refund, cannot assign `profiles.role`, cannot open `/admin/payments` | §7 |
| 4 | Uploader publish physical without `platform_percent` | blocked, no silent 5% |

Do not treat step 2 passing as a green catalogue test. It is the documented
inconsistency.

### 12.5 Header chrome at 1024 vs 1440

DESIGN-SYSTEM §11.1: handheld masthead through `lg` (1024). Desktop at `xl`
(1280). Compare shots 1440, so they never see this.

| # | Step | Pass |
|---|---|---|
| 1 | 1024 `/` | hamburger at visual right, no desktop nav row |
| 2 | 1280 `/` | masthead 110, no hamburger |
| 3 | 1440 `/` | same as 1280, hero 613, deals 4-up |
| 4 | 1024 `/checkout` | still one column if below 992; at 1024 the Electro two-column may appear while the **header** is still handheld. That mix is live's, keep it |

## 11. What not to test here

- Pixel percents (log them in `docs/UI-PARITY-LOG.md`)
- SQL policies (CI / `anon-catalog` / `wallet-rls`)
- Cardcom sandbox charges on production
- DNS cutover

## Revision

| Date | Change |
|---|---|
| 2026-09-07 | Manual scripts: home, catalogue, PDP, checkout fail/success, wallet, coupons, wishlist, gift/redeem, uploader, scan |
| 2026-09-07 | Pass 9: public `/s/[id]` including JSON-LD gate and 2/3/4 grid |
| 2026-09-07 | Pass 10: city landing empty vs 404 vs chips |
| 2026-09-07 | Pass 11: legal aliases and offline tile |
| 2026-09-07 | Scan flow: all nine redemption outcomes with statuses, the 409 collision trap, DB-side authorization checks; a11y sweep gains announce and voice-control rows |
| 2026-09-07 | Pass 12: refund flow script (8b). Fourteen cases, the legal fee cap (lower of 5% or 100 ILS), idempotency, and the six post-conditions |
| 2026-09-07 | Pass 12: refund flow added (8b). It is one of the five flows the brief names and had no section; three blockers with two distinct "nothing to refund" strings, the statutory cancellation fee, card vs wallet, and the queued-not-called property |
| 2026-09-07 | Pass 14: auth/MFA/consent click-tests; support `/admin` login loop; uploader coupon parent vs codes; header still handheld at 1024 |
| 2026-09-07 | Pass 13: crawl and indexability checks (10d). Seventeen rows, four of them expected to FAIL today, each tied to a verified pass-13 finding |
| 2026-09-07 | Pass 13: admin CRUD flow added (7b). Every mutation audited with three exemptions, delete is soft everywhere except one hard-delete category path with no UI caller, and the three-layer guard on role assignment |
