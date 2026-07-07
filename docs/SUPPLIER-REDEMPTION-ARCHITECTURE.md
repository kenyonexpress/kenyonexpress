# ארכיטקטורת פורטל ספקים ומימוש קופונים

מסמך תכנון מלא. מיגרציה נלווית (טיוטה, לא הוחלה):
`supabase/migrations/027_suppliers.sql`

תאריך: 2026-07-08. ענף: `phase5/homepage`.

---

## 0. מודל הכסף (ההנחה שכל השאר נשען עליה)

לכל מוצר יש `platform_percent` שנקבע על ידי אדמין.

| סוג מוצר | הלקוח משלם באתר | הלקוח משלם בעסק | הפלטפורמה מרוויחה | הספק מקבל מהפלטפורמה |
|---|---|---|---|---|
| קופון (`coupon`) | `full_price * platform_percent / 100` | היתרה, במימוש | את כל התשלום באתר | 0 (הכסף שלו נגבה ישירות מהלקוח בעסק) |
| פיזי (`physical`) | מחיר מלא | 0 | `total * platform_percent / 100` | `total * (1 - platform_percent/100)` בהעברה בנקאית |

כלומר: מנוע התשלומים לספקים רלוונטי כספית רק למוצרים פיזיים. מימושי קופונים מופיעים בדוח התקופתי כשורות מידע (payout אפס) לצורך שקיפות והתחשבנות מול העסק.

שרשרת ה-snapshot של האחוז:

```
products.platform_percent (override פר מוצר, nullable)
  -> fallback: suppliers.commission_percent (ברירת מחדל פר ספק, קיים מ-005)
  -> fallback: 10
```

בזמן רכישה האחוז מוקפא:
- מוצר פיזי: לתוך `order_items.commission_percent` + `order_items.supplier_payout_ils` (עמודות קיימות מ-007, בדיוק לייעוד הזה).
- קופון: לתוך עמודות חדשות ב-`coupon_codes`: `platform_percent`, `face_value_ils`, `platform_paid_ils`, `collect_amount_ils`.

שינוי אחוז עתידי לא משנה דוחות עבר. פונקציית עזר לחישוב בזמן checkout:
`public.product_platform_percent(product_id)`

---

## 1. מצב קיים וממצאי drift

מה שכבר קיים במיגרציות ומשרת אותנו:

| רכיב | מקור | הערה |
|---|---|---|
| `suppliers` | 005 | הישות העסקית שכל הכסף מפנה אליה: `products.supplier_id`, `order_items.supplier_id`, `coupon_codes.supplier_id` |
| `vendors` | 001 + 013 | ישות מקבילה וכפולה. רק `coupon_deals.vendor_id` מפנה אליה |
| `profiles.supplier_id` | 008 | שיוך משתמש לספק (יחיד) |
| `coupon_codes` | 008 | קוד 8 ספרות, סטטוסים `issued/used/expired/refunded`, שדות מימוש |
| `order_items.commission_percent` + `supplier_payout_ils` | 007 | snapshot כספי מוכן מראש |
| `check_user_rate_limit` | 019 | rate limit פר משתמש ופעולה |
| `audit_log` + `audit_log_trigger_fn` | 011 + 025 | לוג חסין, INSERT דרך SECURITY DEFINER בלבד |

ממצאים שהתגלו בקריאה (חשובים להמשך):

1. **באג ב-014**: ה-policy בשם
   `products: vendor read own`
   משווה את `products.supplier_id` (שמפנה ל-`suppliers`) מול `vendors.id`. השוואה בין שתי טבלאות שונות, לעולם לא תחזיר שורות נכונות. 027 מחליפה אותה ב-policy מבוסס חברות.
2. **כפילות `vendors` / `suppliers`**: הוחלט ש-`suppliers` היא הישות הקנונית (כל ה-FK הכספיים כבר מפנים אליה). `vendors` נשארת legacy עבור `coupon_deals` בלבד, ואיחוד מלא נדחה למיגרציה עתידית (שאלה פתוחה 11.1).
3. **drift ידוע מ-STATE.md**: טבלת `coupons` קיימת ב-DB החי למרות ש-008 מוחקת אותה בקבצים. לא נוגעים בה כאן.
4. **תלות**: הפונקציה `redeem_coupon` מפנה ל-`products.name_he`, כלומר 016 חייבת להיות מוחלת לפני 027.

