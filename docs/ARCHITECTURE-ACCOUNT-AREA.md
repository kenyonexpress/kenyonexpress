# ארכיטקטורה: אזור אישי (`/account/**`)

מפרט מחייב לאזור האישי: auth, routes, RLS, כסף (אגורות, No Escrow), קופונים/QR, ארנק, tokens.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` פר מוצר בלי default; אגורות integer.

מסמכים קשורים:

```
docs/ARCHITECTURE-ACCOUNT.md
docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-CART-CHECKOUT.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| D1 | כל `/account/**` דורש session: `supabase.auth.getUser()` ב-layout; אורח מופנה ל-`/login?next=...`. |
| D2 | **Google OAuth בלבד** לכניסה לאזור (אין סיסמה native בשלב זה). Logout → `/login`. |
| D3 | **RLS הוא הגבול.** קריאות account עם request-scoped user client; לא `adminClient` ל-PII לקוח. |
| D4 | **כסף:** `total_agorot`, `balance_agorot`, `amount_agorot` בלבד; תצוגה `formatIlsFromAgorot` / `he-IL`. אין float. |
| D5 | **No Escrow:** אין copy "נאמן", "held", "J5" באזור אישי; קופון = "שולם באתר" + "יתרה בעסק". |
| D6 | **`platform_percent`** נצרך מ-`order_items` בזמן הזמנה; אין default גלובלי בתצוגת account. |
| D7 | **Wallet:** קרדיט פנימי בלבד; אין cash-out, אין P2P; לקוח לא כותב ל-ledger. |
| D8 | **Tokens:** brand + last4 + expiry בלבד; עמודת `cardcom_token` לא SELECTable ל-authenticated. |
| D9 | **Vouchers:** טבלה קנונית `vouchers`; lifecycle `issued` → `redeemed` (aliases `active`/`used` בתוויות בלבד). |
| D10 | **Addresses:** soft-delete (`deleted_at`); הזמנות שומרות `address_id` היסטורי. |
| D11 | **UI:** RTL, Heebo, container ~1320px, `#fed700`, tokens מ-`account.css` / `refs/`. |

### 1.1 Routes

| Route | תפקיד |
|---|---|
| `/account` | סקירה: ארנק, הזמנה אחרונה, קופונים פעילים |
| `/account/details` | שם/טלפון; email read-only; logout |
| `/account/orders` | רשימת הזמנות (50 אחרונות) |
| `/account/orders/[id]` | פירוט + שורות + QR קופונים |
| `/account/coupons` | לשוניות: פעיל / נוצל / פג + QR + קוד LTR |
| `/account/wallet` | יתרה + ledger (קריאה בלבד) |
| `/account/addresses` | CRUD כתובות (soft-delete) |
| `/account/tokens` | אמצעי תשלום: default / delete |
| `/account/privacy` | ייצוא / מחיקה (Identity companion) |
| `/account/notifications` | העדפות (Identity companion) |

### 1.2 Nav (עברית)

| href | label |
|---|---|
| `/account` | סקירה |
| `/account/details` | הפרטים שלי |
| `/account/orders` | ההזמנות שלי |
| `/account/coupons` | הקופונים שלי |
| `/account/wallet` | הארנק שלי |
| `/account/addresses` | כתובות |
| `/account/tokens` | אמצעי תשלום |

### 1.3 RLS (חובה)

| טבלה | לקוח |
|---|---|
| `profiles` | SELECT/UPDATE own |
| `orders`, `order_items` | SELECT own |
| `vouchers` | SELECT own |
| `wallet_accounts`, `wallet_entries` | SELECT own; אין INSERT/UPDATE |
| `payment_tokens` | SELECT own (ללא `cardcom_token`) |
| `user_addresses` | CRUD own, SELECT `deleted_at IS NULL` |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| Guest checkout עם "אזור אישי" ללא auth | היסטוריה, קופונים וארנק דורשים זהות; אורח רואה voucher במייל בלבד. |
| Escrow / "יתרה מוחזקת" ב-UI wallet | מודל No Escrow; wallet = קאשבק/קרדיט אתר בלבד. |
| `platform_percent` default 15% בתצוגה | אין default; רק snapshot מ-`order_items`. |
| PAN / CVV ב-account לעריכה | PCI; רק tokens Cardcom. |
| כתיבת יתרת ארנק מ-UI | שינוי ledger רק payment finalize / admin RPC. |
| Email+password במקביל ל-Google | scope נוכחי Google-only; מורכבות identity ו-support. |

---

## 3. סכמת DB

**אין DDL חדש.** טבלאות קיימות (מיגרציות مرجع):

| טבלה | עמודות מרכזיות | שימוש account |
|---|---|---|
| `profiles` | `id`, `full_name`, `phone`, `email`, `avatar_url` | `/account/details` |
| `orders` | `id`, `user_id`, `total_agorot`, `status`, `paid_at`, `deleted_at` | orders list/detail |
| `order_items` | `order_id`, `product_id`, `quantity`, `unit_price_agorot`, `platform_percent` | snapshot כסף |
| `vouchers` | `id`, `user_id`, `order_id`, `code`, `status`, `expires_at`, `supplier_id` | coupons + QR |
| `wallet_accounts` | `user_id`, `balance_agorot` | wallet strip |
| `wallet_entries` | `account_id`, `amount_agorot`, `kind`, `reference_type`, `reference_id` | ledger |
| `payment_tokens` | `user_id`, `brand`, `last4`, `exp_month`, `exp_year`, `is_default`, `cardcom_token` (hidden) | tokens |
| `user_addresses` | `user_id`, `label`, `city`, `street`, `deleted_at` | addresses |
| `account_deletion_requests` | `user_id`, `status` | banner pending (Identity) |

Enums רלוונטיים: `order_status`, `voucher_status` (`issued`, `redeemed`, `expired`, `refunded`, `void`).

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | Session פג באמצע `/account/coupons` | redirect login + `next`; אין flash של QR ב-cache ציבורי |
| E2 | הזמנה `pending` ללא `paid_at` | מוצגת ברשימה; קופונים לא `issued` עד paid |
| E3 | קופון `redeemed` | טאb "נוצל"; QR לא actionable; טקst "נוצל ב-{date}" |
| E4 | `balance_agorot` שלילי (לא אמור) | תצוגה 0 + alert ops; לקוח לא רואה מינוס |
| E5 | מחיקת token default | promote token אחר או empty state "הוסף אמצעי תשלום" |
| E6 | soft-delete address בשימוש בהזמנה ישנה | order detail מציג snapshot; לא מופיע ב-CRUD list |
| E7 | race: שני tabs logout | idempotent; redirect login |
| E8 | RLS deny (bug) | empty state + log; לא leak "exists but forbidden" |
| E9 | refund אחרי `issued` | voucher → `refunded`; UI לא מציג כפעיל |
| E10 | `account_deletion_requests.status=pending` | banner + ביטול בקשה (Identity) |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | Coupons page: tabs + QR vs live | track ב-UI; spec כאן מחייב | 2026-08-12 |
| O2 | Nav logout visibility | logout ב-`/account/details` + header | 2026-08-12 |
| O3 | Google-only login UX copy | הודעה בעברית "התחברות עם Google בלבד" | 2026-08-12 |
| O4 | order joins תחת service role | target: pure RLS; interim מסונן `user_id` | 2026-08-12 |

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | Account-area binding summary (`arch/docs-queue`) |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
