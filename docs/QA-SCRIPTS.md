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

### 0.1 Prove the environment before you trust a single finding

Section 0 says what to run. This is how to confirm it happened, because every
trap below has already produced a believed-but-wrong result somewhere in this
document set, and each fails **silently**.

| # | Check | How | Why |
|---|---|---|---|
| 1 | The server is serving **this** build | compare the server process start time against `.next/BUILD_ID` mtime | A stale `next start` held the port and served an older build. The same commit scored **45.53%** against it and **11.07%** against a current server, and nothing in the output said which to believe. |
| 2 | It is a production build | no `nextjs-portal` route badge in the corner | The dev overlay renders a ~150x45 box that exists on no production page. |
| 3 | Brand colours resolve | a yellow newsletter bar in the footer, not a white one | Turbopack caches compiled CSS by **content hash**. A dev server started before a `@theme` colour was added keeps serving CSS without that colour's utilities, and `touch` does not clear it. If `bg-brand-secondary` is transparent, restart the server; do not go looking for the bug in a component. |
| 4 | Fonts have settled | reload and watch for a reflow | A capture taken before the stylesheet parsed scored 95.07% on a page whose layout was fine. |
| 5 | You know which consent state you are in | check `html[data-consent]` in the inspector | The banner is `fixed bottom-0` and tall on a phone; it made an enabled `/login` control unclickable. Body padding is reserved in three tiers (14.5rem, 8rem, 7rem). |
| 6 | **No stale service worker is answering** | DevTools > Application > Service Workers. Unregister anything registered, then hard-reload | A worker that claimed the origin keeps answering for chunk URLs that no longer exist, **and it survives switching branches**. `ServiceWorkerRegistrar` registers only in production for exactly this reason, so a worker on a dev origin was left by an earlier session. |

**Checks 1 and 6 produce identical symptoms and have different fixes.** A stale
`next start` and a stale service worker both serve you a build that is not the
one you just made. Restarting the server fixes the first and does nothing for
the second. If a change you can see in the source is not on the page after a
restart, unregister the worker before you look anywhere else.

**Findings recorded without steps 1 to 3 confirmed are not findings.** Note the
width against every one, as the header of this file already requires, and note
the build too.

### 0.2 Three false-positive patterns this document set has already paid for

Not QA steps, but the same mistake in three costumes. Each looked like a defect
and was not, and each was found by a scan that did not open the file:

| Scan | Reported | Reality |
|---|---|---|
| RTL lint over CSS | two `.css` violations | both were **comment prose**: `right-edge-to-icon`, and a comment saying a physical `margin-left` there *would be* the bug |
| Buttons without `aria-label` | 22 components | every one carries a **visible Hebrew label**, which is an accessible name |
| `<h1>` per page | nine pages with two or more | all **mutually exclusive branches**, and one match was inside a comment |

The rule that falls out, and it applies to manual QA as much as to a grep:
**open the thing before you write it down.** A count is a lead, not a finding.



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
| 7 | Wishlist heart | **DOES NOT SHIP (pass 14).** `product/WishlistButton.tsx` exists and nothing imports it; there is no `WishlistToggle` in the tree. There is no way to add to the wishlist from a PDP, so this row cannot pass. Verify it is still absent, then either wire the component in or delete this row. `/account/wishlist` itself does render. **If it is wired in, it will say `הוסף לרשימת המשאלות` / `הסר מרשימת המשאלות`, not the `מועדפים` wording ERROR-COPY specifies, and it raises no toast at all** (pass 21, ERROR-COPY 19) |
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
| 8 | **In-flight state is announced** | press any submit with a screen reader on: the busy state must be spoken, not only shown. 24 of 33 stateful components (73%) currently do not announce (`docs/COMPONENT-INVENTORY.md` 12.1); `cart/AddToCartButton` is the highest-traffic one |
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

### 10b.1 Reachability, which is where these pages actually fail

A city page renders correctly and is still effectively invisible. Both findings
below are recorded in `docs/SEO-PLAN.md` sections 4.1 and 5.1; these are the
manual steps that confirm or clear them.

| # | Step | Pass |
|---|---|---|
| 7 | **At 1440**, open the region dropdown in the masthead | seventeen regions, each linking `/city/{hebrew-slug}` percent-encoded |
| 8 | **At 380 and 768**, open the hamburger drawer | **currently there is no region entry at all.** Record whether that is intended. Below `xl` the pages have no inbound link |
| 9 | Fetch `/sitemap.xml` and search for `city` | **currently zero entries.** Seventeen indexable pages with self-canonicals are absent |
| 10 | With JS disabled, or as a crawler at a mobile viewport, find any path to a city page | none exists today. Steps 8 and 9 are the two independent fixes and neither substitutes for the other |
| 11 | Copy a city URL from the dropdown and paste it into a plain-text editor | the Hebrew slug is percent-encoded, and the encoding matches the page's own `canonical` (`encodeURIComponent`). A mismatch makes any future sitemap entry useless |

