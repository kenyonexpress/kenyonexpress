# ארכיטקטורה: אפליקציית מובייל (Expo)

React Native / Expo על אותו backend כמו ה-web: שיתוף types/logic, deep links לקופונים, push, סריקת QR לספקים.

Status: **BINDING** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-APP-STORE-LAUNCH.md
docs/ARCHITECTURE-PWA.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-CASHBACK-WALLET.md
docs/ARCHITECTURE-INTEGRATIONS.md
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/CONTRADICTIONS.md
docs/PRODUCT-FIELDS-RESEARCH.md
```

עקרון: **Web = SEO + רכישה ראשונית.** האפ = שימור, Push, ארנק קופונים, סריקת ספק. אין DB שני, אין Auth שני, אין PSP שני.

---

## 0. המלצה אחת (מחייבת)

**Expo (React Native) + Expo Router + EAS**, עם חבילות TypeScript משותפות מול המונורפו Next.js, על אותו פרויקט Supabase.

PWA היא גשר עד החנויות; לא תחליף קבוע. Flutter ו-RN "נקי" בלי Expo נדחים.

ורטיקלים עתידיים (משלוחים / נסיעות בסגנון Wolt/Gett): ראה `ARCHITECTURE-INTEGRATIONS.md`. נבנים פנימית בתוך אותה אפ; לא SDK צד ג' שמריץ כסף.

---

## 1. הכרעות

| # | הכרעה |
|---|---|
| M1 | Client: Expo + TypeScript + Expo Router. |
| M2 | Backend: אותו Supabase (Auth, Postgres, RLS, Storage). |
| M3 | כסף ו-redeem רק דרך Route Handlers / Server Actions / RPC. אין service role באפ. |
| M4 | תשלום: Cardcom דרך שרת Next (WebView Low Profile). לא Store IAP לקופונים/פיזי. |
| M5 | קופון: **No Escrow** (שולם באתר לפלטפורמה; יתרה בעסק; payout קופון = 0). |
| M6 | RTL native מההתחלה (`I18nManager` / expo-localization). |
| M7 | Push + Wallet updates דרך `ARCHITECTURE-NOTIFICATIONS.md`. אין Make/Zapier. |
| M8 | כסף ב-domain: **integer agorot**; UI מציג ₪. `platform_percent` דינמי מהשרת, בלי default באפ. |

---

## 2. שיתוף types / logic עם המונורפו

מבנה יעד (packages בתוך אותו repo):

```text
packages/shared-types      # DB row shapes, enums, API DTOs
packages/shared-money      # agorot, coupon offer, platform_percent rules
packages/shared-validation # zod schemas ל-checkout / redeem
apps/web                   # Next.js (קיים כ-src/)
apps/mobile                # Expo app
```

| משותף | לא משותף |
|---|---|
| חוזי TypeScript, zod, חישובי כסף טהורים | רכיבי UI (React DOM ≠ RN) |
| פורמט קוד קופון / QR payload parse | ניווט / מסכים |
| הודעות שגיאה בעברית לדומיין כסף | סגנון / אנימציה |

כלל: לוגיקת כסף אחת. אם ה-web והאפ מחשבים מחיר שונה, זה באג. ייבוא מ-`packages/shared-money` בלבד.

עד שיש monorepo packages: האפ צורכת את אותם חוזים דרך OpenAPI/DTO מתועד מ-

```
src/lib/commerce/product-money.ts
src/lib/commerce/coupon-offer.ts
```

בלי להעתיק נוסחאות.

---

## 3. שני מצבים, אפ אחת

| מצב | קהל | יכולות |
|---|---|---|
| Customer | קונים | קטלוג, עגלה, checkout, ארנק קופונים+QR, ארנק קאשבק (קריאה), הזמנות, Push |
| Supplier | `supplier_members` פעיל | סורק QR, היסטוריית סריקות, התראת `supplier_sale` |

אחרי login: אם יש membership פעיל → טאב Scan. אחרת Customer בלבד.

---

## 4. Deep links לקופונים

| סוג | תבנית | התנהגות |
|---|---|---|
| מוצר | `https://kenyonexpress.co.il/product/{slug}` | Universal Link / App Link → מסך PDP באפ אם מותקן; אחרת web |
| קופון בארנק | `https://kenyonexpress.co.il/account/coupons/{voucher_id}` | דורש session; מציג QR |
| Redeem token | `https://kenyonexpress.co.il/redeem/{token}` | **web בלבד / noindex**; האפ לא פותחת redeem ללקוח |
| Push deep link | `kenyonexpress://coupons/{voucher_id}` | אחרי הקשת push expiry/issued |

