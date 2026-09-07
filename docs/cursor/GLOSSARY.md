# Glossary (cursor pack)

Hebrew and English as **this codebase** uses them. General commerce vocabulary is often wrong here. Root
`docs/GLOSSARY.md`
is a sibling; where they disagree, this pack follows the live tree on
`ke-cursor-docs`
(cashback credits at finalize; 172 is still a human apply; Next.js 16
`src/proxy.ts`;
browser cookie
`ke_session_id`
vs PostgREST
`session_id`).

Put a file path or identifier on its own line when you copy it.

---

## 1. Money

| English | עברית | Meaning here |
|---|---|---|
| Agora, agorot | אגורה, אגורות | 1/100 of a shekel. The only unit stored or calculated. Integer. 1 ₪ = 100 agorot. |
| Shekel, ILS | שקל, ש״ח | Display format. Never arithmetic. |
| Basis point, bp | נקודת בסיס | 1/100 of a percent. 10% = `1000`. 100% = `10000`. Type `Bp`. |
| Whole percent | אחוז שלם | `products.platform_percent` is 10 for 10%, not 0.10, not 1000. Convert with `percentToBp`. |
| Face value | שווי מלא / שווי הדיל | `face_value_agorot`. What the deal is worth at the business. |
| Coupon price | מחיר הקופון | `coupon_price_ils`. **Absolute shekel amount.** Never a percent of face. Missing → unsellable. |
| Kenyon price | מחיר קניון | `kenyon_price`. Site sticker vs `full_price` compare-at. |
| Full price | מחיר מלא | `full_price`. The **only** compare-at the implausible-discount guard reads. |
| Balance due | יתרה לתשלום בעסק | `balance_due_agorot` / `remaining_amount_due_agorot`. Cash at the counter. Never Cardcom. |
| Platform percent | אחוז פלטפורמה | Per-product, mandatory, no default, snapshotted onto `order_items`. |
| Commission | עמלה | `commission_agorot`. Platform keep. On a coupon this is the whole prepayment. |
| Supplier due / supplier immediate | לתשלום לספק | `supplier_immediate_agorot`. **Always 0 on a coupon.** Physical: `face - fee` by subtraction. |
| Cashback | קאשבק | Snapshotted on the line. **Credited in `finalizeOrder`** via `fn_wallet_transfer` (`order:<id>:cashback`). Not at scan. |
| Wallet | ארנק | Store credit. Payment source only. Reduces the card charge. Does not change commission. |
| Wallet account / entry | חשבון ארנק / פקודה | Live pair: `wallet_accounts`, `wallet_entries`. Signed amounts. Server write only. |
| Fossil wallet | ארנק מאובן | `wallet_balances`, `wallet_transactions`. 0 rows. Do not write. |
| VAT | מע״מ | 18%, `VAT_RATE_BP = 1800`. Extract by subtraction so `net + vat = gross`. Booked on platform commission only. |
| Settlement | הסדרה | Recording who got which part. Not a bank transfer to the partner. |
| Split | פיצול | Coupon 100/0. Physical percent then remainder. Row in `split_executions`. |
| Conservation | שימור סכום | DB CHECK: parts sum to the whole. `23514` if violated, including for service_role. |
| Snapshot | צילום מצב | Values copied onto `order_items` at `beginCheckout`. Settlement must not join live `products`. |
| Generation probe | בדיקת דור עמודות | `order-money-columns.ts`. Production is the **`ils`** generation. Wrong literal → `42703`. |
| Statutory fee cap | תקרת דמי ביטול | Integer CHECK: 5% of requested or ₪100, whichever is lower. 0 on `defect` / `duplicate_charge`. |

### Words that do not mean what you expect

**Escrow / נאמנות.** There is none. `escrow_holds` has 2 legacy rows and no writer. Do not say it on
`/legal/returns`.

**Payout / תשלום לספק.** No table in production. Coupon path owes the partner nothing. `admin/payouts.ts` is dead (`42P01`).

**Global platform rate.** Does not exist. No env, no default, no settings row.

---

## 2. Catalogue and people

