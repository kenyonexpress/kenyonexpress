# Glossary Hebrew to English

Code identifiers stay English. User-facing text stays Hebrew. This file is the join so the two never drift.

Status: binding for this worktree. Docs only. Narrower commerce meanings: `docs/GLOSSARY.md`. UI strings: `docs/COPY-HE.md`. Field contracts: `docs/DATA-CONTRACTS.md`.

Direction:

- Columns, types, files, events, roles in code: **English snake_case / camelCase**
- Buttons, chips, emails, toasts: **Hebrew**
- Latin brand `KenyonExpress` may appear in UI as `קניון אקספרס` / `קניון EXPRESS` (live). Do not invent a third spelling in a new screen.

---

## 1. Money

| Hebrew (UI) | English (code) | Notes |
|---|---|---|
| אגורה, אגורות | `agorot`, type `Agorot` | Only unit for storage and math. Integer. `packages/money.ts` |
| שקל, ש״ח, ₪ | ILS, `shekels()`, `formatIls`, `formatAgorot` | Display only |
| נקודת בסיס | `bp`, `Bp`, `percent_bp` | 100% = 10000. **Not** `platform_percent` |
| אחוז פלטפורמה | `platform_percent` | Whole-percent `numeric`. Snapshot on `order_items`. Never in customer DOM |
| מחיר בקניון | `kenyon_price`, coupon on-site amount | Live wording |
| מחיר רגיל | `full_price`, `compare_at_price_ils` | Strike |
| מחיר הקופון | `coupon_price_*`, `paid_on_site` / `coupon_price_agorot` | Absolute, not a percent |
| שווי מלא, סה"כ שווי | `face_value_agorot` | Worth at the business |
| יתרה לתשלום בבית העסק | `balance_due_agorot`, `remaining_amount_due_agorot` | Cash at till |
| לתשלום באתר עכשיו | `paid_on_site_agorot` | Cardcom charge |
| עמלה | `commission_agorot` | Platform keep |
| לתשלום לספק | `supplier_due`, `supplier_immediate_agorot` | Coupon path: **0** |
| קאשבק | `cashback_*` | Snapshot then later wallet credit |
| ארנק | `wallet_accounts`, `wallet_entries` | Not `wallet_balances` (fossil) |
| מע״מ | `VAT_RATE_BP` (1800) | On platform commission only |
| נאמנות | do not use | No escrow. Dead columns stay 0 |
| תשלום לספק / פאוט | do not use on coupon path | No `supplier_payouts` table |

---

## 2. Catalogue and PDP

| Hebrew (UI) | English (code) |
|---|---|
| דיל | informal coupon product |
| קופון | `product_type = 'coupon'` |
| מוצר פיזי | `product_type = 'physical'` |
| שירות | `product_type = 'service'` (settles like physical) |
| מנוי, חיוב חוזר | `product_type = 'recurring'`, `subscriptions` |
| קטגוריה, מחלקות | `categories`, `HeroCategorySidebar` |
| ספק, בית עסק | `suppliers` (not `vendors`) |
| ספק (ישן) | `vendors` |
| סניף | `supplier_branches` |
| מלאי | `stock_quantity` |
| אזל מהמלאי | out of stock, ATC disabled |
| נותרו `{n}` | `StockScarcity` |
| כמות | `quantity` |
| הוספה לעגלה | `AddToCartButton` |
| קנה עכשיו | buy now, `--pdp-buy` |
| הוסף למועדפים | `WishlistButton` |
| מחלקות | departments nav |
| בחר אזור | `RegionMenu` |
| מיון | category `sort` / `orderby` |

---

## 3. Cart, checkout, orders

| Hebrew (UI) | English (code) |
|---|---|
| עגלה | `carts`, `/cart` |
| סל הקניות שלך ריק כרגע | empty cart |
| המשך לתשלום | `CartCheckoutButton` |
| קופה / תשלום | `/checkout`, `beginCheckout` |
| פרטים אישיים | checkout step `details` |
| כתובת למשלוח | step `address`, `needsAddress` |
| ביקורת הזמנה | step `review` |
| אישור ותשלום | step `confirm` |
| הזמנה | `orders` |
| שורת הזמנה | `order_items` |
| צילום מצב | snapshot (immutable after pay) |
| סגירת הזמנה | `finalizeOrder` |
| ממתינה לתשלום | `pending` |
| שולמה | `paid` |
| הושלמה | `split_executed` (chip) |
| מומשה | `redeemed` (order chip) |
| זוכתה | `refunded` |
| בוטלה | `cancelled` |
| התשלום לא הושלם | `/checkout/failed` |
| אישור הזמנה | `/checkout/return` title |
| מאמתים את התשלום... | pending reconcile |
| התשלום הצליח! | paid return H1 |
| קוד לא תקין | promo `discount_campaigns` (not a voucher) |

Avoid saying `cart_items` (there is no table; lines are `carts.items` jsonb).

