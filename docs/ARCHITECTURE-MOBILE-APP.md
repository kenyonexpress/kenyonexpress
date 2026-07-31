# ARCHITECTURE-MOBILE-APP.md

ארכיטקטורת **אפליקציית מובייל** (סופר-אפ עתידי) ל-KenyonExpress.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד. Web נשאר ערוץ SEO; האפליקציה = שימור, Push, סריקת ספק.

Stack יעד: React Native (Expo) או מקביל TypeScript, **אותו** פרויקט Supabase כמו ה-web, Cardcom לפי חוזי השרת הקיימים, Resend/WhatsApp דרך אותו notifications pipeline.  
אין DB נפרד. אין Make/Zapier.

---

## 0. מטרה

אפליקציה אחת עם שני מצבי שימוש עיקריים:

1. **לקוח:** קטלוג, עגלה, תשלום, קופונים+QR, ארנק, הזמנות, התראות Push.
2. **ספק (מצב מוגבל):** סורק QR למימוש + היסטוריית סריקות.

PWA (`ARCHITECTURE-PWA.md`) היא שלב ביניים; האפליקציה הנייטיבית לא מחליפה את האתר לאינדוקס.

---

## 1. מודל כסף (זהה ל-web)

| סוג | באתר/באפ | פלטפורמה | ספק |
|---|---|---|---|
| קופון | מלוא `coupon_price` | 100% מהמקדמה, אין Escrow | 0 מהמקדמה; יתרה בקופה בסריקה |
| פיזי | מחיר מלא באתר | `platform_percent` מצולם | יתרה ב-ledger / payout |

כללי אפליקציה:

1. מחירים רק מ-API שרת / snapshots. אין חישוב עמלה בקליינט.
2. ארנק פנימי בלבד; אין משיכה.
3. אין נוסח Escrow ב-UI.

---

## 2. Auth

- **Google OAuth** (ומאוחר יותר Sign in with Apple אם נדרש בחנות).
- Session: Supabase Auth SDK למובייל.
- Guest browse מותר; login בלחיצת שלם (כמו web).
- מיזוג עגלת אורח אחרי login.

Deep link: `kenyonexpress://checkout`, `kenyonexpress://vouchers/{code}`.

---

## 3. מודולי לקוח

| מודול | הערות |
|---|---|
| Home / Category / PDP | אותם חוזי מחיר כמו web |
| Cart | sync ל-`carts` + אופטימיסטי מקומי |
| Checkout | קורא ל-server actions / Edge API של Cardcom; WebView ל-Low Profile אם חובה PCI |
| Vouchers | רשימה פעיל/נסרק/פג + QR גדול אופליין-לקריאה |
| Wallet | יתרה + ledger; שימוש רק בקופה |
| Account | פרטים, tokens (last4), התנתקות |
| Push | אותם event types כמו notifications V2 |

---

## 4. מודול ספק

- Role gate: `supplier_members` בלבד.
- מסך סריקה (מצלמה) → `POST /api/supplier/vouchers/redeem`.
- תוצאה: הצלחה / כבר מומש / פג / לא שייך.
- אין גישה לנתוני לקוחות מעבר למה שה-redeem מחזיר.

---

## 5. API וחוזים

האפליקציה **לא** מדברת ישר ל-Cardcom עם סודות.  
אפשרויות מאושרות:

1. קריאה ל-Next Route Handlers / Server Actions מאובטחים (JWT Supabase).
2. Edge Functions משותפות עם אותם RLS.

טבלאות: אותן `orders`, `vouchers`, `wallet_*`, `payment_tokens` עם RLS.

Offline: cache לקריאה של קופונים פעילים; redeem תמיד online.

---

## 6. Push

| אירוע | Push ללקוח | Push לספק |
|---|---|---|
| רכישת קופון | כן (+ QR deep link) | אופציונלי "נמכר" |
| מימוש | אישור | סיכום |
| פקיעה 48ש | כן | לא |
| הזמנה פיזית | סטטוס משלוח (עתידי) | כן: להכין משלוח |

רישום: `push_tokens` (user_id, platform, token).  
שליחה מתוך אותו worker של notifications (ערוץ `push`), לא Zapier.

---

## 7. UI / RTL

- עברית RTL מלאה.
- Heebo או פונט מותג תואם.
- צהוב `#fed700` ל-CTA.
- QR ללקוח: ניגודיות גבוהה, בהירות מסך.

---

## 8. אבטחה

- אין service role באפליקציה.
- Certificate pinning אופציונלי אחרי GA.
- Biometrics לכניסה חוזרת (לא תחליף ל-Google בפעם הראשונה).
- מחיקת חשבון: לפי legal/account deletion flow.

---

## 9. שלבי מסירה

| שלב | תוכן |
|---|---|
| M0 | PWA מלאה (כבר מתוכננת) |
| M1 | Expo app: browse + account + vouchers QR |
| M2 | Checkout + push |
| M3 | Supplier scanner |
| M4 | Physical tracking |

חנויות: App Store + Google Play (ישראל). מדיניות פרטיות/תנאים זהים ל-web.

---

## 10. מה לא בונים

- DB מובייל נפרד
- PSP שני
- רשת שליחים צד ג׳ כתלות שיגור
- Escrow flow

---

## 11. טסטים

| # | תרחיש |
|---|---|
| MA1 | Guest → Google → purchase coupon → QR on device |
| MA2 | Airplane mode: QR עדיין מוצג; redeem נכשל בנימוס |
| MA3 | Supplier scan success + replay |
| MA4 | Push expiry 48h |

---

## 12. Phased delivery

| Phase | Scope | Exit |
|---|---|---|
| M0 | Design locked (this doc) | owner signoff |
| M1 | Expo app: catalog + PDP + guest cart + Google auth | TestFlight / internal track |
| M2 | Checkout via Cardcom (WebView/SDK) + vouchers QR + wallet read | paid test coupon |
| M3 | Supplier scanner + push (purchase, redeem, 48h) | redeem e2e |
| M4 | Physical ship status + deep polish | soft public |

Web stays SEO acquisition. App never forks money rules.

---

## 13. Offline / security notes

- Cache voucher codes + QR bitmaps for issued only; wipe on logout.
- Biometric lock optional for account tab; not a substitute for Supabase JWT.
- Certificate pinning: evaluate after M2; not a day-0 blocker.
- No Escrow screens; prepaid copy matches web.

---

## 14. Revision

| Date | Change |
|---|---|
| 2026-07-31 | רענון מחייב mobile super-app ל-`arch/docs-queue` |
| 2026-07-31 | rev B: phased M0 עד M4, offline/security notes |