| English | עברית | Meaning here |
|---|---|---|
| Coupon (product) | קופון | `product_type = 'coupon'`. Prepay absolute amount online, remainder in cash. |
| Physical | מוצר פיזי | Pay 100% online, ship. Residual is accounting. |
| Service | שירות | Schema. Settles like physical. |
| Recurring | מנוי | `subscriptions` / `subscription_charges`. Token charge. |
| Voucher | שובר | `vouchers`. The thing bought. One row per purchased unit. |
| Coupon code | קוד קופון | Ambiguous. May mean voucher short code, fossil `coupon_codes`, or a discount campaign. Prefer "voucher code" or "promo code". |
| Deal | דיל | Informal name for a coupon product on the storefront. |
| Supplier | ספק / בית עסק | `suppliers`. Honours the voucher. |
| Vendor | ספק (ישן) | `vendors`. Legacy. `coupon_deals` still FK here. |
| Branch | סניף | `supplier_branches`. |
| Coupon-partner | שותף קופונים | Pack role. Live: a `supplier_members` row. Often `profiles.role = customer`. |
| Scanner | סורק | `supplier_members.role` (or staff PIN). Not a `profiles.role`. |
| Staff PIN | קוד עובד | `supplier_staff`. Not a login. Wrong PIN does not hide the till. |
| Content-uploader | מעלה תוכן | `content_uploader`. Catalogue. No money. |
| Support | תמיכה | Live enum value. Read-expanded. Must not `refundOrder`. |
| Customer | לקוח | Default `profiles.role`. **Never** write `has_role('customer')` (true for every profile). |
| Admin / super_admin | מנהל | `is_admin()`. Money gates use this, not `is_support()`. |
| Master test product | מוצר מאסטר לבדיקה | Id `9bb347f8-03ec-48ce-8ff2-2503fb74c895`. ₪1 / ₪400. Guard blocks sale. 172 sets stock 0. Three other live products contain מאסטר and are real. |

---

## 3. Orders, pay, scan, refund

| English | עברית | Meaning here |
|---|---|---|
| Order | הזמנה | `orders`. One checkout. |
| Order item / line | שורת הזמנה | `order_items`. The money row. |
| Begin checkout | פתיחת קופה | `beginCheckout`. Snapshots money. Opens Low Profile or prepares token charge. Never trusts client prices. |
| Finalize | סגירת הזמנה | `finalizeOrder`. **Only writer of `orders.status = paid`.** Also credits cashback and may complete referral. |
| Low Profile | אייפריים כרטיס | Cardcom iframe. Unsigned callbacks. Trust `GetLpResult` only. |
| Token charge | חיוב טוקן | Saved card. `initiated → succeeded \| failed`. No `redirected`. |
| Webhook secret | סוד וובהוק | `CARDCOM_WEBHOOK_SECRET`. We generate it (`openssl rand -hex 32`). Compared current **and** retiring, constant time. |
| Dead letter | מכתב מת | Charged, API-verified, `processed_at` still null. |
| Stranded payment | תשלום תקוע | Same class. Cron `/api/cron/stranded-payments`. |
| Redemption / scan | מימוש / סריקה | `issued → redeemed`. Arbiter: RPC `redeem_voucher`. Second path: `redeemAdminVoucher` (incident only). |
| Lookup | בדיקה בלי מימוש | Inspect without consume. |
| Wrong supplier | בית עסק לא נכון | Outcome `wrong_supplier`. Compare membership, not a client id. |
| Refund ground | עילת החזר | `distance_sale_14d`, `defect`, `service_not_provided`, `duplicate_charge`, `extended_window`, `goodwill`. |
| Refund to card | החזר לאמצעי המקור | Only while every voucher on the line is still `issued`. |
| Refund to wallet | זיכוי ארנק | After consume / expiry / goodwill. Different money movement. Does not un-scan. |
| Kill switch | מתג קופה | `CHECKOUT_ENABLED` exact string `true`. Anything else closes the till. |
| Mock / sandbox | מדומה / סנדבוקס | `CARDCOM_USE_MOCK` must not be set in Production. `CARDCOM_SANDBOX=true` is a boot-fail there. |

---

## 4. Platform, RLS, deploy