---

## 2. מודל תפקידים והרשאות

### 2.1 העיקרון: חברות (membership) ולא תפקיד (role)

ה-enum `user_role` נשאר כמו שהוא. **לא** מוסיפים ערך enum חדש:
- `ALTER TYPE ... ADD VALUE` אסור לשימוש באותה טרנזקציה שמשתמשת בערך, וזה בדיוק מה ש-`apply_migration` עושה (קובץ = טרנזקציה אחת).
- הערך `vendor` כבר קיים בהיררכיה של 003 ומשמש כתפקיד הספק.

`profiles.role = 'vendor'` הוא שער גס בלבד (routing ל-`/supplier`, middleware). ההרשאה האמיתית לכל שורה נקבעת בטבלה חדשה:

```sql
supplier_members (supplier_id, user_id, member_role, is_active)
```

| member_role | מה מותר |
|---|---|
| `owner` | הכול: פרטי בנק, ניהול צוות, פתיחת מחלוקות, צפייה בדוחות |
| `manager` | תפעול: הזמנות, משלוחים, סריקה, צפייה בדוחות |
| `scanner` | סריקת קופונים וצפייה בהזמנות בלבד |

עסק אחד יכול לצרף כמה סורקים (קופאים), ומשתמש יכול תיאורטית להיות חבר בכמה ספקים (המבנה תומך; ה-UI בשלב ראשון מניח ספק אחד דרך `current_supplier_id()`).

`profiles.supplier_id` מ-008 מסונכרן לאחור (backfill במיגרציה + עדכון באישור בקשה) אבל אינו מקור אמת יותר.

### 2.2 פונקציות עזר (SECURITY DEFINER, שוברות רקורסיית RLS)

```sql
public.is_supplier_member(supplier_id) -- חבר פעיל כלשהו
public.is_supplier_owner(supplier_id)  -- owner בלבד
public.current_supplier_id()           -- הספק של המשתמש הנוכחי
```

### 2.3 onboarding: בקשה, אישור, דחייה

```
לקוח רשום ממלא טופס "הצטרפות כספק"
        |
        v
INSERT supplier_applications (status='pending')     <- RLS: רק לעצמו, רק pending
  (אינדקס ייחודי חלקי: בקשה pending אחת פר משתמש)
        |
        v
אדמין רואה תור בקשות ב-/admin/suppliers/applications
        |
   +---------+----------+
   v                    v
approve_supplier_application(id)      reject_supplier_application(id, reason)
   |                                        |
   | 1. יוצרת שורת suppliers (status='active')   מסמנת rejected + סיבה,
   | 2. יוצרת supplier_members owner             המשתמש רואה את הסיבה
   | 3. profiles: role -> 'vendor' (רק אם customer), supplier_id
   | 4. מסמנת את הבקשה approved
   v
לספק יש גישה ל-/supplier; הצעד הראשון בפורטל: הזנת פרטי בנק
```

שתי הפונקציות אדמין בלבד (בדיקה בתוך הפונקציה + audit trigger על שתי הטבלאות).

### 2.4 פרטי בנק (ישראל)

טבלה נפרדת `supplier_bank_accounts`, כדי ששורת `suppliers` תוכל להיות קריאה לכל חברי הספק בלי לחשוף בנק לסורקים:

```sql
bank_code      CHECK ('^[0-9]{2}$')     -- קוד בנק (12, 10, 20...)
branch_code    CHECK ('^[0-9]{3}$')     -- סניף
account_number CHECK ('^[0-9]{4,9}$')   -- חשבון
account_holder_name, holder_id_number   -- מוטב + ת.ז/ח.פ
is_active, verified_by, verified_at     -- אימות ידני של אדמין
```

