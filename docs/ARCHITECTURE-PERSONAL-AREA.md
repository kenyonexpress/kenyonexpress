# ארכיטקטורה: אזור אישי (`/account/**`)

מסכי לקוח מחובר: הזמנות, קופונים, ארנק קאשבק, וניווט RTL.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. מקדמת קופון באתר נשארת אצל הפלטפורמה. יתרה בבית העסק מחוץ לפלטפורמה.

מסמכים קשורים:

```
docs/ARCHITECTURE-ACCOUNT-IDENTITY.md
docs/ARCHITECTURE-ACCOUNT-WALLET.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/CONTRADICTIONS.md
```

Stack: Next.js `(account)`, Server Components, Supabase Auth + RLS, agorot integer, RTL + Heebo.

---

## 1. החלטה

| # | הכרעה |
|---|---|
| PA1 | כל `/account/**` דורש session. אורח → `/login?next=...`. |
| PA2 | כניסה ראשית: Google OAuth. OTP לפי IDENTITY. |
| PA3 | RLS הוא הגבול. user client בלבד; אין service role במסכי לקוח. |
| PA4 | קופונים = `vouchers` (לא כתיבה ל-`coupon_codes`). Alias: `/account/vouchers` → `/account/coupons`. |
| PA5 | ארנק = קרדיט פנימי בלבד. אין משיכה, P2P, cash-out. |
| PA6 | כסף ב-DB: agorot. UI: ₪ ב-`he-IL`, `Asia/Jerusalem`. |
| PA7 | קופון: שולם באתר + יתרה בבית העסק (snapshots). פיזי: `platform_percent` snapshot. |
| PA8 | אין PAN/CVV. `cardcom_token` לא ב-SELECT ל-authenticated. |
| PA9 | התנתקות → `/login`; ניקוי cache QR ב-logout (PWA). |
| PA10 | אין cancel/refund מהאזור האישי ב-v1. |
| PA11 | `AccountNav` RTL: `dir="rtl"`, תוויות עברית. |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| `/account` פתוח לאורח עם "preview" | PA1: gate session; RLS לא מספיק לבד. |
| כתיבת לקוח ל-`orders` / `vouchers` | checkout/webhook בלבד. |
| הצגת escrow "כסף אצלנו לספק" | No Escrow; PA7. |
| `coupon_codes` לקופונים חדשים | PA4: canonical `vouchers`. |
| float ב-JS לתצוגת מחיר | PA6: agorot + money layer. |
| cancel/refund self-service v1 | PA10: תמיכה בלבד. |

---

## 3. סכמת DB

**אין DDL חדש.** SELECT ללקוח (RLS own):

| טבלה | שדות UI רלוונטיים |
|---|---|
| `orders` | status, `paid_at`, סכומים מצולמים |
| `order_items` | `coupon_price_agorot`, `remaining_amount_due_agorot`, `platform_percent` snapshot |
| `vouchers` | `face_value_agorot`, `qr_payload`, `expires_at`, status |
| `wallet_accounts` / `v_wallet_ledger` | יתרה, היסטוריה |
| `profiles` | שם, טלפון; email read-only |
| `payment_tokens` | last4, brand (לא token) |
| `user_addresses` | CRUD כתובות |

Deprecated לקריאה ישנה בלבד: `coupon_codes`, `wallets`.

---

## 4. מפת מסכים

```text
/account               סקירה
/account/orders        היסטוריית הזמנות
/account/orders/[id]   פרטי הזמנה + QR
/account/coupons       ארנק קופונים (טאבים)
/account/wallet        ארנק קאשבק
/account/details       פרופיל
/account/addresses     כתובות
/account/tokens        כרטיסים (last4)
/coupon/[id]           דף קופון (noindex, בעלים בלבד)
```

AccountNav: פריט פעיל מודגש; badge ארנק מ-agorot; mobile drawer מימין.

---

## 5. הזמנות וקופונים (תמצית)

הזמנות: עד 50 שורות; פרט מציג שולם מהארנק + שולם באתר + יתרה בעסק לקופון.

קופונים: טאבים פעיל / נסרק / פג; QR לפעילים בלבד;  
עותק: "הצגת הקוד בבית העסק. היתרה משולמת שם בזמן הסריקה."

QR: bearer להצגה; redeem אטומי אצל ספק. אין QR ב-DOM לאורח.

---

## 6. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | session פג באמצע `/account/orders/[id]` | redirect login + next |
| E2 | voucher של משתמש אחר ב-URL | 404 / forbidden |
| E3 | QR screenshot sharing | חד-פעמיות ב-DB (redeem) |
| E4 | offline PWA: קופון cached | תצוגה בלבד; redeem online |
| E5 | order pending ללא paid | אין voucher; סטטוס "ממתינה" |
| E6 | refund אחרי redeem | UI "זוכה"; ללא self cancel |
| E7 | עריכת role ב-profiles | RLS block |
| E8 | token delete בלי re-auth | `requireRecentAuth` |

---

## 7. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | wishlist באזור אישי | מחוץ ל-v1 | 2026-08-12 |
| O2 | הצגת עמלה לספק ב-UI | לא v1 ללקוח | 2026-08-12 |
| O3 | `/account/vouchers` redirect קבוע | alias ל-coupons | 2026-08-12 |

---

## 8. Acceptance

- [ ] Session gate על `/account/**`  
- [ ] AccountNav RTL + badge ארנק  
- [ ] הזמנות + קופונים מ-`vouchers` + שני סכומים  
- [ ] ארנק: יתרה + ledger; אין משיכה  
- [ ] כסף מ-agorot דרך money layer  
- [ ] No Escrow בנוסח  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-02 | מסמך מחייב ראשון |
| 2026-08-12 | batch-2: BINDING מלא; תבנית חובה |