| English | עברית | Meaning here |
|---|---|---|
| RLS | אבטחה ברמת השורה | On every public table. The only DB stop on money writes: authenticated still has I/U/D grants on 56 relations. |
| `anon` / `authenticated` / `service_role` | | Postgres roles. `service_role` BYPASSRLS. Server only (`src/lib/supabase/admin.ts`). |
| Pack four roles | ארבעת תפקידי החבילה | customer, content-uploader, coupon-partner, admin. Live enum also has `vendor`, `support`, `super_admin`. |
| SECURITY DEFINER | | Function runs as owner. 61 of 72, pinned `search_path`. |
| Deny-all | חסימה מלאה | RLS on, no matching policy. Tightest lock. Not a gap. |
| Proxy | פרוקסי | `src/proxy.ts`. Next.js 16 replacement for `middleware.ts`. Export name must be `proxy`. |
| Guest session cookie | עוגיית אורח | UUID. Only anon write identity for `carts`. |
| Referral cookie | עוגיית הפניה | Last well-formed `?ref=` wins. Claim later, not in the proxy. |
| Outbox | תור יוצא | Same transaction as the cause. `notification_outbox`, `search_index_outbox`. |
| DLQ | תור כשל | After retries. |
| Meilisearch | | Search **engine**. Not a search product. Header field exists for Electro refs (ADR 0010). Unset → ILIKE, index jobs no-op success. |
| QStash | | Optional job transport. Signature JWS, two keys. Else inline worker. |
| Upstash Redis | | Optional rate limit. Else Postgres `check_rate_limit` (service_role only after 127). |
| R2 | | Cloudflare object store. Signed PUT. Public read via `R2_PUBLIC_BASE_URL`. |
| Pixel gate | שער פיקסלים | Diff vs live refs, under 11% at 380 / 768 / 1440. |
| fra1 | | Vercel region. |
| Two Cloudflare zones | שני אזורים | Live NS `derek` / `elma`. Staged `ignat` / `tess` is a silent no-op. H0. |
| Apex | דומיין ראשי | `kenyonexpress.co.il`. Still WordPress until H8. First real charge is on `kenyonexpress.vercel.app`. |
| Pending migration | מיגרציה ממתינה | File in `migrations/pending/`. **172 is outstanding** (stock the master row to 0). Older root glossary text that says "pending is a lie" is stale for 172. |
| `wp_import` | סכמת ייבוא | Shadows `public` names. Always schema-qualify. |
| Drizzle | | In `package.json`. **Not used at runtime.** `supabase-js` is. |
| Till app | אפליקציית קופה | `apps/mobile`. Same RPCs. Not a Cardcom merchant. Must not embed service_role. |

---

## 5. Routes that look like synonyms and are not

| Path | Meaning |
|---|---|
| `/coupons` | Public listing. |
| `/coupon/[id]` | Signed-in voucher surface. Proxy-gated. |
| `/supplier/scan` | Partner till. Proxy-gated under `/supplier*`. |
| `/scan` | Same till, **not** proxy-prefixed. Page must self-gate. |
| `/legal/returns` | Canonical returns copy. RSC. Not an API. |
| `/refund_returns` | Storefront alias of the same copy. |
| `/checkout` | Guest allowed. |
| `/checkout/frame-return` | Cardcom iframe return. Must stay ungated. |
| `/api/health` | `{ ok, database }` only. |
| `/api/ready` | Dependency readiness. 503 when down. |
| `/api/cron/health` | Seven checks. 401 without Bearer is a **pass**. |

---

## 6. Error codes you will see

| Code | Meaning here |
|---|---|
| `23514` | CHECK or status-guard failed. Triggers fire for service_role too. |
| `42501` | Permission denied (RLS or GRANT). Anonymous catalogue after a bad helper revoke. |
| `42703` | Missing column. First payment dead-letter if money literals are the old generation. |
| `42P01` | Undefined table. Payout actions. |
| `42883` | Undefined function. |
| `22P02` | Invalid enum. Brief refund aliases stored raw. |
| `401` | Cron/webhook secret miss. Safe direction. |
| `403` | Section / CSV. CSV must be plain text, not a login HTML redirect. |
| `404` | Apple Wallet missing creds; debug routes when off. Not 403 (403 confirms existence). |
| `429` | Rate limit. Scan 30/min/user. PIN 15/hour/staff. |

---

## 7. Terms to avoid

| Do not say | Say instead |
|---|---|
| Escrow, trustee, נאמנות, "we release money to the supplier" | Remainder is cash at the partner. Platform kept the prepayment. |
| Immediate card refund | Up to 14 business days after approval. |
| `cart_items` | `carts.items` jsonb |
| `middleware.ts` | `src/proxy.ts` |
| `packages/money.ts` | `src/lib/money.ts` |
| `platform_bp` on products | `platform_percent` (whole percent) |
| `notifications_outbox` | `notification_outbox` |
| Coupon "used" | Voucher `redeemed` |
| `has_role('customer')` | `user_id = auth.uid()` |
| Global 10% | Fail the product if percent or coupon price is missing |

---

## 8. Hebrew UI strings (do not invent synonyms)

Storefront is
`he-IL`,
`dir=rtl`.
Examples this pack depends on:

| String | Where |
|---|---|
| הוסף למועדפים / הסר ממועדפים | Wishlist heart (P2) |
| עדיין אין מוצרים במועדפים | Empty wishlist |
| אין הרשאה | Admin action without section |
| השובר מומש ידנית | `redeemAdminVoucher` success |

Error copy lives in
`docs/ERROR-COPY.md`.
Do not translate legal without counsel (P5).

---

## 9. Acronyms

