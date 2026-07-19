# ארכיטקטורת פורטל הספקים (Supplier Portal)

מסמך תכנון מלא לדומיין פורטל הספקים. תכנון בלבד, אפס קוד ואפס מיגרציות.
תאריך: 2026-07-19. ענף: `phase5/homepage`. מיקום מחייב לפי המשימה:
שורש הפרויקט.

מקורות שנקראו: `docs/MASTER-ARCHITECTURE.md` (v3), `docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027),
`ARCHITECTURE-COMMERCE.md` (026), `ARCHITECTURE-SECURITY.md` (035, גובר באבטחה),
`ARCHITECTURE-LEGAL-COMPLIANCE.md` (037, גובר בדין), `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` (031),
`ARCHITECTURE-ACCOUNT-IDENTITY.md` (029), `ARCHITECTURE-MOBILE-SUPERAPP.md` (M1-M14),
`ARCHITECTURE-API-CONTRACTS.md` (דומיין F), `BUSINESS-MODEL.md`, מיגרציות 001-035.

הקובץ `ARCHITECTURE-CART-CHECKOUT.md` שהתבקש כמקור לסעיפים 3 ו-6 אינו קיים
בריפו, ב-`docs/` או בהיסטוריית Git בזמן כתיבת מסמך זה. לכן חוזי
`commission_ledger`, ‏cashback וה-lifecycle להלן מבוססים על ההחלטות המפורשות
במשימה ועל מסמכי Commerce/Supplier הקנוניים. לפני מימוש חובה ליישב אותם מול
מסמך Cart/Checkout כשיסופק. הפערים מרוכזים בסעיף 11.

מעמד: מסמך זה מפרט את שכבת המוצר/UX/אפליקציה של הפורטל מעל המנגנונים הקנוניים
של 027 (סכימה, RLS, פונקציות). הוא מציע מעבר לדוחות שבועיים מעל
`commission_ledger`, אך אינו מוסמך ליישם או לגבור על חוזה הכסף הקנוני לפני
יישוב סעיף 11. אבטחה לפי SECURITY, דין לפי LEGAL, כסף וסכימה לפי MASTER/027.

---

## 0. עוגנים שהמסמך נשען עליהם (לא נפתחים מחדש)

1. **ישות הספק**: `suppliers` קנונית; `vendors` מוקפאת; הפורטל נבנה רק אחרי
   `036_vendors_unification.sql` (MASTER שלב 5א, R3).
2. **הרשאה**: חברות ב-`supplier_members` בלבד (`is_supplier_member` /
   `is_supplier_owner`); `profiles.role='vendor'` הוא ניתוב גס בלבד (R4).
3. **מימוש**: `redeem_coupon()` (027) הוא המסלול היחיד; CAS אטומי + שורת
   `coupon_redemptions` (R5); rate limit 30/דקה fail-closed (R14).
4. **QR**: `qr_token` חתום Ed25519; חתימה = אותנטיות, חד-פעמיות = DB בלבד (R7).
5. **כסף לספק**: `commission_ledger` הוא יומן המקור החדש שנדרש במשימה;
   `payout_statements` הוא מסמך הסגירה השבועי שמקבץ שורות ledger. כל שורה
   מצביעה ל-`order_item_id`, נושאת snapshot כספי ואינה נערכת. דוח במחלוקת
   לא משולם; mark-paid = super_admin בשכבת ה-action. המיפוי מהמודל הקיים
   של 027 ל-ledger החדש דורש הכרעה בסעיף 11.
6. **מודל הקופון**: הפורטל לעולם אינו מחשב 10/90. הוא מציג את ה-snapshot:
   `customer_pays_now`, ‏`face_value_ils` ו-`collect_amount_ils`. המשימה
   הנוכחית מגדירה 10% באתר ו-90% בעסק, בעוד MASTER 1.40 מגדיר מחיר קופון
   חופשי. עד הכרעה, ה-snapshot הוא מקור האמת והפורטל אינו מקודד אחוז קבוע.
7. **חוזי API**: דומיין F של `ARCHITECTURE-API-CONTRACTS.md` (F1-F10) הוא
   הבסיס; מסמך זה מוסיף עליו ומעדכן שני חוזים (סעיף 9.2).
8. **תנאי הפעלה**: SEC-01..06 מוחלים לפני כסף אמיתי; 037 (הסכם ספק, חשבוניות)
   לפני קבלת תשלום; LEG-12 חוסם אישור ספק בלי חתימת הסכם.
9. **Cashback**: הבסיס הוא `customerPaysNow` בלבד, לעולם לא face value.
   קופון מזכה רק אחרי `redeem_coupon` מוצלח; פיזי מזכה רק אחרי אישור משלוח
   לפי lifecycle המוכרע; ביטול יוצר reversal מקושר לתנועה המקורית. הפורטל
   מציג את האחוז אך אינו מחשב, מזכה או מבטל cashback.

---

## 1. היקף הפורטל: מפת עמודים מלאה

### 1.1 מודל התפקידים בפורטל (הכרעה)

ה-enum `supplier_member_role` (027) נשאר כמות שהוא: `owner | manager | scanner`.
מיפוי מוצרי:

| member_role | לייבל UI | מה רואה בפורטל v1 |
|---|---|---|
| `owner` | בעלים | הכול: כל העמודים, בנק, צוות, מחלוקות, פרופיל עסק |
| `manager` | מנהל/ת | תפעול: דשבורד, סריקה, הזמנות, קופונים, דוחות (קריאה), בקשות. בלי בנק, בלי צוות, בלי פתיחת מחלוקת |
| `scanner` | קופאי/ת | **מסך הסריקה בלבד** + היסטוריית הסריקות שלו |

הכרעות:

1. **קופאי סורק ורק סורק.** זו דרישת מוצר קשיחה. האכיפה בשלוש שכבות:
   ניווט (ה-layout של `/supplier` מנתב scanner ישירות ל-`/supplier/scan`
   ומסתיר את שאר התפריט), guard אפליקטיבי (`requireSupplierMember(minRole)`
   פר עמוד), ו-RLS (סעיף 7.2: הידוק קריאת orders/order_items/user_addresses/
   payout_statements ל-manager ומעלה דרך helper חדש `is_supplier_manager()`).
   זה **מהדק** את מטריצת 2.5 של מסמך 027 (שנתנה ל-scanner קריאת הזמנות
   ודוחות) ואת רמת ההרשאה של F4-F7 בחוזי ה-API; רישום העדכון בסעיף 9.2.
   קריאת `coupon_codes` ו-`coupon_scan_events` נשארת ברמת member (נדרשת
   למסך האישור של הסריקה ולהיסטוריה; תפעולית, לא פיננסית).
2. **הזמנת צוות ב-v1 מציעה קופאי/ת בלבד.** `manager` קיים בסכימה ובחוזה F9
   ומופעל ב-UI כשעסק ראשון יבקש (אפס שינוי סכימה). יצירת `owner` נוסף:
   אדמין בלבד (trigger `enforce_supplier_member_role`, SEC-11).
3. ריבוי עסקים למשתמש: נתמך בסכימה; ה-UI v1 בוחר דרך `current_supplier_id()`
   ומציג בורר רק אם `getMySupplierContext` (F2) מחזיר יותר מחברות אחת.
   כל action מעביר `supplier_id` מפורש (כלל דומיין F).
4. **Supabase Auth מאמת זהות, לא tenancy.** claim גס של supplier/vendor
   משמש רק לניתוב. גבול הנתונים הוא membership פעיל ב-`supplier_members`.
   אין לסמוך על `user_metadata`, פרמטר מהלקוח או `profiles.supplier_id`
   להחלטת RLS.
5. owner מזמין scanner דרך magic link חד-פעמי עם תפוגה. קבלת ההזמנה יוצרת
   או מפעילה membership לעסק המזמין בלבד. owner אינו יכול להעניק owner;
   שינוי בעלות הוא תהליך אדמין עם recent-auth ו-audit.

### 1.2 מפת העמודים

```
/supplier                          layout: requireSupplierMember('scanner') + באנר סטטוס ספק
  /dashboard                       owner+manager (scanner מנותב ל-/scan)
  /scan                            כל member פעיל. מסך מלא, PWA (סעיפים 2, 6)
  /scan/history                    כל member; קופאי רואה סינון "הסריקות שלי" כברירת מחדל
  /orders                          owner+manager. פריטים למשלוח + פיד מכירות
  /orders/[itemId]                 owner+manager. פריט, כתובת משלוח, עדכון סטטוס
  /coupons                         owner+manager. קופונים שהונפקו לעסק: פעילים/מומשו/פגו
  /statements                      owner+manager. רשימת דוחות (לא-draft)
  /statements/[id]                 owner+manager. drill-down לשורות + ייצוא (סעיף 4)
  /requests                        owner+manager. בקשות מוצר/דיל לאדמין (סעיף 1.4)
  /requests/new
  /profile                         owner. פרופיל עסק: שעות, Waze, geo, תמונות (סעיף 1.5)
  /team                            owner. חברי צוות: הזמנה, השבתה (F9)
  /settings                        owner. בנק (F8), התראות, הסכם חתום (צפייה)
  /onboarding                      משתמש רגיל בלי חברות: טופס בקשה + מסמכים (סעיף 3)