- חשבון פעיל אחד פר ספק (אינדקס ייחודי חלקי על `is_active`).
- RLS: קריאה וכתיבה ל-`owner` של הספק + אדמין. אין DELETE (כיבוי דרך `is_active`), כדי ששורת תשלום היסטורית לא תאבד הקשר.
- בתשלום בפועל הפרטים מוקפאים לתוך `payout_statements.bank_snapshot` (jsonb), כך שגם החלפת חשבון לא משכתבת היסטוריה.
- הצפנה ברמת עמודה (pgsodium/Vault) נשקלה ונדחתה לשלב זה: RLS הדוק + audit מספקים, והמפתחות ממילא ב-Supabase. שאלה פתוחה 11.2.

### 2.5 מטריצת RLS (מה ספק רואה)

| טבלה | ספק (member) | הערות |
|---|---|---|
| `suppliers` | SELECT השורה שלו | כתיבה נשארת אדמין (005) |
| `products` | SELECT מוצרים עם `supplier_id` שלו | מחליף את ה-policy השבור מ-014 |
| `orders` | SELECT רק הזמנות **בתשלום** שמכילות פריט שלו | עגלות pending לא נחשפות |
| `order_items` | SELECT פריטים שלו; UPDATE רק דרך `update_shipping_status()` | אין UPDATE policy ישיר |
| `user_addresses` | SELECT כתובת של הזמנה בתשלום עם פריט שלו | נדרש למשלוח |
| `coupon_codes` | SELECT הקופונים שלו; מימוש רק דרך `redeem_coupon()` | ה-UPDATE policy מ-008 הוסר בכוונה |
| `coupon_scan_events` | SELECT של הספק שלו | INSERT/UPDATE/DELETE חסומים לכולם (כמו `audit_log`) |
| `payout_statements` + lines | SELECT של הספק שלו, לא-draft | כתיבה אדמין בלבד |
| `supplier_bank_accounts` | owner בלבד | |
| `supplier_disputes` | member קורא, owner פותח | סגירה אדמין בלבד |
| `cardcom_*` | אין גישה | אדמין בלבד |

עיקרון רוחבי: **כל כתיבה כספית עוברת דרך פונקציית SECURITY DEFINER עם ולידציית מעברים, לא דרך UPDATE ישיר**. זה מונע עקיפת לוגים, rate limit ומכונת מצבים.

---

## 3. מימוש קופונים

### 3.1 אסטרטגיית קוד + QR

לכל קופון שני מזהים:

1. **קוד 8 ספרות** (`coupon_codes.code`, קיים מ-008 עם CHECK): הזנה ידנית כשאין מצלמה. מרחב של 10^8 מוגן ב-rate limit (סעיף 3.3).
2. **טוקן QR חתום** (עמודות חדשות `qr_token`, `qr_key_id`):

```
KE1.<base64url(payload)>.<base64url(signature)>

payload (JSON מינימלי):
{
  "v": 1,                 -- גרסת פורמט
  "cid": "<coupon uuid>",
  "c":  "12345678",       -- הקוד הידני, כדי שסריקה תמלא אותו אוטומטית
  "sid": "<supplier uuid>",-- לזיהוי מקומי "זה לא שלך" עוד לפני השרת
  "exp": 1767225600        -- unix, תואם expires_at
}
```

- חתימה: **Ed25519**. המפתח הפרטי בסביבת השרת בלבד (`SUPPLIER_QR_SIGNING_KEY`), נטען ב-server action שמנפיק קופון אחרי תשלום. המפתח הציבורי מוטמע באפליקציית הסורק.
- `qr_key_id` מאפשר רוטציית מפתחות: הסורק מחזיק רשימת מפתחות ציבוריים לפי `kid`.
- למה לא HMAC: אימות offline דורש שהמוודא יחזיק את הסוד, וסוד סימטרי בתוך PWA של ספק = דלוף. חתימה אסימטרית פותרת את זה.

**גבול האחריות של החתימה**: החתימה מוכיחה *אותנטיות* (הקופון הונפק על ידינו, לא זויף, לא פג) והיא ניתנת לאימות offline. היא **לא** מוכיחה *חד-פעמיות*. חד-פעמיות נאכפת אך ורק ב-DB. סריקה במצב offline מציגה "קופון תקין, נדרש אישור אונליין" ונכנסת לתור סנכרון; הכסף נגבה רק אחרי אישור אונליין (ראו 3.5 ואיום 5.2).