Step 11 is the one that is easy to get wrong later: the slug is Hebrew, so the
sitemap and the canonical must encode it identically or they describe two URLs.

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
| 18 | **`/products` has a canonical** | `curl -s {base}/products \| grep -c 'rel="canonical"'` | **Known gap:** it has none (SEO-PLAN 1.2.2). Nineteen routes set one and this is not among them |
| 19 | `/products?sort=…` canonicalises to `/products` | `curl -s "{base}/products?sort=price-asc" \| grep canonical` | Follows from 18. Until 18 is fixed, every sort URL is its own indexable page |

Rows 5, 6, 13, 17, 18 and 19 are expected to **fail today**. They are listed as
checks rather than as a to-do so that the launch pass produces a decision on
each, rather than rediscovering them.

Row 18 is the cheapest of the six: `/products` is indexable, sits at sitemap
priority 0.9 (joint-highest after `/`), reads `sort` from `searchParams`, and the
fix is one line of the same shape `/category/[slug]` already uses. Row 15 above
does not catch it, because "check any indexable route" passes on the eighteen
routes that do have one.

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

### 12.6 Heebo shutter vs Arial LCP (pass 15)

`docs/DESIGN-SYSTEM.md` §12.2. These are two different questions.

| # | Step | Pass |
|---|---|---|
| 1 | `compare.mjs --page=home` at 380 | Heebo metrics (script waits for fonts). Not an Arial picture |
| 2 | Lighthouse LCP on home | may name Arial. `display: swap`, `preload: false`. Do not preload Heebo just to make this row say Heebo |
| 3 | USP bar at 374 | items stack. Longest Hebrew word, not a round 400 |
| 4 | Live slider English | `SIMPLY THE BEST` reversed is the reference's content debt. Our Hebrew headlines stay |
| 5 | Deals card hover at 1440 | live stays flat (`box-shadow: none`). Ours may lift (`--shadow-card-hover`). Do not fail the pixel log for that lift. Fail if the card grows a radius |

## 13. Perceived performance, by eye (pass 17)

Lighthouse on localhost simulates LCP over a graph and has already reported a
real 2.7s improvement as noise, so it is not the instrument here. These are the
things a person can see, each tied to a decision recorded in
`docs/SEO-PLAN.md` section 7.1.

| # | Step | Pass |
|---|---|---|
| 1 | Hard-reload `/` and watch the first paint | Text paints in **Arial**, then re-renders in Heebo. That is `display: 'swap'` plus `preload: false` working as intended. **A flash of Arial is not a defect here**; it is the trade that keeps Heebo off the critical path |
| 2 | Reload with the consent banner **undecided** | The banner is present and body padding is reserved for it. Nothing below it jumps once it appears: CLS stays 0 |
| 3 | Reload with `html[data-consent="decided"]` | The banner is **absent from layout entirely**, not transparent. Inspect it: `display: none`. If it is `opacity: 0` or `visibility: hidden` the LCP fix has been undone |
| 4 | Compare the two states' first paint | The undecided state's largest element must not be the banner after the reserved padding is applied |
| 5 | Throttle to slow 3G and reload `/` | Nothing above the fold waits on a font. Product images below the fold may lazy-load; the hero must not |
| 6 | Reload a PDP at 380 | The gallery reserves its box before the image arrives. A collapsing image block is the same defect that shortened a live capture by 1762px |

### 13.1 The three ways to undo the LCP work without noticing

Each of these looks like a cleanup and is a regression:

1. **`preload: true` on Heebo.** Removes the Arial flash and puts the font back
   on the critical path. `layout.tsx:42` carries a comment specifically to stop
   this.
2. **`opacity: 0` or `visibility: hidden` on the decided consent banner.** Looks
   equivalent to `display: none` and is not: an element at `opacity: 0` stays in
   the **LCP candidate set**, so the banner becomes the largest paint again.
3. **Removing the reserved body padding** because "the banner is fixed, it does
   not affect layout". It does not affect layout; the padding exists so the
   *rest of the page* is not underneath a control the shopper needs. Removing it
   reintroduces the phone bug where an enabled `/login` toggle was unclickable.

If any of the three is proposed, the evidence against it is in
`src/app/globals.css` around the `data-consent` rules and in
`docs/SEO-PLAN.md` 7.1.2.

## 14. Copy consistency, one purchase end to end (pass 19)

`docs/ERROR-COPY.md` has counted four voice inconsistencies against the source.
None is visible when reading one screen; all four are visible walking one
purchase. This is that walk, for a Hebrew reader.