```

כל העמודים: עברית, RTL, קריאה עם ה-client של המשתמש בלבד (RLS = גבול האמת,
אפס service role במסכי ספק), `revalidate` דינמי (נתונים פרטיים, אין cache ציבורי).

### 1.2.1 מפת קבצים וגבולות guard

```text
src/app/(supplier)/
  supplier/
    layout.tsx
    page.tsx
    dashboard/page.tsx
    scan/page.tsx
    scan/history/page.tsx
    orders/page.tsx
    orders/[itemId]/page.tsx
    coupons/page.tsx
    products/page.tsx
    statements/page.tsx
    statements/[id]/page.tsx
    requests/page.tsx
    requests/new/page.tsx
    profile/page.tsx
    team/page.tsx
    settings/page.tsx
    onboarding/page.tsx
```

- `src/proxy.ts` מבצע guard גס בלבד: session קיים וניתוב משתמש לא מחובר
  ל-login. הוא אינו מחליט לאיזה ספק מותרת גישה.
- `layout.tsx` טוען context של membership פעיל בצד שרת, מציב `dir="rtl"`,
  ומנתב scanner ל-`/supplier/scan`.
- כל page/action מפעיל guard תפקידי משלו. RLS נשארת שכבת ההכרעה האחרונה גם
  אם guard או URL נעקפו.
- header משותף כולל לוגו ואייקונים בלבד. אין טקסט ניווט בכותרת. ניווט מורחב
  נמצא במגירה במובייל וב-sidebar בדסקטופ; מסך הסריקה מסתיר אותם בזמן מצלמה.

### 1.3 דשבורד (`/supplier/dashboard`): ווידג'טים ומקורות נתונים

| ווידג'ט | תוכן | מקור (הכול תחת RLS) |
|---|---|---|
| מימושים היום | מספר סריקות מוצלחות היום + סכום שנגבה בעסק | `coupon_scan_events` (היום, result=success) + `coupon_redemptions.amount_collected_ils`; טרנד: `v_supplier_scans_daily` (034) |
| יתרה לתשלום | (א) דוחות approved שטרם שולמו; (ב) "נצבר וטרם נכלל בדוח": שורות ledger זכאיות שלא בדוח חי | (א) `payout_statements`; (ב) view חדש `v_supplier_pending_payout` (M-SP, security_invoker, סעיף 7.3) |
| קופונים פעילים | ספירת `issued` בתוקף + התפלגות לפי דיל; דגל "פגים בקרוב" (30 יום) | `coupon_codes` (member read) |
| הזמנות ממתינות | פריטים פיזיים במצב pending/issued בהזמנות בתשלום | `order_items` supplier read (027) |
| מכירות 30 יום | גרף יומי: פריטים, gross, supplier_due | `v_supplier_sales_daily` (034) |
| התראות אחרונות | 5 שורות inapp אחרונות | `notifications_outbox` (channel=inapp, owner read) |

אפס חישוב כספי בצד לקוח: כל הסכומים הם snapshot או view של ה-DB.

### 1.3.1 הזמנות פיזיות ופיד מימושים

`/supplier/orders` מציג שני טאבים מופרדים:

1. **משלוחים**: תור פריטי `order_items` של הספק בלבד. מצבי UI:
   `new -> shipped -> delivered`; כל מצב ממופה לסטטוס הקנוני של ה-lifecycle
   ואינו enum מקביל. מעבר ל-`shipped` מחייב מוביל ומספר מעקב, נכתב בפעולה
   אטומית ומייצר אירוע notification. `delivered` נקבע רק מהחוזה הקנוני,
   לא מכפתור חופשי אם קיימת אינטגרציית מוביל.
2. **מימושי קופון**: feed בזמן יורד מתוך `coupon_redemptions`, עם דיל,
   קופאי, סכום שנגבה ומועד. אין חשיפת טלפון, כתובת או פרטי תשלום של הלקוח.

מעל הטאבים מוצגים counters ליום לפי `Asia/Jerusalem`: הזמנות חדשות, נשלחו,
נמסרו, מימושים מוצלחים וסכום שנגבה בעסק. החיתוך מתבצע ב-query/view ולא
באזור הזמן של הדפדפן. שינוי סטטוס הוא compare-and-set עם `expected_status`;
retry עם אותו idempotency key מחזיר את התוצאה הקודמת.

### 1.4 בקשות מוצר/דיל לאדמין (`/supplier/requests`)

הספק לא כותב לקטלוג לעולם (כתיבת `products`/`coupon_deals` נשארת אדמין).
הערוץ: טבלה חדשה `supplier_requests` (M-SP, סעיף 7.4).

- סוגים (`request_kind`): `new_deal` (דיל קופון חדש), `new_product` (מוצר פיזי),
  `edit_deal` (שינוי מחיר/תיאור/תוקף), `pause_deal` (השהיית מכירה),
  `other` (טקסט חופשי).
- `payload jsonb` לפי סכימת zod פר סוג (ב-`src/lib/validations/supplier.ts`);
  תמונות מועלות ל-bucket `supplier-docs` בנתיב `<supplier_id>/requests/<request_id>/`.
- סטטוסים: `pending -> in_review -> approved | rejected` (מעברים: אדמין בלבד,
  עם `resolution_notes`). approved איננו כותב קטלוג אוטומטית: האדמין מבצע את
  השינוי במסכי האדמין ומקשר את הבקשה (שדה `applied_ref`).
- יחס לסוכן `supplier_ops` (028/039): `listing_drafts` נשאר משטח העבודה הפנימי
  של הסוכן. כשהסוכן מסייע לספק לנסח דיל, התוצר הסופי נכנס כ-`supplier_requests`
  רגילה לתור האדמין. תור אישור אחד, לא שניים.
- rate limit: `supplier_request` 10/24h פר משתמש, fail-open (אותה משבצת של
  `listing_draft` בטבלת 5.4 של האב).

### 1.5 פרופיל עסק (`/supplier/profile`)

`BUSINESS-MODEL.md` סעיף 2 מחייב בדף המוצר: כתובת + Waze, טלפון + WhatsApp,
שעות פתיחה, עיר, קואורדינטות. השדות האלה חיים על `suppliers` ונערכים בפורטל.

1. **שדות חדשים על `suppliers`** (M-SP, סעיף 7.1): `phone`, `whatsapp`,
   `opening_hours jsonb`, `lat numeric(9,6)`, `lng numeric(9,6)`,
   `photos jsonb` (מערך נתיבי storage), `about_he text`.
   קישור Waze אינו עמודה: נגזר בצד לקוח
   `https://waze.com/ul?ll=<lat>,<lng>&navigate=yes` (אפס drift).
2. **פורמט שעות פתיחה** (`opening_hours`): מערך 7 ימים, `0=ראשון`:
   `[{ "day": 0, "ranges": [["09:00","19:00"]] }, ...]`; ריק = סגור. ולידציית zod;
   ה-UI מציג "פתוח עכשיו" מחושב בצד לקוח בשעון `Asia/Jerusalem`.
3. **כתיבה**: שורת `suppliers` נשארת ללא policy כתיבה לספק (005/027). העריכה
   דרך פונקציה חדשה `update_supplier_profile()` (SECURITY DEFINER, M-SP):
   owner בלבד, מוגבלת לשדות התדמיתיים בלבד (phone, whatsapp, opening_hours,
   lat/lng, photos, about_he, logo_url). שם, שם משפטי, ח.פ, עמלה, סטטוס
   ו-payout_terms: אדמין בלבד, לעולם לא דרך הפונקציה. audit trigger קיים (027).
4. **תמונות**: bucket ציבורי חדש `supplier-photos` (M-SP), נתיב
   `<supplier_id>/<uuid>.webp`, כתיבה דרך server action עם דחיסה (עד 5 תמונות,
   2MB אחרי דחיסה). הלוגו נשאר ב-`vendor-logos` הקיים עד איחוד buckets עתידי.
5. גיאוקידוד: ה-UI מציג מפה עם pin נגרר; אין תלות בשירות geocoding חיצוני
   ב-v1 (הזנה ידנית של כתובת + מיקום pin).

### 1.6 נראות מוצרים (`/supplier/products`)