הגדרות: Associated Domains (iOS) + Digital Asset Links (Android) לדומיין הייצור.  
Scheme מותאם: `kenyonexpress://`.  
אסור deep link שמכיל service role או PAN.  
אסור לשתף קישור שמאפשר redeem בלי session ספק.

---

## 5. Push notifications

| פריט | ערך |
|---|---|
| תשתית | Expo Notifications → APNs / FCM |
| רישום | אחרי login + הרשאה; שורה ב-`push_tokens` (או `push_subscriptions`) `(user_id, platform, token, updated_at)` |
| שליחה | אותו outbox (`channel=push`) מ-`ARCHITECTURE-NOTIFICATIONS.md` |
| אירועים ללקוח | `voucher_issued`, `voucher_redeemed`, `coupon_expiry_48h`, `wallet_cashback_earned` |
| אירועים לספק | `supplier_sale` (פיזי) |

Transactional push לא תלוי ב-opt-in שיווקי.  
נטישת עגלה: רק עם opt-in (מייל קודם; push בהמשך).

כל push לקופון נושא deep link לארנק (`kenyonexpress://coupons/{id}` או HTTPS מקביל).

---

## 6. סריקת QR לספקים באפ

```text
מצלמה (expo-camera)
  → פענוח KEV1.<payload>.<hmac>
  → POST /api/supplier/vouchers/redeem
       { code, scan_method: "camera", idempotency_key }
  → הצלחה: צליל + מסך ירוק + יתרה לגבייה בעסק (agorot → ₪)
  → כשל: already_used / wrong_supplier / expired בעברית
```

| כלל | פירוט |
|---|---|
| HMAC | מוכיח הנפקה; **לא** הרשאה. `supplier_id` מה-JWT/membership בלבד |
| רשת | Redeem תמיד אונליין. בלי רשת: הודעה ברורה, בלי "מימוש אופליין" |
| אופליין ללקוח | הצגת QR בלבד (בהירות מסך); לא redeem מקומי |
| קצב | אותם rate limits כמו ב-web redeem RPC |
| ביקורת | כל סריקה ב-audit / `voucher_redemptions` |

אין מסך Escrow/held לספק. אחרי redeem: הלקוח שילם יתרה בקופה; הפלטפורמה לא מעבירה מקדמת קופון.

---

## 7. תשלום באפ

Cardcom Low Profile ב-WebView מול השרת הקיים.  
`CHECKOUT_ENABLED` ו-env Cardcom זהים ל-web.  
אחרי `paid_at`: sync ארנק קופונים + רישום push + (אופציונלי) Wallet pass CTA.  
מקור האמת לעסקה: webhook / GetLpResult בשרת, לא ה-WebView לבדו.

---

## 8. סדר מסירה

```text
M0  PWA web          ארנק קופונים בדפדפן
M1  Expo customer    catalog + auth + QR display + deep links
M2  Checkout         Cardcom WebView + push registration
M3  Supplier scan    מצלמה + redeem e2e
M4  Store soft       TestFlight / internal track (ראה APP-STORE-LAUNCH)
M5+ Verticals        לפי ARCHITECTURE-INTEGRATIONS.md (אחרי ליבת החנות יציבה)
```

---

## 9. Acceptance

- [ ] אין service role באפ  
- [ ] מחיר קופון באפ = אותו shared-money כמו web (agorot)  
- [ ] Deep link למוצר/קופון עובד מ-Safari/Chrome  
- [ ] Push issued + expiry 48h עם deep link לארנק  
- [ ] ספק סורק ו-redeem נכשל בנימוס בלי רשת  
- [ ] RTL + עברית בכל מסכי הכסף  
- [ ] אין נוסח Escrow/J5  
- [ ] `platform_percent` לא מומצא באפ כשחסר בשרת  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | Expo RN, QR offline, push, No Escrow |
| 2026-08-10 | מיקוד: monorepo shared packages, deep links, supplier QR, push מ-outbox |
| 2026-08-10 | קישור ל-INTEGRATIONS; M8 agorot; חידוד deep links / redeem |