### 3.2 נקודת הקצה והגנת מרוץ

route: `POST /api/supplier/redeem` (server action) שקורא ל-RPC יחיד:

```sql
public.redeem_coupon(p_code text, p_scan_method text) RETURNS jsonb
```

הגנת המרוץ היא UPDATE מותנה יחיד:

```sql
UPDATE coupon_codes SET status='used', used_at=now(), ...
WHERE code = p_code
  AND supplier_id = <הספק של הסורק>
  AND status = 'issued'
  AND expires_at > now()
  AND deleted_at IS NULL
RETURNING *;
```

שתי סריקות בו-זמניות: הראשונה נועלת את השורה ומעדכנת; השנייה ממתינה לנעילה, מעריכה מחדש את התנאי אחרי ה-commit, מוצאת `status='used'` ומעדכנת 0 שורות. אין צורך ב-SERIALIZABLE, אין חלון כפול-מימוש. זה כל הטריק, והוא אטומי ברמת Postgres.

סדר הפעולות המלא בפונקציה:

```
1. auth.uid() קיים? לא -> unauthorized
2. שליפת supplier_id מ-supplier_members (חבר פעיל) -> אין? unauthorized + לוג
3. check_user_rate_limit(uid, 'coupon_scan', 30, 60) -> חריגה? rate_limited + לוג
4. ה-UPDATE האטומי
5. נכשל? אבחון: not_found / wrong_supplier / already_used / refunded / expired
6. INSERT ל-coupon_scan_events (כל ניסיון, כולל כישלונות)
7. תשובה
```

**אנטי-אנומרציה**: `wrong_supplier` ו-`not_found` מוחזרים לסורק כ-`not_found` גנרי, כדי שספק לא יוכל למפות קודים תקפים של עסקים אחרים. התוצאה המדויקת כן נרשמת ב-`coupon_scan_events` לזיהוי fraud. לעומת זאת `already_used` (כולל מתי) ו-`expired` מוחזרים ביושר, כי זה קופון של הספק עצמו והמידע נחוץ מול לקוח בדלפק.

### 3.3 rate limiting

- `check_user_rate_limit(uid, 'coupon_scan', 30, 60)`: עד 30 ניסיונות לדקה למשתמש. ניחוש קוד 8 ספרות בקצב הזה אינו מעשי (בממוצע מיליוני שנים לקוד יחיד עם מרחב דליל).
- שכבה שנייה בצד ה-route (IP-based, קיים מ-002) נגד עקיפת המשתמש.
- ריבוי אירועי `rate_limited` או `wrong_supplier` פר ספק = התראה לאדמין (שאילתה על `coupon_scan_events`, שלב UI מאוחר).

### 3.4 מה העסק רואה בסריקה מוצלחת

התשובה של `redeem_coupon` בהצלחה:

```json
{
  "result": "success",
  "customer_name": "ישראל ישראלי",
  "product_name": "עיסוי זוגי 60 דק'",
  "face_value_ils": 400,
  "platform_paid_ils": 40,
  "collect_amount_ils": 360,
  "used_at": "..."
}
```

מסך האישור מדגיש בענק את **הסכום לגבייה בעסק** (`collect_amount_ils`), את שם הלקוח (לאימות מול תעודה במקרה חשד) ואת שם הדיל. הסכומים הם snapshot מרגע ההנפקה, לא חישוב חי.

### 3.5 UI סריקה (mobile-first, תיאור בלבד)

```
/supplier/scan  (PWA, מסך מלא)
+----------------------------------+
|  [ viewfinder מצלמה חי ]         |   BarcodeDetector API,
|                                  |   fallback: jsQR ב-canvas
|  - - - - מסגרת כיוון - - - -     |
|                                  |
|  [ הזנת קוד ידנית (8 ספרות) ]    |   numpad גדול
+----------------------------------+
          |
          v  (זיהוי QR: אימות חתימה מקומי מיידי ->
              "נראה תקין, מאשר מול השרת..." -> RPC)
+----------------------------------+     +----------------------------------+
|  מסך ירוק מלא + רטט              |     |  מסך אדום מלא                    |
|  לגבייה: 360 ש"ח                 |     |  X קופון כבר מומש                |
|  ישראל ישראלי                    |     |  מומש: 08/07 14:32               |
|  עיסוי זוגי 60 דק'               |     |  [סרוק שוב] [פנייה לתמיכה]       |
|  [סריקה הבאה]                    |     +----------------------------------+
+----------------------------------+
```