המסך הוא read-only ומציג רק שורות שבהן `products.supplier_id` שייך ל-membership
הפעיל. הוא כולל חיפוש וסינון לפי coupon/physical, סטטוס וזמינות, ובכל שורה:

- שם, SKU/slug, תמונה, סוג, סטטוס ומלאי מוצג.
- `platform_percent` ו-`cashback_percent` כ-snapshot/ערך האדמין הקנוני.
- בקופון: מחיר ששולם באתר, שווי, סכום לגבייה בעסק ותוקף.
- בפיזי: מחיר לקוח, עמלת פלטפורמה צפויה ויתרת ספק צפויה, מסומנות כהערכה בלבד;
  רק שורת ה-ledger שנוצרה במכירה היא הסכום המחייב.

אין policy של UPDATE לספק על `products`, אחוזים, מחיר, מלאי או סטטוס.
שינוי מבוקש רק דרך `/supplier/requests`; האדמין מאשר ומיישם. כל מוצר coupon
או physical חייב `supplier_id` לפני פרסום. RLS על `products`, ‏`order_items`
ו-`commission_ledger` משתמשת באותו predicate של membership כדי למנוע drift.

---

## 2. מפרט זרימת הסריקה (`/supplier/scan`)

### 2.1 עקרון הזרימה: preview נפרד מ-redeem

הדרישה: מסך אישור עם הסכום לגבייה **לפני** המימוש. `redeem_coupon()` מאמת
וממש בפעולה אחת, ולכן נוסף שלב קריאה בלבד:

- **preview** = `SELECT` על `coupon_codes` דרך ה-policy הקיים
  `coupons_supplier_read_assigned` (member read). אפס שינוי מצב, אפס פונקציה
  חדשה. קופון של עסק אחר פשוט לא מוחזר (RLS), ולכן ה-preview שקול ל-`not_found`
  הגנרי ואינו פותח ערוץ enumeration חדש (קוד זר = 0 שורות, בדיוק כמו קוד לא קיים).
- **redeem** = `redeem_coupon(p_code, p_scan_method)` דרך
  `POST /api/supplier/redeem` (F3, route handler; חוזה קיים, ללא שינוי).
  ההגנה מפני מרוץ נשארת ה-CAS של 027: ה-preview אינו נועל כלום, וה-redeem
  מכריע לבד.

### 2.2 מכונת המצבים המדויקת של מסך הסריקה

```
                 ┌────────────────────────────────────────────────┐
                 v                                                │
 IDLE ──פתיחת מצלמה──> SCANNING ──זוהה QR──> LOCAL_VERIFY         │
   │                      │                     │                 │
   │                      └──הזנה ידנית──┐      ├─ חתימה פסולה ──> ERR_BAD_QR ──[הזנה ידנית]──┐
   │                                     │      ├─ exp עבר ──────> ERR_EXPIRED_LOCAL          │
   │                                     │      ├─ sid ≠ שלי ────> ERR_NOT_MINE               │
   │                                     v      v                                            │
   │                              PREVIEWING (online: SELECT קופון תחת RLS)  <───────────────┘
   │                                     │
   │             ┌───────────────────────┼──────────────────────────────┐
   │             v                       v                              v
   │        לא נמצא/0 שורות        status='issued' בתוקף          status אחר
   │        ERR_NOT_FOUND               │                    ERR_ALREADY_USED /
   │                                    v                    ERR_EXPIRED / ERR_REFUNDED
   │                               CONFIRM  ← המסך עם הסכום לגבייה
   │                                    │ [ממש קופון]
   │                                    v
   │                               REDEEMING (POST /api/supplier/redeem)
   │                                    │
   │      ┌────────────┬────────────────┼───────────────┬──────────────┐
   │      v            v                v               v              v
   │  SUCCESS      already_used     expired/refunded  rate_limited  unauthorized
   │  (RECEIPT)    ERR_ALREADY_USED  ERR_*            ERR_RATE      ERR_UNAUTH
   │      │
   └──[סריקה הבאה]──┘

 מצב רוחבי: OFFLINE. כל מעבר שדורש רשת (PREVIEWING/REDEEMING) מזוהה ככשל רשת:
   LOCAL_VERIFY תקין + אין רשת -> OFFLINE_CONFIRM ("תקין, ממתין לאישור אונליין")
     [הוסף לתור] -> OFFLINE_QUEUED (intent ב-IndexedDB) -> ניקוז אוטומטי בחזרת רשת
   הזנה ידנית + אין רשת -> OFFLINE_QUEUED ישירות (אין אימות מקומי לקוד ידני)
```

פירוט המצבים:

| מצב | מה קורה | UI |
|---|---|---|
| SCANNING | `BarcodeDetector` על viewfinder חי; fallback `jsQR` על canvas (027 3.5); numpad ידני 8 ספרות זמין תמיד בתחתית | מסגרת כיוון, פנס (torch) אם נתמך |
| LOCAL_VERIFY | פירוק `KE1.<payload>.<sig>`; אימות Ed25519 מול מפת מפתחות ציבוריים לפי `qr_key_id` (מוטמעת ב-bundle, רוטציה לפי R7); בדיקת `exp`; השוואת `sid` ל-supplier הנוכחי; חילוץ `c` (הקוד הידני) | מיידי, ללא רשת; פחות מ-50ms |
| PREVIEWING | server action `getCouponPreview(code)`: SELECT קופון + שם דיל + שם לקוח (join דרך RLS); מחזיר גם `status` ו-`used_at` לקופון של העסק שכבר מומש | ספינר "בודק מול השרת..." |
| CONFIRM | מסך האישור (2.3) | כפתור ענק "ממש קופון", כפתור משני "ביטול" |
| REDEEMING | קריאת F3; timeout 10 שניות ואז הצעת תור offline | הכפתור ננעל מיידית (מניעת לחיצה כפולה בצד לקוח; ה-CAS מגן ממילא) |
| RECEIPT | מסך ירוק מלא + רטט (Vibration API) + צליל | סעיף 2.4 |
| ERR_* | מסך אדום/כתום מלא | טבלת 2.6 |

### 2.3 מסך האישור (CONFIRM)

```
+--------------------------------------------+
|            עיסוי זוגי 60 דק'               |
|                                            |
|        לגבייה מהלקוח בעסק:                 |
|              360 ₪                         |   <- collect_amount_ils, ענק
|                                            |
|  שווי הדיל: 400 ₪ | שולם באתר: 40 ₪        |   <- face_value_ils, platform_paid_ils
|  לקוח/ה: ישראל ישראלי                      |   <- אימות מול תעודה במקרה חשד
|  בתוקף עד: 12/08/2026                      |
|                                            |
|  [        ממש קופון        ]               |
|  [ ביטול ]                                 |
+--------------------------------------------+
```

- כל הסכומים הם snapshot מ-`coupon_codes` (רגע ההנפקה), לא חישוב חי.
- בין CONFIRM ל-REDEEMING יכול קופון להימומש ממכשיר אחר: ה-redeem יחזיר
  `already_used` וה-UI עובר למסך האדום עם מועד המימוש הראשון. אין נעילה
  ב-preview בכוונה (נעילת שורה ממסך UI = תור נעילות תקוע בקופה).

### 2.4 מסך הקבלה (RECEIPT, אחרי הצלחה)

מסך ירוק מלא: "מומש בהצלחה", הסכום שנגבה בענק, שם הלקוח, שם הדיל, שעת מימוש.
שורת חובה סטטוטורית (LEGAL 1.6): **"זכור: הוצא ללקוח חשבונית/קבלה על 360 ₪
שנגבו בעסק."** כפתורים: [סריקה הבאה] (חוזר ל-SCANNING), [היסטוריה].
הרישום עצמו כבר ב-DB (`coupon_redemptions` + `coupon_scan_events`); המסך הוא
תצוגה בלבד ואיבודו (סגירת דפדפן) לא מאבד כלום.

### 2.5 טיפול במרוצים ובכפילויות (אשרור, בלי מנגנון חדש)

| תרחיש | מה קורה | מי מכריע |
|---|---|---|
| שני קופאים סורקים בו-זמנית | הראשון מעדכן; השני ממתין לנעילת השורה, מעריך מחדש, מעדכן 0 שורות ומקבל `already_used` + מועד | ה-CAS של `redeem_coupon` (027 3.2) |
| לחיצה כפולה על "ממש" | הבקשה השנייה מקבלת `already_used`; ה-UI מציג את מסך ההצלחה אם `used_at` בטווח 10 השניות האחרונות והסורק הוא אני (success-idempotent) | UI + CAS |
| intent מהתור נוקז אחרי שהקופון מומש אונליין | `already_used` מהשרת; מוצג כהתראה "מומש בינתיים", לא כשגיאה (חוזה F3) | ניקוז התור |
| screenshot של קופון שכבר מומש | חד-פעמיות ב-DB; מסך אדום עם מועד המימוש הראשון + שם הלקוח לאימות זהות | איום 6.2 של 027 |
| קופאי מנחש קודים | rate limit 30/דקה fail-closed בתוך ה-RPC + שכבת IP + כל ניסיון נרשם ב-`coupon_scan_events` | 027 3.3 |

