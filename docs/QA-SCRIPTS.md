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