Do it in one sitting, as one shopper, writing down the exact wording each time.

| # | Screen | Trigger | Note the wording of |
|---|---|---|---|
| 1 | `/signup` | submit with a 6-character password | the minimum stated. `auth.ts` says **6**, `validations/auth.ts` says **8**. Which one did you see? |
| 2 | `/login` | submit empty | the "fill this in" verb |
| 3 | PDP | write a review while signed out | `צריך להתחבר…` — and the retry verb, which is **singular** `נסה` here |
| 4 | Cart | add more than stock allows | the per-line warning. It should name the remaining quantity |
| 5 | Cart | apply a bad coupon | the rate-limit noun: `ניסיונות` |
| 6 | Cart | mutate quickly, hit the limit | the rate-limit noun: `פעולות`. Different noun, same screen area |
| 7 | Checkout | leave a field blank | the "fill this in" verb again. Compare with step 2 |
| 8 | Checkout | enter a landline | the phone message. Three variants exist; only one says what to do |
| 9 | Checkout | force a server failure if you can | **is a raw Postgres message on screen?** See `ERROR-COPY` 12.3 |
| 10 | `/contact` | submit and fail | the retry verb: **plural** `נסו` here, against step 3's singular |

### 14.1 What you should end up with

Four lists, and each should be short:

1. **Verbs for "fill this in".** Five exist in the codebase
   (`יש למלא`, `יש להזין`, `נא למלא`, `נא להזין`, `שדה חובה`). How many did one
   purchase show you?
2. **`נסה` versus `נסו`.** 20 singular against 50 plural repo-wide. Steps 3 and
   10 are the pair that makes it obvious.
3. **The password minimum.** One number, or two?
4. **Em-dash separators.** 27 exist, 14 of them in `auth.ts`, so steps 1 and 2
   are where you meet them.

### 14.2 The honeypot check, which needs two submissions

`docs/ERROR-COPY.md` 16.3: the supplier-lead form answers a honeypot hit with
`תודה, קיבלנו את הפרטים ונחזור אליכם.` and a real submission with the same
sentence **plus `בהקדם`**.

| # | Step | Pass |
|---|---|---|
| 1 | Submit `/suppliers` normally | note the exact success string |
| 2 | Submit again with the hidden `company` field filled (devtools) | **the two strings must be byte-identical** |

They currently are not, and that is the whole finding: a decoy that answers
differently is a decoy that can be identified, after which it catches nothing.

### 14.3 Sentences assembled from JSX fragments

`docs/ERROR-COPY.md` 20 found that **655 Hebrew strings exist only as JSX text**,
not as quoted literals, and that JSX splits a sentence around every
interpolation. The extracted fragments include things like `או`,
`, או לבטל את המנוי.` and `(שולמו לו כבר`.

That has three consequences a manual pass is the only way to catch:

| # | Step | Pass |
|---|---|---|
| 1 | Read every sentence containing an interpolated value **out loud, in full** | it is a sentence, not three fragments that happen to sit together |
| 2 | Check the **space** either side of an interpolation | JSX strips whitespace at a tag boundary. `הזמנה{id}אושרה` and `הזמנה {id} אושרה` look identical in the source and different on screen |
| 3 | Check the **bidi boundary** at each fragment edge | a fragment edge is exactly where a Latin or numeric run meets Hebrew, which is where `docs/RTL-PITFALLS.md` section 4 says punctuation migrates |

Step 3 is the one that connects the two documents. A fragment boundary is not a
typographic detail: it is a **bidi run boundary**, and the trailing period of a
Hebrew sentence that ends on an interpolated order id will move to the wrong end
without isolation. That defect is invisible in the JSX, invisible to a grep, and
obvious on screen to anyone reading Hebrew.

So: for every screen in the walk above, if the sentence contains `{`, read the
rendered output rather than the source.

### 14.4 Why this is a QA pass and not a lint

Every one of these is a **correct** string in isolation. No scan can flag them,
because nothing is misspelled, nothing is wrong, and each file is internally
consistent. They are only visible to someone who meets them in sequence, which
is exactly what a shopper does and what a per-file review does not.

## 15. Open findings across the eight documents (pass 23)

Eleven passes have recorded findings in eight files. Nothing has been changed in
`.ts`, `.tsx`, `.sql` or `.json` by those passes, by design, so every item below
is **open**. This is the one place they are together, ordered by what it costs to
leave them.

### 15.1 Reaches a customer