מימוש מוצלח הוא יחידה אטומית אחת: מעבר הקופון ל-used, כתיבת redemption,
כתיבת scan event, פרסום אירוע cashback ללקוח ויצירת עובדת ledger מתאימה.
מפתח ה-idempotency נגזר מזהות הקופון והפעולה, ולכן replay offline או retry
אחרי timeout אינם יכולים ליצור cashback, מימוש או ledger כפולים.

### 2.6 שגיאות: הנוסח העברי המחייב פר מצב

צבע: אדום = אין לספק שירות; כתום = תקלה זמנית; צהוב = offline.

| מצב | צבע | כותרת | גוף + פעולה |
|---|---|---|---|
| ERR_NOT_FOUND (כולל wrong_supplier מהשרת) | אדום | "קוד לא נמצא" | "בדוק את 8 הספרות ונסה שוב. אם הקוד מודפס, הזן ידנית." [נסה שוב] [הזנה ידנית] |
| ERR_NOT_MINE (זיהוי sid מקומי) | אדום | "הקופון אינו של העסק הזה" | "הקופון שייך לעסק אחר ואינו ניתן למימוש כאן." [סריקה הבאה] |
| ERR_ALREADY_USED | אדום | "הקופון כבר מומש" | "מומש ב-08/07 בשעה 14:32. אין לספק את השירות פעם נוספת. במקרה מחלוקת מול הלקוח: [פנייה לתמיכה]" |
| ERR_EXPIRED / ERR_EXPIRED_LOCAL | אדום | "תוקף הקופון פג" | "פג ב-12/06/2026. אין לממש. הסכום ששולם באתר יוחזר ללקוח אוטומטית לארנק באתר." (אשרור LEG-04; הקופאי לא מבטיח כלום מעבר) [סריקה הבאה] |
| ERR_REFUNDED | אדום | "הקופון בוטל" | "הקופון הוחזר ללקוח ואינו תקף. אין לממש." [סריקה הבאה] |
| ERR_BAD_QR | כתום | "קוד QR לא תקין" | "לא ניתן לאמת את הקוד. השתמש בהזנה ידנית של 8 הספרות שעל הקופון." [הזנה ידנית] |
| ERR_RATE | כתום | "יותר מדי ניסיונות" | "המתן דקה ונסה שוב. אם זה חוזר, פנה לבעל העסק." [אישור] |
| ERR_UNAUTH | אדום | "אין הרשאה" | "החשבון שלך אינו מקושר לעסק פעיל. פנה לבעל העסק להוספתך לצוות." [התנתק] |
| רשת נפלה באמצע redeem | כתום | "לא התקבל אישור" | "ייתכן שהמימוש נקלט. אל תסרוק שוב מיד; המערכת תסנכרן ותציג את התוצאה." (הניקוז יחזיר success או already_used, שניהם סופיים) |
| OFFLINE_CONFIRM | צהוב | "אין חיבור לרשת" | "הקופון נראה תקין (חתימה מאומתת) אך המימוש דורש אישור אונליין. **אין למסור מוצר או שירות לפני אישור.**" [הוסף לתור ההמתנה] [ביטול] |
| OFFLINE_QUEUED | צהוב (באנר קבוע) | "X מימושים ממתינים לרשת" | נצבר בבאנר עליון; בחזרת רשת: ניקוז אוטומטי + סיכום "אושרו Y, נכשלו Z" |

עקרון אנטי-אנומרציה נשמר: השרת מחזיר `not_found` גם על `wrong_supplier`
(027); הזיהוי המקומי מה-QR (`sid`) מותר להצגה כי הקופון הוצג פיזית בדלפק.

### 2.7 תור ה-offline (`redeem_intents`)

- store ב-IndexedDB: `{ intent_id (uuid), code, scan_method, client_scanned_at }`.
- ניקוז: בחזרת `online` + בכל פתיחת המסך; רץ סדרתית (לא במקביל) אל F3 עם
  `client_scanned_at`; זמן השרת הוא הקובע (חוזה F3). intent מוסר מהתור רק אחרי
  תשובת שרת סופית כלשהי (success / already_used / expired / refunded / not_found).
- אין הגבלת גודל תור מעשית (עשרות intents לכל היותר ביום עמוס).
- **הכרעה: אין cache סכומים offline ב-v1.** מסך ה-OFFLINE_CONFIRM אינו מציג
  סכום לגבייה (ה-payload החתום לא נושא סכומים בכוונה). הכלל העסקי (027 3.5,
  D6/D7): לא מוסרים סחורה לפני אישור אונליין, ולכן הסכום יוצג באישור. sync
  מקדים של קופוני הספק למכשיר נשקל ונדחה: מרחיב את משטח הדליפה במכשיר קופה
  גנוב תמורת נוחות שולית במקרה קצה שממילא אסור למסור בו סחורה.

---

## 3. זרימת ה-Onboarding

### 3.1 הזרימה המלאה

```
משתמש רשום (Google login קיים, 029)
        │  /supplier/onboarding
        v
שלב 1: טופס בקשה (F1: submitSupplierApplication)
   שם עסק, ח.פ/עוסק (9 ספרות), איש קשר, טלפון, עיר, תיאור
   INSERT supplier_applications (status='pending'; ייחודי: pending אחת פר משתמש)
        │
        v
שלב 2: העלאת מסמכים (חדש; טבלת supplier_application_documents, M-SP)
   חובה: רישיון עסק / תעודת עוסק; אישור ניהול ספרים; אישור ניכוי מס במקור
   רשות: אישור ניהול חשבון בנק (אפשר גם אחרי אישור)
   נתיב storage: supplier-docs/applications/<application_id>/<doc_kind>.pdf
   כתיבה דרך server action (service role); קריאה: המבקש + אדמין בלבד
        │
        v
שלב 3: תור אדמין (/admin/suppliers/applications, קיים בתכנון 027)
   האדמין רואה טופס + מסמכים. חסר מסמך -> סטטוס חדש needs_more_info (M-SP)
   שמחזיר את הכדור למבקש (באנר בפורטל + מייל)
        │
        v
שלב 4: שער ההסכם (LEG-12, 037)
   האדמין שולח "מוכן לחתימה" -> המבקש רואה את הסכם הספק (גרסה עדכנית מ-
   legal_document_versions) -> חתימה דיגיטלית: checkbox + הקלדת שם מלא +
   OTP למייל איש הקשר; נשמרים agreement_version + agreement_signed_at +
   snapshot ip/user_agent (עמודות 037 על suppliers; עד אז על הבקשה)
        │
        v
שלב 5: approve_supplier_application(id)   [אדמין; 027]
   הפונקציה מורחבת ב-037: מסרבת אם אין חתימת הסכם תקפה (LEG-12)
   יוצרת suppliers (status='active') + member owner + role='vendor'
        │                                       │
        v                                       v
   דחייה: reject_supplier_application       מייל "אושרת" + כניסה ראשונה לפורטל
   (סיבה מוצגת למבקש; PII של בקשה
    דחויה נמחק אחרי 3 שנים, LEG-08)
        │
        v
שלב 6: צ'קליסט כניסה ראשונה בפורטל (באנר עד השלמה):
   1. פרטי בנק (F8; owner + requireRecentAuth 15 דק')  <- חוסם תשלומים, לא חוסם סריקה
   2. השלמת פרופיל עסק (שעות, מיקום, תמונות; סעיף 1.5) <- חוסם פרסום דיל ראשון
   3. הוספת קופאי/ת ראשון/ה (F9)                        <- רשות
```

### 3.2 הכרעות onboarding

1. **מסמכים לפני אישור, בנק אחרי אישור.** רישיון/אישורי מס הם תנאי בדיקת
   האדמין; פרטי בנק נשארים בפורטל אחרי האישור (זרימת 027 2.3 נשמרת), כי
   הזנתם דורשת את הרשאת ה-owner הקשיחה + audit המסתיר (SEC-12).
2. **`needs_more_info`** נוסף ל-enum `supplier_application_status` בדרך
   הקנונית: כיוון ש-R22 אוסר `ADD VALUE` בקובץ רגיל, M-SP יוצרת את הערך
   במיגרציית `ADD VALUE` ייעודית נפרדת לפני הקובץ הצורך, לפי
   משמעת 2.10 של האב. לחלופין ב-DB שטרם הוחלה בו 027: עריכת ה-CREATE TYPE
   המקורי (הטיוטה טרם הוחלה, מותר לפי R22). ההכרעה: עריכת הטיוטה של 027
   עדיפה (הוספת הערך ל-CREATE TYPE), כי 027 עוד לא הוחלה בשום סביבה.