- ירוק/אדום על כל המסך: הכרעה מיידית גם בקופה עמוסה ובשמש.
- offline: אימות חתימה מקומי בלבד + באנר צהוב "אין רשת, המימוש ימתין לסנכרון"; המימוש נשלח כשחוזרת רשת. ברירת המחדל העסקית: לא למסור סחורה לפני אישור אונליין.

---

## 4. דשבורד ספק

מבנה (כל המסכים נשענים על ה-RLS מסעיף 2.5, בלי service key):

```
/supplier
  /dashboard    סיכומים: הזמנות ממתינות, מימושים היום, יתרה לתשלום
  /orders       פריטים למשלוח (order_items שלי במצב pending/issued בהזמנה בתשלום)
  /scan         מסך הסריקה (סעיף 3.5)
  /coupons      קופונים פעילים/ממומשים אצלי
  /statements   דוחות תקופתיים + פתיחת מחלוקת
  /settings     פרטי עסק (קריאה), פרטי בנק (owner), ניהול צוות (owner)
```

### 4.1 הזמנות למשלוח

- רשימת `order_items` של הספק בהזמנות בסטטוס `paid`/`partially_fulfilled`, כולל כתובת משלוח (policy ייעודי על `user_addresses`).
- עדכון סטטוס אך ורק דרך `update_shipping_status(item_id, 'shipped'|'delivered', carrier, tracking)`:

```
pending/issued --shipped(+carrier,tracking)--> shipped --delivered--> delivered
```

- הפונקציה מוודאת חברות, מוודאת שההזמנה בתשלום, אוכפת את המעברים, ומעדכנת את `orders.status` הכולל (`fulfilled` כשכל הפריטים הסתיימו, אחרת `partially_fulfilled`).
- `cancelled`/`refunded` נשארים פעולות אדמין (כרוכות בכסף).

### 4.2 דוחות ומחלוקות

- הספק רואה `payout_statements` בסטטוס `pending_approval` ומעלה. draft נסתר.
- מחלוקת: owner פותח `supplier_disputes` עם הפניה לדוח/שורה/פריט/קופון + סיבה. סטטוסים: `open -> in_review -> resolved_accepted | resolved_rejected` (מעברים על ידי אדמין).
- דוח עם מחלוקת פתוחה **לא ניתן לסמן כשולם**. נאכף בתוך `mark_payout_statement_paid`, לא רק ב-UI.

---

## 5. מנוע תשלומים (payout)

### 5.1 תקופות ותזמון

- מחזור התחשבנות: **חודש קלנדרי**, תשלום עד `payout_terms_days` (ברירת מחדל 15, "שוטף+15") אחרי סוף החודש. השדה פר ספק, כך שאפשר לחרוג ללקוחות גדולים.
- אין טבלת "תקופות" גלובלית: התקופה היא זוג `(period_start, period_end)` על הדוח, עם אינדקס ייחודי חלקי פר ספק שמונע שני דוחות חיים לאותה תקופה (מבוטל לא חוסם regeneration).

### 5.2 מחזור חיים של דוח

```
generate_payout_statement(supplier, start, end)   [admin]
   |  שורות physical: פריטים שנמסרו בתקופה, מהסנפשוטים של order_items
   |  שורות coupon: מימושים בתקופה, payout=0 (מידע)
   |  נעילת כפילות: NOT EXISTS על שורות בדוחות לא-מבוטלים
   v
pending_approval --approve_payout_statement--> approved
   |                                              |
   |                            mark_payout_statement_paid(ref)
   |                              - חוסם אם יש מחלוקת פתוחה
   |                              - מקפיא bank_snapshot מהחשבון הפעיל
   v                                              v
cancelled (מוחק שורות => הפריטים חוזרים להיות זמינים לדוח הבא)   paid
```