---

## 4. Vouchers and scan

| Hebrew (UI) | English (code) |
|---|---|
| שובר, קופון (שכבר נקנה) | `vouchers` |
| קוד | `code`, `formatCouponCode` |
| QR | `qr_payload`, `KEV1` |
| פעיל | `issued` + not past `expires_at` |
| מומש | `redeemed` (`coupon_status` old: `used`) |
| פג תוקף | `expired` |
| בוטל | `cancelled` |
| הוחזר | `refunded` (voucher) |
| מימוש | redemption, `redeem_voucher()` |
| אשר ומַמֵש | `/scan` confirm (niqqud in source; also `אשר וממש`) |
| אשר מימוש | `/redeem/[token]` confirm (not the scan string) |
| קיבלת מתנה | `/gift/[token]` (URL is the credential) |
| מימוש שובר | `/redeem/[token]` page title |
| השובר מומש בהצלחה | scan success |
| השובר כבר מומש | `already_redeemed` |
| תוקף השובר פג | `expired` at scan |
| קוד שובר לא נמצא | `not_found` / wrong supplier |
| אין הרשאת ספק | `unauthorized` |
| הציגו את הקוד בבית העסק | voucher page hint |
| שותף קופון | brief `coupon_partner` = `supplier_members` `scanner` |

Do not name a new `user_role` `coupon_partner`.

---

## 5. People and access

| Hebrew (UI) | English (code) |
|---|---|
| לקוח | `customer` |
| מעלה תוכן | `content_uploader` |
| מנהל | `admin`, `is_admin()` |
| תמיכה | `support`, `is_support()` |
| חבר צוות ספק | `supplier_members` |
| בעלים / מנהל / סורק | `owner` / `manager` / `scanner` |
| האזור האישי | `/account` |
| ההזמנות שלי | `/account/orders` |
| הקופונים שלי | `/account/coupons` |
| יתרת הארנק | wallet balance |
| כניסה לחשבון | `/login` |
| יצירת חשבון | `/signup` |
| שחזור סיסמה | `/forgot-password` |

---

## 6. Chrome and legal

| Hebrew (UI) | English (code) |
|---|---|
| דילוג לתוכן הראשי | `SkipLink` |
| הסכמה לאיסוף נתוני שימוש | `ConsentBanner` |
| אישור / לא תודה | consent grant / deny |
| הצטרפו לרשימת הדיוור | `NewsletterSignup` |
| הרשמה | newsletter submit |
| תנאי שימוש | terms |
| פרטיות | privacy |
| וואטסאפ | WhatsApp, never rebranded yellow |
| ניווט ב-Waze | Waze stays Latin |
| הדף שחיפשתם לא נמצא | 404 |
| משהו השתבש אצלנו | 500 |
| פירורי לחם | breadcrumb |

---

## 7. Email and WhatsApp (subjects stay Hebrew)

| Hebrew subject / line | English kind |
|---|---|
| ההזמנה שלך התקבלה | `order_paid` |
| הקופון שלך מוכן | `voucher_issued` |
| הקופון מומש | `voucher_redeemed` |
| פג מחר / בעוד `{n}` ימים | `voucher_expiring` |
| נכנס לך קאשבק | `cashback_credited` |
| הזיכוי שלך בוצע | `refund_completed` |
| ברוכים הבאים ל-KenyonExpress | `welcome` |
| מכירה חדשה ב-KenyonExpress | `supplier_sale` (not a payout) |
| מצאתי משהו שווה ב-KenyonExpress | product share (`buildShareMessage`) |

---

## 8. Platform words (docs and ops, not UI)

| Hebrew (if spoken) | English |
|---|---|
| אבטחה ברמת השורה | RLS |
| תור יוצא | outbox (`notification_outbox`, `search_index_outbox`) |
| תור מכתבים מתים | DLQ |
| מפתח אידמפוטנטיות | `idempotency_key` |
| שער הפיקסלים | `compare.mjs`, under 11% at 380 / 768 / 1440 |
| פרוקסי | `src/proxy.ts` (not `middleware.ts`) |
| מיגרציה ממתינה | `migrations/pending` (verify against `schema_migrations`; the folder name can lie) |

---

## 9. Forbidden pairs (drift)

| Do not put in UI | Do not put in new SQL |
|---|---|
| Escrow, נאמנות, trustee | new writes to `escrow_held` |
| `platform_percent` as a customer label | `platform_bp` on products (only `discount_campaigns.percent_bp`) |
| `used` as a voucher chip | `coupon_redemptions` table name |
| `cart_items` in a sentence | `user_roles` join table |
| English 404 | `notifications_outbox` (wrong name) |
| Sticker price in a coupon share | float ILS in money columns |

---

## 10. Revision

| Date | Change |
|---|---|
| 2026-09-07 | HE to EN map for money, catalogue, cart, vouchers, roles, chrome, mail, ops |