3. **חתימת ההסכם היא ראיה, לא טקס.** לפי LEGAL 1.5 (חוק חתימה אלקטרונית):
   checkbox + שם מלא + OTP + `wording_version`/`agreement_version` + timestamp
   מספקים. אין ספק חתימות חיצוני (DocuSign וכד') ב-v1.
4. **אישור ניכוי מס במקור וניהול ספרים**: שדות `withholding_cert_expires_at`
   ו-`bookkeeping_cert_expires_at` על `suppliers` (M-SP). דוח לא מסומן paid
   כשאחד מהם פג (בדיקה בתוך `mark_payout_statement_paid`, הרחבת 037/M-SP;
   אשרור הסכם 4.4.5 של LEGAL). cron חודשי מתריע לספק 30 יום לפני פקיעה.
5. ספק במצב `suspended`: הפורטל נפתח לקריאה בלבד + באנר; הסריקה **ממשיכה
   לעבוד** (קופונים שנמכרו חייבים כיבוד, LEGAL 4.3.4) אלא אם ההשעיה הוגדרה
   ע"י אדמין כ-`redeem_blocked` (שדה על ההשעיה, M-SP): מצב קיצוני שבו גם
   מימוש נחסם והלקוחות מזוכים.

---

## 4. חוויית ה-Payout (דוחות והתחשבנות)

### 4.1 קצב יצירת דוחות (הכרעה)

- **מחזור**: שבוע קלנדרי, שני 00:00 עד ראשון 23:59:59 בשעון
  `Asia/Jerusalem`. **יצירה**: cron בכל יום שני 06:00 עבור השבוע שהסתיים,
  לכל ספק עם שורת `commission_ledger` eligible בתקופה. ה-cutoff נקבע לפי
  timestamp עסקי קנוני, לא `created_at` טכני.
- הדוח נולד `pending_approval` (כך כתובה הפונקציה ב-027) וגלוי לספק מיידית
  (draft מוסתר ב-RLS ממילא). אישור אדמין -> `approved`; תשלום שבועי בפועל
  לפי יום התשלום שיוכרע בסעיף 11 -> `mark_payout_statement_paid`
  (super_admin בשכבת ה-action) עם אסמכתת העברה.
- אין תשלום על תקופה שה-reconciliation מול Cardcom שלה לא הושלם (כלל תפעולי,
  027 5.3). באדמין: הדוח מציג דגל "התאמה הושלמה/לא" ליד כפתור התשלום.
- **`payout_due`** הוא SUM של שורות ledger פיזיות במצב earned שטרם נכללו
  בדוח paid, פחות reversals/adjustments. קופון מופיע לשקיפות עם
  `supplier_due_ils=0`, כי הספק גובה את חלקו ישירות בעסק.
- **דוח חודשי להורדה** אינו payout נוסף. הוא projection שמאגד את כל הדוחות
  השבועיים והשורות בחודש הנבחר ל-CSV/PDF, בלי ליצור או לשנות חוב.

### 4.2 מסך הדוח (`/supplier/statements/[id]`)

```
דוח PS-000123 | 06-12/07/2026 | סטטוס: אושר, ממתין להעברה השבועית
────────────────────────────────────────────────────────────
סה"כ מחזור (כולל מע"מ):        12,400 ₪
עמלת פלטפורמה:                  1,240 ₪   [חשבונית מס עמלה: INV-...] <- kind='commission' (037)
לתשלום לספק:                   11,160 ₪
חשבון לזיכוי: בנק 12 | סניף 345 | חשבון ****678   <- bank_snapshot מוצג redacted (F7)
────────────────────────────────────────────────────────────
טאב "שורות" (drill-down):
  [פיזי]  הזמנה KE-1042 | מגהץ אדים | 2 יח' | נמסר 12/06 | 800 ₪ | עמלה 10% 80 ₪ | לתשלום 720 ₪
          -> לחיצה פותחת את פירוט הפריט: snapshot מלא מ-order_items
             (platform_percent, platform_fee_ils, supplier_due_ils, delivered_at,
              carrier+tracking). זה ה-snapshot מזמן ההזמנה; שינוי אחוז מאוחר לא נוגע בו.
  [קופון] מומש 15/06 | עיסוי זוגי | שווי 400 ₪ | שולם באתר 40 ₪ | payout 0
          -> שורת מידע: הכסף נגבה בעסק במעמד המימוש (חובת חשבונית על הספק)
  [התאמה] קיזוז החזר צרכני מדוח PS-000119 | ‎-320 ₪ | הפניה לבקשת הביטול
────────────────────────────────────────────────────────────
[ייצוא CSV]  [הורדת PDF]  [פתיחת מחלוקת]  (מחלוקת: owner בלבד)
```

drill-down: שורת `payout_statement_lines` נושאת `order_item_id` /
`coupon_code_id`; המסך שולף את ה-snapshot דרך ה-RLS הקיים (member read על
order_items/coupon_codes). אפס סכום מחושב ב-UI.

### 4.3 מחלוקות (dispute)

- פתיחה: owner בלבד (F10), מתוך דוח/שורה/פריט/קופון, תוך **30 יום** מפרסום
  הדוח (LEGAL 4.4.4). אחרי 30 יום הכפתור ננעל ("הדוח נחשב מאושר"); אכיפת
  החלון גם ב-fn (M-SP מוסיפה בדיקת `created_at` של הדוח ל-INSERT policy דרך
  trigger, לא רק UI).
- מחזור חיים: `open -> in_review -> resolved_accepted | resolved_rejected`
  (אדמין; 027). דוח עם מחלוקת open/in_review לא ניתן לסימון paid (נאכף
  ב-`mark_payout_statement_paid`, קיים).
- תוצאה כספית של מחלוקת מוצדקת: שורת `adjustment` בדוח הבא (מנגנון קיים);
  לעולם לא עריכת דוח שנסגר.
- ה-UI מציג timeline: פתיחה, תגובת אדמין, הכרעה + `resolution_notes`.

### 4.4 ייצוא לחשבונאות ישראלית (הכרעה)

1. **CSV פר-שורה עם פירוק מע"מ** (כפתור בכל דוח, נוצר server-side, UTF-8 עם
   BOM כדי ש-Excel יציג עברית): עמודות:
   `statement_number, line_type, event_date, description, quantity,
   gross_ils (כולל מע"מ), vat_rate, vat_ils, net_ils, platform_fee_ils,
   payout_ils, order_item_id/coupon_code_id, invoice_number`.
   הכלל: כל הסכומים במערכת כוללים מע"מ (LEGAL 1.6); `vat_rate` הוא השיעור
   החוקי במועד החיוב, snapshot משורת `invoices.vat_rate` (037) של העסקה,
   לעולם לא קבוע בקוד; `vat_ils = round(gross * rate / (100 + rate))` באגורות,
   עיגול פעם אחת פר שורה (כלל האגורות של 026 סעיף 4).
2. **PDF רשמי של הדוח**: נוצר בזמן המעבר ל-approved, נשמר ב-
   `supplier-docs/<supplier_id>/statements/PS-000123.pdf` (bucket פרטי קיים,
   027 סעיף 19), מוצמדת אליו **חשבונית המס על העמלה** (`invoices`,
   kind='commission', 037) עם מספר הדוח כאסמכתא. זהו המסמך שהנהלת החשבונות
   של הספק מקבלת; ה-CSV הוא נתוני עזר.
3. שורות קופון ב-CSV מסומנות `payout_ils=0` עם עמודת gross מלאה: שקיפות
   להתחשבנות מס של הספק על הסכום שגבה בעסק (חובת החשבונית שלו).
4. אין ייצוא בפורמט "במבנה אחיד" (מבנה קבצים של רשות המסים) ב-v1: זו חובה
   של הנהלת חשבונות של כל צד, לא של הפלטפורמה. יישקל רק לפי דרישת ספקים.

---

## 5. מטריצת התראות לספקים

נשען במלואו על צנרת 029/031: `notification_events` (עובדות) -> fanout
(מדיניות) -> `notifications_outbox` -> worker -> ספקים (Resend / Meta / SMS).
אפס צנרת חדשה; נוספים סוגי אירועים, resolver נמענים והעדפות.

### 5.1 עקרונות

1. **סיווג**: כל התראות הספק הן **תפעוליות-חוזיות** (שירות במסגרת הסכם הספק),
   לא "דבר פרסומת" לפי 30א. אין להן דרישת opt-in, יש להן כיבוי בהעדפות
   (חוץ מקטגוריית הכסף, שנשלחת תמיד במייל כמו `order_refunded` ללקוח).
   שעות שקט לא חלות (טרנזקציוני), אבל ה-digest השבועי מתוזמן ממילא לבוקר.