| Short | Long here |
|---|---|
| RSC | React Server Component. Catalogue reads. No public REST duplicate. |
| RPC | Postgres function via PostgREST. `redeem_voucher`, `fn_wallet_transfer`, helpers. |
| ADR | Architecture decision record under `docs/adr/`. |
| SKU | Catalogue row. ~80 live. |
| PDP | Product detail page `/product/[slug]`. |
| GMV | If it appears on a dashboard it must be a safe integer of agorot. |
| SecureStore | Hardware-backed session store on the till app. Not AsyncStorage. |
| Remainder agora | Leftover 1 agora when splitting a line into N vouchers. First unit absorbs it. |
| `consume_order_stock` | Finalize RPC. Failure must not un-pay. |
| `reportPurchase` | Server purchase event at finalize, deduped on order id. |

---

## 10. Scan outcomes and voucher statuses (enums)

`voucher_scan_outcome` (eleven values, Hebrew to the till, English to machines):

`success`,
`already_redeemed`,
`expired`,
`cancelled`,
`refunded`,
`wrong_supplier`,
`not_found`,
`invalid_signature`,
`invalid_request`,
`unauthorized`,
`rate_limited`.

Replay with the same idempotency key returns the first outcome. Same key, different body:
`invalid_request`
(not an oracle).

`voucher_status`:
`issued`,
`redeemed`,
`expired`,
`cancelled`,
plus
`refunded`
as used on the refund path. There is **no** status trigger. Terminal states stay terminal.

---

## 11. Cookies, telemetry, deletion (after items 11–20)

| English | עברית | Meaning here |
|---|---|---|
| Guest browser cookie | עוגיית אורח בדפדפן |
`ke_session_id`
(
`GUEST_SESSION_COOKIE`).
httpOnly, 30 days. Identifies the guest to Next. |
| Guest PostgREST cookie | עוגיית אורח ל-PostgREST | Constructed
`Cookie: session_id=<uuid>`.
What RLS reads. Not the jar. |
| Anonymous id | מזהה אנונימי | Analytics:
`ke_session_id`
parsed →
`anonymous_id`.
Not a login. |
| Types-ahead | טיפוסים לפני הסכימה |
`database.ts`
has tables production may not. Payouts. |
| Pending number collision | התנגשות מספר מיגרציה | Same `\d{3}_` twice in
`migrations/pending/`
(169–172). Full filename. |
| Anonymize | הפיכה לאנונימי |
`fn_anonymize_user`
(150) or TS fallback. Profile row stays for FKs. |
| Soft-delete auth | מחיקה רכה של התחברות |
`auth.admin.deleteUser(id, true)`.
Hard delete orphans orders. |
| Audit IP sweep | מחיקת IP ביומן | 157:
`fn_audit_retention_sweep`,
NULL after 365 days. WHO/WHAT remain. |
| ntfy | התראת טלפון | Money interrupt. Default topic is guessable. No amounts. |
| Axiom | אקסיום | Optional searchable copy of
`log.ts`
JSON. Must not fail checkout. |
| PostHog | פוסטהוק | HTTP `/capture/`, no SDK. Not the ledger. |
| QStash | קיו-סטאש | Optional search index queue. Else inline. |
| ILIKE fallback | חיפוש ILIKE | Search without Meilisearch. Not a product. |
| `proxy` | פרוקסי | `src/proxy.ts`
export name on Next 16. Not
`middleware.ts`. |
| Hobby cron silence | שתיקת cron ב-Hobby | Vercel runs two jobs, ignores the rest, no error. Why Actions exists. |
| Confirmation phrase | משפט אישור מחיקה |
`מחק את החשבון שלי`.

---

## 12. Terms from the 100-item queue (2026-09-07)

| English | עברית | Meaning here |
|---|---|---|
| vendor | ספק (ערך enum) | `profiles.role`. **Not** till access. |
| coupon-partner | שגיאת שם בתיעוד | Use `supplier_members`. |
| member_role | תפקיד בחברות | owner / manager / scanner |
| pay_at_business | יתרה בעסק | face − coupon prepaid; never through platform |
| default_split_percent | שדה שאסור לקופה | Prefill leftover. Not a global rate. Remove. |
| constructed cookie | עוגייה בנויה | `Cookie: session_id=<uuid>` to PostgREST |
| CancelOnly | ביטול לפני שידור | Same Israel calendar day as charge |
| types-ahead | טיפוסים לפני הסכימה | `escrow_holds`, `payout_statements` may exist in types only |
| wave index | מדד גלים | `docs/cursor/waves/WAVE-INDEX.md` toward v7.0.0-rc1 |

Typed, trimmed, not fuzzed. |