עקרונות:
- **שום סכום לא מחושב מחדש בזמן הדוח**: `gross`, `platform_fee`, `payout` מגיעים מהסנפשוטים שנוצרו בזמן ההזמנה. שינוי `platform_percent` היום לא נוגע בעסקאות אתמול.
- פריט נכנס לדוח לפי `delivered_at` (עם fallback ל-`fulfilled_at` לנתונים ישנים), לא לפי תאריך הזמנה: משלמים רק על מה שסופק.
- החזר כספי אחרי דוח = שורת `adjustment` שלילית בדוח הבא (המבנה תומך; חישוב אוטומטי הוא שלב עתידי).
- `statement_number` רץ (`PS-000001`) מ-sequence, לצרכי הפניה בחשבונית מס עצמית.

### 5.3 התאמה מול Cardcom (reconciliation)

מטרה: לוודא שכל שקל שנסלק אצל Cardcom באמת הגיע, לפני שמשלמים לספקים ממנו.

```
קובץ/דוח סליקה של Cardcom (ידני או API, שלב עתידי)
   -> INSERT cardcom_settlements (תאריך, סכום הפקדה, raw jsonb)
   -> INSERT cardcom_settlement_txns (שורה פר עסקה: cardcom_payment_id, סכום)
   -> reconcile_cardcom_settlement(id):
        JOIN מול orders.cardcom_payment_id
        matched          סכום זהה
        amount_mismatch  נמצא, סכום שונה (חיוב חלקי? עמלה? לבדיקה)
        unmatched        אין הזמנה כזו (חור בצנרת ההזמנות!)
```

אדמין בלבד. שורות `unmatched` ו-`amount_mismatch` הן תור עבודה ידני ב-admin. הקישור לדוחות ספקים עקיף: לא משלמים דוח על תקופה שבה ההתאמה טרם הושלמה (כלל תפעולי, לא constraint, בשלב זה).

---

## 6. מודל איומים

| # | איום | וקטור | מיטיגציה |
|---|---|---|---|
| 6.1 | QR מזויף | לקוח מייצר QR שנראה אמיתי | חתימת Ed25519; בלי המפתח הפרטי אין טוקן תקף. הקוד הידני לבדו לא מספיק לזיוף כי המימוש נבדק מול DB |
| 6.2 | שימוש חוזר בצילום מסך | לקוח מציג screenshot של קופון שכבר מומש (או של חבר) | חד-פעמיות ב-DB היא ההגנה היחידה שעובדת: ה-UPDATE האטומי מכשיל את הסריקה השנייה עם `already_used` + מועד המימוש הראשון. שם הלקוח על המסך מאפשר אימות זהות. QR מתחלף/TOTP נשקל ונדחה כ-overkill לשלב זה |
| 6.3 | ניחוש קודים (enumeration) | ספק/בוט מריץ קודים בני 8 ספרות | rate limit 30/דקה למשתמש + שכבת IP; תשובה גנרית `not_found`; כל ניסיון נרשם ב-`coupon_scan_events` |
| 6.4 | ספק סורק קופון של עסק אחר | סורק מקבל קוד תקף של מתחרה | ה-UPDATE מסונן על `supplier_id` של הסורק; נרשם `wrong_supplier` בלוג אך מוחזר `not_found` |
| 6.5 | ספק מדווח "לא מומש" אחרי מימוש (הכחשה) | מחלוקת מול לקוח | `coupon_scan_events` הוא append-only וכולל מי סרק, מתי ובאיזו שיטה; אי אפשר למחוק או לערוך גם לא לאדמין דרך ה-API |
| 6.6 | עובד ממאיס (סורק) גונב נתונים | scanner מנסה לקרוא בנק/דוחות | הפרדת `member_role`: בנק owner בלבד; דוחות member; חברות `is_active=false` מנתקת מיידית |
| 6.7 | ספק מזייף משלוח | מסמן `delivered` בלי לשלוח | `update_shipping_status` דורש הזמנה בתשלום ורושם ל-audit; מחלוקות לקוח + עיכוב תשלום עד `delivered` בתקופה; בעתיד: אימות מסירה מול חברת שילוח |
| 6.8 | self-approval | ספק מנסה לאשר את הבקשה/הדוח של עצמו | כל פונקציות האישור בודקות `is_admin()` בתוך הפונקציה, לא רק ב-UI |
| 6.9 | עקיפת הפונקציות בכתיבה ישירה | UPDATE ישיר על `coupon_codes`/`order_items` | אין UPDATE policy לספקים על הטבלאות האלה (זו של 008 הוסרה במכוון); הדרך היחידה היא ה-RPC |
| 6.10 | דליפת מפתח חתימה | המפתח הפרטי נחשף | `qr_key_id` מאפשר רוטציה; קופונים ישנים ממשיכים להיאמת מול המפתח הישן ברשימת המפתחות; חדשים נחתמים בחדש. בכל מקרה החתימה לא מקנה מימוש, רק אותנטיות |
| 6.11 | הרעלת דוח (double settlement) | אותו פריט בשני דוחות | אינדקסים ייחודיים חלקיים + `NOT EXISTS` מול דוחות לא-מבוטלים; ביטול דוח מוחק שורות ולכן אין רשומת שיוך יתומה |