2. **נמענים = חברי הספק לפי תפקיד**, לא `profiles.supplier_id`: ה-fanout פותר
   `supplier_members` פעילים בסינון תפקיד (עמודת target_roles במטריצה) ומצליב
   העדפות פר משתמש. שורת outbox נוצרת פר נמען (dedupe_key כולל user_id).
3. **אפס PII ב-payload** (031 3.2): ids בלבד; ה-worker פותר פרטים בזמן שליחה.

### 5.2 המטריצה (event -> recipients -> channels)

| אירוע | טריגר (dedupe_key) | נמענים | inapp | email | whatsapp | ניתן לכיבוי |
|---|---|---|---|---|---|---|
| `supplier_new_order` : נמכר פריט פיזי שלך | `orders` paid עם order_item של הספק (`supplier_new_order:<order_item_id>:<user_id>`) | owner+manager | תמיד | `supplier_ops_email` (ברירת מחדל: דולק) | `supplier_ops_whatsapp` (opt-in) | כן (חוץ מ-inapp) |
| `supplier_coupon_sold` : נמכר קופון לדיל שלך | INSERT `coupon_codes` issued (`supplier_coupon_sold:<coupon_id>:<user_id>`) | owner+manager | תמיד | digest יומי בלבד (לא מייל פר מכירה) | לא | כן |
| `supplier_coupon_redeemed` : מומש קופון בעסק | INSERT `coupon_redemptions` (`supplier_coupon_redeemed:<coupon_id>:<user_id>`) | owner בלבד (בקרה על קופאים) | תמיד | לא (רעש) | לא | כן |
| `supplier_statement_ready` : דוח שבועי נוצר | payout_statements -> pending_approval (`supplier_statement_ready:<statement_id>:<user_id>`) | owner+manager | תמיד | **תמיד** (מסמך כספי) | `supplier_ops_whatsapp` | לא (מייל כספי) |
| `supplier_payout_paid` : התשלום הועבר | payout_statements -> paid (`supplier_payout_paid:<statement_id>:<user_id>`) | owner | תמיד | **תמיד** + PDF + חשבונית עמלה מצורפים | `supplier_ops_whatsapp` | לא |
| `supplier_deal_expiring` : דיל קרוב לפקיעה עם מימוש נמוך | cron שבועי א' 08:00: דילים עם קופונים issued שפגים בתוך 30 יום ושיעור מימוש < 50% (`supplier_deal_expiring:<supplier_id>:<iso_week>`) | owner+manager | תמיד | `supplier_ops_email`, digest אחד לשבוע | לא | כן |
| `supplier_dispute_resolved` : הוכרעה מחלוקת | supplier_disputes -> resolved_* (`supplier_dispute_resolved:<dispute_id>:<user_id>`) | owner | תמיד | תמיד | לא | לא |
| `supplier_application_approved/rejected/needs_info` : סטטוס בקשה | supplier_applications מעבר סטטוס (`supplier_application_<status>:<application_id>`) | המבקש | תמיד | תמיד | לא | לא |
| `supplier_member_invited` : הוזמנת לצוות | INSERT supplier_members (`supplier_member_invited:<member_id>`) | המוזמן | תמיד | תמיד (magic-link, F9) | לא | לא |
| `supplier_cert_expiring` : אישור ניכוי מס/ניהול ספרים פג בעוד 30 יום | cron חודשי (`supplier_cert_expiring:<supplier_id>:<cert>:<YYYY-MM>`) | owner | תמיד | תמיד (חוסם תשלומים) | לא | לא |
| `supplier_daily_redemption_summary` : סיכום מימושי אתמול | cron יומי 08:00, רק אם היו מימושים (`supplier_daily_redemption_summary:<supplier_id>:<YYYY-MM-DD>:<user_id>`) | owner+manager | לא | `supplier_ops_email` | לא | כן |

- מפתחות אירועים: snake_case שטוח, לפי הכרעת האב [1.27].
- העדפות חדשות על `user_notification_preferences` (M-SP):
  `supplier_ops_email` (default true), `supplier_ops_whatsapp` (default false),
  `supplier_sales_digest_email` (default true). סיכום המימושים היומי נשלח
  ב-cron יומי 08:00 רק אם היו מימושים ביום הקודם.
- ולידציית WhatsApp: כמו לקוחות, נשלח רק אם `profiles.phone` קיים; תבניות
  utility מאושרות Meta (031 2.2).
- מימוש: M-SP מוסיפה את הטריגרים (על טבלאות 027, מוגני `to_regclass` היכן
  שנדרש) שכותבים ל-`notification_events`; הרחבת ה-resolver בתוך
  `fn_fanout_notification_events` (קובץ 031 בבעלות דומיין ההתראות; העריכה
  נרשמת אצלם, סעיף 9.2). עד העריכה: אין התראות ספק, הפורטל מתפקד בלעדיהן.

---

## 6. Mobile-first: ההכרעה הפלטפורמית

### 6.1 ההכרעה: PWA עכשיו, מיני-אפ נייטיב אחר כך

**צד הסורק של הספק הוא PWA על אפליקציית ה-web, החל מהיום ועד אחרי השקת
אפליקציית ה-RN.** זו כבר ההכרעה המערכתית (MOBILE-SUPERAPP 5.4.6 + 11.5:
"סורק הספק נשאר PWA"; ורטיקל supplier נייטיב = מועמד עתידי), ומסמך זה מאשרר
ומחדד:

1. למה PWA מספיק לקופה: הסריקה היא זרימה אונליין במהותה (חד-פעמיות ב-DB);
   המצלמה נגישה מ-getUserMedia + BarcodeDetector; אין צורך ב-push לקופאי
   בזמן משמרת (המסך פתוח); deploy מיידי לתיקון באג קופה עולה על כל יתרון
   נייטיב (אותו נימוק שהשאיר את זה PWA במסמך המובייל).
2. **טריגר המעבר לנייטיב** (ורטיקל `supplier` בתוך אפליקציית ה-RN, לפי
   תבנית המיני-אפים סעיף 4 של MOBILE-SUPERAPP, הרשאת `camera` ב-manifest):
   אחד מאלה, כמדד ולא כתחושה: (א) שיעור כשל סריקות מצלמה ב-iOS Safari מעל
   3% מתמשך (נמדד מ-`coupon_scan_events.metadata.scan_method` מול ניסיונות
   ידניים); (ב) מעל 50 ספקים פעילים חודשית; (ג) דרישת שטח ל-push תפעולי
   לקופאים. עד אז: אפס עבודה נייטיבית על צד הספק.
3. כשהוורטיקל הנייטיב ייבנה, התשתית כבר מוכנה (MOBILE-SUPERAPP 5.4.6):
   `redeem_coupon()` בצינור A, views של 034, אותו תור intents.

### 6.2 מפרט ה-PWA של הסורק