| # | Finding | Where | Fix |
|---|---|---|---|
| 1 | **Raw Postgres and Cardcom messages render on the checkout page.** Five strings interpolate `${err.message}` and `CheckoutForm.tsx:920` prints `{formError}` verbatim inside `role="alert"` | `ERROR-COPY` 12.3 | keep the Hebrew sentence, log the upstream text |
| 2 | **The supplier-lead honeypot is detectable.** The decoy success differs from the real one by `בהקדם` | `ERROR-COPY` 16.3 | make the two byte-identical |
| 3 | **Two password minimums.** `auth.ts` says 6, `validations/auth.ts` says 8 | `ERROR-COPY` 13.1 | one number |
| 4 | **Seventeen region pages are unreachable below `xl`** and absent from the sitemap | `SEO-PLAN` 4.1, 5.1 | a mobile link **and** a sitemap entry; neither substitutes |
| 5 | **`/products` has no canonical** while indexable at sitemap priority 0.9 and taking `sort` params | `SEO-PLAN` 1.2.2 | one line |
| 6 | **PDP add-to-cart is yellow at 380 where live is slate** with a 6px corner | `DESIGN-SYSTEM` 4.0 | real pixel cost at `--width=380` |

### 15.2 Reaches an operator

| # | Finding | Where |
|---|---|---|
| 7 | **`APPLY-ORDER.md` says "ONE PENDING FILE"** and never mentions 169 or 170 | `MIGRATION-REVIEW` 3b |
| 8 | **`analytics_cron.sql` would run its rollup five minutes before 162's expiry sweep**, inverting its own precondition | `MIGRATION-REVIEW` 3d |
| 9 | **162's failures are invisible**: nothing reads `net._http_response`, and the `scheduler` check only asserts the secret exists | `MIGRATION-REVIEW` 1.3a |
| 10 | **Support has no landing path.** `adminLandingPath` sends every non-admin to `/admin/products`, which support cannot open | `ROLE-MATRIX` 3.2 |
| 11 | **`api/debug/sentry` is unguarded** and exists to throw | `ROLE-MATRIX` 11.4 |

### 15.3 Costs a future pass rather than a user

| # | Finding | Where |
|---|---|---|
| 12 | **Section 2.2's landmarks name no selectors**, so two of twelve cannot be re-measured | `UI-PARITY-LOG` 21 |
| 13 | **Letter-spacing and shell height are unpriced**, so an unknown part of every score belongs to them | `UI-PARITY-LOG` 19 |
| 14 | **`pending/` has no checksum file**, so an approval cannot be pinned to bytes | `MIGRATION-REVIEW` 3f |
| 15 | **`idx_orders_user_status` must survive** the 170 contract migration; the other six singles must not | `MIGRATION-REVIEW` 3.2b |
| 16 | **Wishlist copy is specified one way and implemented another**; `מועדפים` versus `רשימת המשאלות` | `ERROR-COPY` 19 |
| 17 | **`[15px]` is written by hand eleven times** where `p-gutter` exists | `COMPONENT-INVENTORY` pass 22 |
| 18 | **The home title contradicts section 0 of its own document**, with a U+2014 that document forbids | `SEO-PLAN` 2.1.3, 9.1 |

### 15.4 How to use this

Items 1 to 6 are the ones a shopper can meet. Items 7 to 11 change what a
person does. Items 12 to 18 make the next pass cheaper.

**Every one is recorded with its evidence at the reference given**, so none needs
re-deriving. What none of them has is a decision, and most are one line of code
or one line of Hebrew.

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
| 2026-09-07 | Pass 15: PDP wishlist heart marked not shipped; QA §3 row 7 cannot pass until a caller exists |
| 2026-09-07 | Pass 16: deals card hover lift is allowed Electro; fail a radius, not a missing shadow |
| 2026-09-07 | Pass 15: city reachability steps (10b.1). The pages render fine and have no mobile link and no sitemap entry; also the Hebrew-slug encoding check |
| 2026-09-07 | Pass 16: environment verification before a QA session (0.1) and the three false-positive patterns this set has already paid for (0.2) |
| 2026-09-07 | Pass 17: perceived-performance steps by eye (13), plus the three ways to undo the LCP work while believing you are cleaning up |
| 2026-09-07 | Pass 18: added the stale-service-worker check to 0.1. It produces the same symptom as a stale next start and has a different fix |
| 2026-09-07 | Pass 19: copy consistency as one walked purchase (14), including the two-submission honeypot check |
| 2026-09-07 | Pass 20: crawl rows 18 and 19, the /products canonical gap. Row 15 does not catch it because checking "any indexable route" passes on the eighteen that have one |
| 2026-09-07 | Pass 21: named the strings WishlistButton will actually produce if wired in, which are not the ones ERROR-COPY specifies |
| 2026-09-07 | Pass 22: JSX-fragment steps (14.3). A fragment boundary is a bidi run boundary, invisible in the source and obvious on screen |
| 2026-09-07 | Pass 23: consolidated all open findings from eleven passes across the eight documents into one list (15), ordered by what it costs to leave them |