---

## 7. מה נשאר מחוץ למיגרציה (אפליקציה, שלבים הבאים)

1. הנפקת קופון אחרי תשלום Cardcom: יצירת `coupon_codes` + חתימת `qr_token` (server action, מפתח ב-env).
2. מסכי `/supplier/*` ומסכי אדמין (בקשות, דוחות, reconciliation).
3. תזמון `expire_coupons()` (pg_cron או edge function יומי עם service key).
4. יצירת PDF לדוח + העלאה ל-bucket `supplier-docs` בנתיב `<supplier_id>/...`.
5. התראות (מייל לספק על הזמנה חדשה, לאדמין על בקשה חדשה).

## 8. הוראות החלה (כשיוחלט)

- לא להריץ `db push` (היסטוריה לא מסונכרנת). להחיל דרך Supabase MCP
  `apply_migration`
  כמו 019/020/021/025.
- תנאים מוקדמים ב-DB החי: 016 (name_he), 019 (rate limit), 025 (audit fn). לוודא לפני.
- אחרי החלה: `generate_typescript_types` ועדכון `src/types/database.ts`.

---

## 9. שאלות פתוחות

1. **איחוד `vendors` -> `suppliers`**: `coupon_deals.vendor_id` עדיין מפנה ל-`vendors`. נדרשת מיגרציית איחוד (העברת שורות, הפניית FK, מחיקת הטבלה) או החלטה ש-coupon_deals נטמעים ב-products. מומלץ לסגור לפני בניית ה-UI של הפורטל.
2. **הצפנת פרטי בנק**: כרגע RLS + audit בלבד. אם רגולציה/ביטוח ידרשו, להוסיף pgsodium. החלטה עסקית.
3. **תוקף קופון ברירת מחדל**: כמה זמן מהרכישה עד `expires_at`? (לחוק הגנת הצרכן יש דרישות מינימום לשוברים; דורש ייעוץ). כרגע נקבע פר דיל באפליקציה.
4. **קופון שפג בלי מימוש**: הפלטפורמה גבתה `platform_paid_ils` והלקוח לא קיבל כלום. החזר אוטומטי לארנק? שמירת הכסף? החלטה עסקית עם השלכת קוד קטנה (job על `expired`).
5. **מחיר קופון = platform_percent בלבד?** ההנחה כאן (לפי 015 והבריף): התשלום באתר הוא בדיוק חלק הפלטפורמה. אם בעתיד ירצו שהתשלום באתר יתחלק גם עם העסק, שורות ה-coupon בדוח כבר בנויות לשאת payout שונה מאפס.
6. **ריבוי ספקים למשתמש ב-UI**: המבנה תומך, `current_supplier_id()` בוחר את הראשון. אם יידרש מיתוג ספקים, להוסיף בורר ולהעביר `supplier_id` מפורש ל-RPCs.
7. **cardcom_payment_id ייחודיות**: אין unique constraint על `orders.cardcom_payment_id` כיום. אם Cardcom מבטיח ייחודיות, כדאי להוסיף באחת המיגרציות הבאות (משפר את ההתאמה).