- **App shell**: `app/manifest.ts` (display standalone, dir rtl, שם "קניון
  אקספרס לעסקים", אייקון ייעודי) + service worker (Serwist) עם precache של
  `/supplier/scan` בלבד ו-store `redeem_intents` (2.7). שאר הפורטל: online
  רגיל (דוחות והזמנות אינם מסכי קופה).
- **prompt התקנה ברגע ערך**: אחרי הסריקה המוצלחת הראשונה של המשתמש (לא
  בכניסה ראשונה): "הוסף את הסורק למסך הבית לגישה בלחיצה".
- **ארגונומיית קופה**: יעדי מגע 48px+; numpad ידני בגובה אגודל; מצב תצוגה
  bright (מסך התוצאה ירוק/אדום על כל המסך, קריא בשמש ומרחוק); רטט על
  הצלחה/כישלון (דפוסים שונים); צליל קצר (ניתן להשתקה); Wake Lock API בזמן
  שהמסך פתוח (הקופה לא נכבית באמצע משמרת); torch toggle.
- **session בקופה**: session רגיל של Supabase (עוגיות httpOnly, רענון אוטומטי).
  אין ביומטריה ב-PWA (יכולת נייטיב); הסיכון של מכשיר קופה פתוח מטופל דרך:
  (א) השבתת חבר `is_active=false` מנתקת מיידית (RLS); (ב) אחריות הספק לצוות
  ולמכשירים מעוגנת בהסכם (LEGAL 4.3.5); (ג) כל סריקה נרשמת עם scanned_by.
- **תאימות**: iOS Safari 16.4+ ו-Android Chrome עדכני; BarcodeDetector חסר
  ב-iOS -> fallback jsQR (מובנה בתכנון 027 3.5). בדיקת e2e (Playwright) על
  זרימת סריקה עם מצלמה מדומה נכנסת ל-CI לפני שלב 5א.
- **טאבלט קופה**: אותו UI רספונסיבי; אין build נפרד.

### 6.3 שפת עיצוב, RTL ונגישות

- פונט: Heebo בכל הפורטל. מסמך HTML וה-layout הם `dir="rtl"` ו-`lang="he"`.
  כל spacing משתמש ב-logical properties כדי שלא לקבע left/right.
- טוקנים מחייבים: צהוב Electro `#fed700` לפעולה ראשית, כחול `#0062bd`
  לקישורים ומצבי מידע, אדום `#E4002B` לסכנה, כשל ומימוש שכבר בוצע.
- header כולל לוגו ואייקונים בלבד, עם accessible names לקוראי מסך. אין
  תוויות טקסט גלויות בכותרת ואין ניווט עמוס מעל מסך המצלמה.
- הסורק mobile-first: פעולה ראשית באזור האגודל, תוצאה בצבע מסך מלא, טקסט
  שאינו נשען על צבע בלבד, focus ברור, הודעות `aria-live` ו-fallback ידני.
- טבלאות הזמנות וכספים הופכות לכרטיסים במובייל בלי להסתיר סכום, סטטוס או
  פעולה. פורמט מטבע הוא `he-IL` ו-ILS; תאריכים מוצגים בשעון ישראל.
- אין לקבוע ערכי pixel parity נוספים בלי extraction מהמקור החי. הטוקנים
  שניתנו במשימה מחייבים; מידות שלא נמדדו אינן מומצאות במסמך זה.

---

## 7. דלתא הסכימה: M-SP (מוצעת, מספר טרם הוקצה)

`M-SP` הוא מזהה תכנוני בלבד. שם הקובץ הסופי ייקבע אחרי פתרון התנגשות המספור
ויירשם בטבלת 0.2 של האב באותו commit. הכול expand-only, idempotent, RLS מלא,
audit לפי הדפוסים הקיימים. תלות: 027, 031 (טריגרי אירועים מוגני קיום), 037
(הסכם/חשבוניות). תוכן:

אזהרת מספור: R31 מציין ש-042 הוא הבא, אבל הטיוטה
`admin-arch/ARCHITECTURE-ADMIN-OPS-V2.md` כבר מקצה אותו לעצמה. אין לכתוב
אף מיגרציה לפני הקצאה קנונית מחדש ב-MASTER.

### 7.1 פרופיל עסק

```sql
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS whatsapp       text,
  ADD COLUMN IF NOT EXISTS opening_hours  jsonb,
  ADD COLUMN IF NOT EXISTS lat            numeric(9,6),
  ADD COLUMN IF NOT EXISTS lng            numeric(9,6),
  ADD COLUMN IF NOT EXISTS photos         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS about_he       text,
  ADD COLUMN IF NOT EXISTS withholding_cert_expires_at date,
  ADD COLUMN IF NOT EXISTS bookkeeping_cert_expires_at date;

-- owner עורך שדות תדמיתיים בלבד; כספים/זהות נשארים אדמין
CREATE FUNCTION public.update_supplier_profile(p_supplier_id uuid, p_patch jsonb) ...
  SECURITY DEFINER; -- בודקת is_supplier_owner, allowlist שדות, audit
REVOKE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;
```

bucket ציבורי `supplier-photos` + policies (כתיבה server-side בלבד).
(הערה: זה מממש בפורטל את מה ש-COMMERCE 8.2 שרטט כ"עתידי"; אינדקס geo
earthdistance נשאר בדומיין הקטלוג, 038/עתידי, לא כאן.)

### 7.2 הידוק הרשאת קופאי (עדכון החלטת 027 סעיף 2.5)

```sql
CREATE FUNCTION public.is_supplier_manager(p_supplier_id uuid) -- owner או manager
  RETURNS boolean ... SECURITY DEFINER;

-- החלפת policies קיימים (DROP + CREATE) כך שקריאת
-- orders / order_items / user_addresses / commission_ledger /
-- payout_statements / payout_statement_lines
-- דורשת is_supplier_manager() במקום is_supplier_member().
-- products מוגבלת ל-supplier_id של member פעיל ול-SELECT בלבד.
-- coupon_codes + coupon_scan_events + suppliers(SELECT) נשארים member.
```

### 7.3 view יתרה לתשלום

```sql
CREATE VIEW public.v_supplier_pending_payout WITH (security_invoker = true) AS
-- (א) סכום supplier_due של שורות commission_ledger earned
--     שאינן כלולות בדוח לא-מבוטל
-- (ב) סכום total_payout_ils של דוחות approved שטרם paid
-- שורה פר ספק; RLS של הטבלאות התחתונות תוחמת לספק של הקורא
```

### 7.4 בקשות לאדמין ומסמכי onboarding

```sql
CREATE TYPE public.supplier_request_kind AS ENUM
  ('new_deal','new_product','edit_deal','pause_deal','other');
CREATE TYPE public.supplier_request_status AS ENUM
  ('pending','in_review','approved','rejected');

CREATE TABLE public.supplier_requests (
  id uuid PK, supplier_id -> suppliers, opened_by -> auth.users,
  kind supplier_request_kind, payload jsonb, status supplier_request_status,
  resolution_notes text, applied_ref text, resolved_by, resolved_at,
  created_at, updated_at
); -- RLS: manager+ קורא ופותח; אדמין הכול; audit trigger

CREATE TABLE public.supplier_application_documents (
  id uuid PK, application_id -> supplier_applications ON DELETE CASCADE,
  doc_kind text CHECK (doc_kind IN
    ('business_license','bookkeeping_cert','withholding_cert','bank_confirmation','other')),
  storage_path text NOT NULL, uploaded_at timestamptz
); -- RLS: המבקש SELECT; אדמין הכול; כתיבה service role בלבד
```

וכן: הוספת `needs_more_info` ל-`supplier_application_status` (בעריכת טיוטת
027, סעיף 3.2.2); שדה `redeem_blocked boolean` על השעיית ספק (3.2.5);
אכיפת חלון 30 יום לפתיחת מחלוקת (trigger על supplier_disputes).

### 7.5 התראות ספק

- טריגרים כותבי `notification_events` על: order_items (paid עם ספק),
  coupon_codes (issued), coupon_redemptions (insert), payout_statements
  (pending_approval, paid), supplier_disputes (resolved),
  supplier_applications (מעברי סטטוס), supplier_members (insert).
- עמודות העדפה: `supplier_ops_email` (true), `supplier_ops_whatsapp` (false),
  `supplier_sales_digest_email` (true) על `user_notification_preferences`.
- שתי פונקציות cron: `fn_enqueue_supplier_deal_expiry_digest()` (שבועי),
  `fn_enqueue_supplier_cert_expiry_alerts()` (חודשי), וכן
  `fn_enqueue_supplier_daily_redemption_summary()` (יומי).
- הרחבת ה-resolver של `fn_fanout_notification_events` לאירועי ספק: **עריכה
  בקובץ 031** (בבעלות דומיין ההתראות), לא ב-M-SP.

---

## 8. מודל איומים: דלתא הפורטל (מעבר ל-027/035)

| # | איום | מיטיגציה |
|---|---|---|
| P1 | קופאי מדפדף לנתונים כספיים (URL ישיר לדוחות) | שלוש שכבות: ניווט, guard, ובעיקר RLS מהודק (7.2). גם URL ישיר מחזיר 0 שורות |
| P2 | enumeration דרך ה-preview | ה-preview הוא SELECT תחת RLS: קוד של עסק אחר = 0 שורות, שקול ל-not_found; אין timing side channel (אותה שאילתה); ה-redeem עצמו עם rate limit fail-closed |
| P3 | מכשיר קופה גנוב עם session פעיל | השבתת member מיידית (is_active=false, אפקט RLS מיידי); אין cache סכומים/קודים offline (2.7); כל סריקה מיוחסת ל-scanned_by; אחריות מכשירים על הספק בהסכם |
| P4 | owner מזייף פרופיל עסק (מיקום/שעות מטעים) | update_supplier_profile מוגבלת לשדות תדמיתיים + audit; תלונות צרכן מנותבות לאדמין; שדות זהות ומחיר אדמין בלבד |
| P5 | ספק מציף את תור הבקשות לאדמין | rate limit supplier_request 10/24h; סטטוס in_review חוסם בקשות כפולות על אותו דיל (בדיקת אפליקציה) |
| P6 | העלאת קובץ זדוני במסמכי onboarding | קבלה רק application/pdf ותמונות, עד 10MB, שמות קבצים מוחלפים ב-uuid, bucket פרטי, אין הגשה חזרה inline (Content-Disposition: attachment) |
| P7 | חתימת הסכם מוכחשת | agreement_version + timestamp + OTP למייל + ip/user_agent snapshot; נוסח ההסכם versioned ב-legal_document_versions (037) |
| P8 | digest ההתראות דולף נתוני מכירות לקופאי | resolver הנמענים מסנן target_roles (owner/manager) לפני יצירת שורות outbox; ההעדפה לא מספיקה בלי תפקיד |

---

## 9. יחסים עם מסמכים קנוניים: רישום עדכונים נדרשים

### 9.1 מה מסמך זה מוסיף בלי לסתור

מפת עמודים, מכונת מצבי סריקה עם preview, נוסחי שגיאות, onboarding עם מסמכים,
cadence דוחות, ייצוא חשבונאי, מטריצת התראות ספק, מפרט PWA, ותוכן M-SP.

### 9.2 עדכונים נדרשים במסמכים הקנוניים לפני מימוש

| מסמך | עדכון | סיבה |
|---|---|---|
| `MASTER-ARCHITECTURE.md` | רישום מסמך זה בטבלת 0.1; פתרון התנגשות 042 מול Admin Ops והקצאת מספר סופי; שורת R חדשה: "קופאי סורק בלבד; פורטל = PWA" | R31/R32 |
| `ARCHITECTURE-SUPPLIER-REDEMPTION.md` | סעיף 2.5: קריאת orders/דוחות עוברת מ-member ל-manager+ (הידוק 7.2); סעיף 2.3: שלב מסמכים + needs_more_info בזרימת ה-onboarding | הכרעת "קופאי רק סורק" |
| `ARCHITECTURE-API-CONTRACTS.md` | F4-F7: רמת auth מינימלית עולה מ-supplier:scanner ל-supplier:manager; נוספים חוזים: getCouponPreview, updateSupplierProfile, submitSupplierRequest, listApplicationDocuments | סעיפים 2.1, 1.4, 1.5 |
| `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` | הרחבת fn_fanout_notification_events לאירועי ספק + 3 עמודות העדפה + 3 crons | סעיף 5 |
| `ARCHITECTURE-LEGAL-COMPLIANCE.md` | אשרור: מסך הקבלה מציג את תזכורת החשבונית (1.6); חלון מחלוקת 30 יום נאכף ב-DB | סעיפים 2.4, 4.3 |
| טיוטת `027_suppliers.sql` | הוספת `needs_more_info` ל-CREATE TYPE (מותר: הטיוטה טרם הוחלה) | סעיף 3.2.2 |

### 9.3 סדר בנייה (מיפוי לשלב 5א של האב)

```
תנאים מוקדמים: Cart/Checkout שסופק ויושב; 026, 027 (ערוכה), 029, 031, 035x2,
036, 037 חלות; SEC-01..06 סגורים; מספר migration סופי הוקצה ב-MASTER
5א.0  כתיבת migration הפורטל + עריכת fanout ב-031 + apply-twice ירוק -> החלה באישור
5א.1  onboarding: /supplier/onboarding + מסמכים + תור אדמין + שער הסכם (LEG-12)
5א.2  שלד פורטל: layout + requireSupplierMember + דשבורד (views 034 + v_supplier_pending_payout)
5א.3  מסך סריקה PWA: מצלמה, preview, confirm, receipt, תור offline, e2e מצלמה מדומה
5א.4  הזמנות ומשלוחים (F4/F5) + קופונים
5א.5  דוחות: מסך דוח + drill-down + CSV/PDF + מחלוקות; cron יצירה שבועי
5א.6  פרופיל עסק + צוות + התראות ספק (אחרי עריכת 031)
5א.7  reconciliation באדמין + cron expire_coupons (027 סעיף 7) : נשאר כמתוכנן
```

---

## 10. סיכום הכרעות

| # | הכרעה |
|---|---|
| SP1 | תפקידים: enum 027 נשאר; v1 חושף בעלים + קופאי/ת; קופאי רואה אך ורק את מסך הסריקה, נאכף גם ב-RLS (is_supplier_manager חדש) |
| SP2 | זרימת סריקה דו-שלבית: preview (SELECT תחת RLS, בלי פונקציה חדשה) -> מסך אישור עם collect_amount_ils -> redeem_coupon (CAS יחיד). אין נעילה ב-preview |
| SP3 | offline: תור redeem_intents בלבד; בלי cache סכומים; אין מסירת סחורה לפני אישור אונליין (D6/D7 בתוקף) |
| SP4 | נוסחי שגיאה עבריים קבועים פר מצב (טבלת 2.6); ירוק/אדום מסך מלא + רטט |
| SP5 | onboarding: בקשה -> מסמכים (רישיון, ניהול ספרים, ניכוי במקור) -> אדמין -> חתימת הסכם דיגיטלית (חוסמת אישור, LEG-12) -> אישור -> צ'קליסט בנק/פרופיל |
| SP6 | דוחות: cron שבועי ביום שני על השבוע שהסתיים; payout_due נגזר מ-commission_ledger בלבד; דוח חודשי הוא projection להורדה; מחלוקת תוך 30 יום נאכפת ב-DB |
| SP7 | ייצוא: CSV פר-שורה עם פירוק מע"מ מ-snapshot (שיעור חוקי במועד החיוב, עיגול אגורות פעם אחת) + PDF רשמי + חשבונית עמלה ב-supplier-docs |
| SP8 | התראות ספק: מייל על הזמנה פיזית חדשה, סיכום מימושים יומי, כספיות תמיד במייל ו-digest שבועי לדילים פגים; נמענים נקבעים לפי membership |
| SP9 | פלטפורמה: PWA על ה-web עכשיו; ורטיקל supplier נייטיב ב-RN רק לפי טריגרים מדודים (כשל מצלמה iOS > 3%, או 50+ ספקים פעילים, או צורך push) |
| SP10 | פרופיל עסק: שדות על suppliers (M-SP), עריכת owner דרך fn מוגבלת-שדות; Waze נגזר מ-lat/lng; בקשות קטלוג דרך supplier_requests, הקטלוג נכתב רק בידי אדמין |
| SP11 | דלתת הסכימה תרוכז במיגרציה אחת שמספרה טרם הוקצה, עם עריכה ב-031 ל-fanout וב-027 ל-needs_more_info; חוזה הכסף לא ימומש עד יישוב commission_ledger מול payout_statement_lines |

---

## 11. שאלות פתוחות להכרעה לפני מימוש

1. **איפה מסמך Cart/Checkout?** יש לספק את
   `ARCHITECTURE-CART-CHECKOUT.md`, בעיקר סעיפים 3 ו-6, כדי לנעול שמות שדות,
   סטטוסים, idempotency keys ורגעי lifecycle. הוא אינו קיים כרגע בריפו.
2. **10/90 קבוע או מחיר קופון חופשי?** המשימה אומרת 10% באתר ו-90% בעסק;
   MASTER 1.40 אומר ש-`platform_price` חופשי פר דיל. איזה חוזה גובר?
3. **Ledger מול 027:** האם `commission_ledger` מחליף את מנגנון
   `payout_statement_lines` של 027 כמקור אמת, או שהוא שכבת facts שממנה
   נבנות אותן שורות? נדרשת תוכנית migration ו-backfill אחת.
4. **רגע cashback בפיזי:** האם "shipment confirmed" הוא מעבר הספק ל-shipped
   עם tracking, אישור webhook של המוביל, או delivered? בחירה מוקדמת מדי
   מאפשרת לספק לייצר cashback לפני מסירה; בחירה מאוחרת משנה את ה-UX ללקוח.
5. **יום ותנאי payout שבועי:** באיזה יום מתבצעת ההעברה, מהו cutoff, ומה
   קורה בחג/כשל reconciliation? המסמך קובע יצירת דוח ביום שני אך לא ממציא
   מועד בנקאי שלא הוגדר.
6. **שם התפקיד הגס:** האם משנים את `profiles.role='vendor'` ל-`supplier`,
   או משאירים vendor לתאימות ורק ה-UI נקרא "ספק"? RLS אינה תלויה בשם זה.
7. **התנגשות מיגרציה 042:** גם Admin Ops וגם Supplier Portal דורשים 042.
   מי מקבל 042 ומי עובר ל-043? יש לעדכן MASTER ואת שני המסמכים יחד.
8. **PII במסך האישור:** האם קופאי רשאי לראות שם לקוח מלא, שם פרטי בלבד,
   או ארבע ספרות מזהה? ברירת המחדל המומלצת היא המינימום הנדרש למניעת הונאה.
9. **פורמט דוח חודשי:** האם CSV ו-PDF מספיקים ל-v1, או שנדרש פורמט ייבוא
   ייעודי לתוכנת הנהלת החשבונות של הספק?
