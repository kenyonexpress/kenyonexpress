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
