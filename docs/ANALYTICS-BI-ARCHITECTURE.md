# ארכיטקטורת אנליטיקה ו-Business Intelligence

מסמך תכנון. מיגרציה נלווית (טיוטה, **לא הוחלה**):
`supabase/migrations/033_analytics.sql`

תאריך: 2026-07-09. ענף: `phase5/homepage`.
מסמכים קשורים: `COMMERCE-ARCHITECTURE.md` (026), `SUPPLIER-REDEMPTION-ARCHITECTURE.md` (027),
`ACCOUNT-IDENTITY-ARCHITECTURE.md` (029), `CATALOG-SEARCH-SEO-ARCHITECTURE.md` (030),
`NOTIFICATIONS-MARKETING-ARCHITECTURE.md` (031), `PRODUCTION-OPS-ARCHITECTURE.md`, `MASTER-ARCHITECTURE.md`.

> מספור: 032 נתפסה על ידי `032_wp_import_staging.sql` (ייבוא מוורדפרס); איחוד `vendors -> suppliers`
> (סעיף 2.4 במסמך האב) יקבל מספר עתידי פנוי. מיגרציית הדומיין הזה היא **033**.
> תנאים מוקדמים קשיחים: 026 (עמודות snapshot על `order_items`, `payments`, `wallet_accounts`) ו-027
> (עמודות snapshot על `coupon_codes`, `coupon_scan_events`). המיגרציה נכשלת מוקדם ובמכוון אם הם חסרים.
> 030 (`search_queries`) ו-031 (`notification_conversions`) אופציונליים: ה-views שלהם נוצרים רק אם הטבלאות קיימות.

---

## 0. עקרונות על

1. **שני מישורים, לעולם לא מערבבים.** כסף ועובדות עסקיות חיים בטבלאות המקור
   (`orders`, `order_items`, `payments`, `wallet_transactions`, `coupon_codes`, `coupon_scan_events`).
   התנהגות (צפיות, עגלה, checkout) חיה ב-`analytics_events`.
   **אסור לסכום כסף מאירועי אנליטיקה.** הכנסה נקראת תמיד מה-ledger; אירועים סופרים התנהגות בלבד.
   זה מבטל מראש את בעיית ה"דשבורד לא מסתדר עם הנהלת החשבונות" שכל מערכת אנליטיקה כפולה סובלת ממנה.
2. **first-party בלבד.** האיסוף כולו לתוך Supabase. אין GA4, אין פיקסלים, אין צד שלישי (הכרעה בסעיף 2.2).
3. **מספרים להחלטה, לא לגאווה.** כל מדד בדשבורד חייב לענות על "איזו פעולה אעשה אם המספר רע".
   אין impressions, אין "עמודים לביקור". יש הכנסת פלטפורמה, שיעור מימוש, התחייבות ארנק, והתראות כסף.
4. **snapshot הוא מקור האמת ההיסטורי.** כל חישוב הכנסה משתמש ב-`platform_fee_ils` (ו-`platform_paid_ils`
   על קופונים) שהוקפאו בזמן רכישה. שינוי `platform_percent` היום לא מזיז אף דוח עבר. אין חישוב אחוזים בדיעבד.
5. **יום עסקים = יום Asia/Jerusalem.** אחסון UTC (`timestamptz`), כל בקיטה לדוח דרך
   `fn_il_date(ts)`. לעולם לא `::date` ישיר על timestamptz (זה יום UTC, שקו החצות שלו נופל ב-02:00/03:00 בלילה בישראל).

---

## 1. טקסונומיית אירועים

### 1.1 סכימה קנונית (envelope)

כל אירוע, מכל מקור, נושא את אותה מעטפת:

| שדה | טיפוס | חובה | הערות |
|---|---|---|---|
| `event_id` | uuid | כן | נוצר אצל השולח; מפתח הדה-דופ. retry שולח את אותו id |
| `event_name` | text | כן | snake_case, מתוך ה-registry בלבד (1.3) |
| `schema_version` | smallint | שרת | נכתב מה-registry בזמן ingest, לא מהלקוח |
| `occurred_at` | timestamptz | כן | זמן האירוע אצל השולח; ingest מצמיד לחלון [now-7d, now+5m] |
| `source` | text | כן | `web` / `pwa` / `server` |
| `anonymous_id` | text | לקוח | עוגיית `ke_session_id` הקיימת (אותה עוגייה של עגלת אורח, כדי שנטישת עגלה תתחבר ל-`carts.session_id`) |
| `session_id` | text | לקוח | סשן מתגלגל 30 דקות, נוצר בצד לקוח |
| `user_id` | uuid | אם מחובר | נכתב על ידי ה-route מהסשן, לעולם לא מהלקוח |
| `path`, `referrer` | text | לקוח | |
| `utm` | jsonb | אם קיים | `{source, medium, campaign, content, term}` |
| `props` | jsonb | פר אירוע | מפתחות חובה לפי ה-registry; עד 4KB |
| `ip_trunc`, `user_agent`, `is_bot` | | שרת | IP קטום ל-/24 (IPv6: /48); בלי IP מלא |

### 1.2 האירועים הקנוניים

| event_name | origin | props חובה | מקור אמת |
|---|---|---|---|
| `page_view` | client | (אין) | `analytics_events` |
| `view_product` | client | `product_id` | `analytics_events` |
| `view_category` | client | `category_id` | `analytics_events` |
| `add_to_cart` | client | `product_id`, `quantity` | `analytics_events` |
| `remove_from_cart` | client | `product_id` | `analytics_events` |
| `begin_checkout` | server | `order_id`, `items_count` | `analytics_events` (נפלט מ-`beginCheckout`) |
| `purchase` | **derived** | | `orders.paid_at` (מעבר paid בטרנזקציית ה-webhook) |
| `refund` | **derived** | | `payments` בסטטוס succeeded עם `kind='refund'` |
| `coupon_scan` | **derived** | | `coupon_scan_events` (כל ניסיון, כולל כשלונות) |
| `wallet_earn` | **derived** | | `wallet_transactions` עם credit לחשבון user |
| `wallet_spend` | **derived** | | `wallet_transactions` עם debit מחשבון user |
| `search` | **derived** | | `search_queries` (030) |

**הכרעת המפתח: אירועי `derived` לא נכתבים ל-`analytics_events` בכלל.** יש להם כבר טבלת מקור
append-only עם snapshot כספי. כתיבה כפולה (גם לטבלת המקור וגם לאירועים) היא מתכון ל-drift
ולשני מספרים שונים לאותה שאלה. ה-views בסעיף 4 קוראים אותם ישירות מהמקור.
לכן אין triggers חדשים על טבלאות הליבה, אין הכפלת נפח, ואין סיכון לצנרת התשלומים.

### 1.3 registry, כללי שמות וגרסאות

- טבלת `analytics_event_definitions` היא מקור האמת: `event_name` (PK), `origin`, `required_props`,
  `schema_version`, `is_active`. ה-ingest דוחה אירוע שלא רשום או שחסר לו prop חובה.
  זה חוסם junk cardinality (טעויות כתיב יוצרות סדרות מתות בדשבורד).
- שמות: `snake_case`, פועל ואז אובייקט (`view_product`, `add_to_cart`), אנגלית בלבד,
  3-50 תווים (CHECK בטבלה). `purchase` ו-`refund` הם שמות תעשייה מקובלים ונשארים כמות שהם.
- **גרסאות:** שינוי מוסיף (prop אופציונלי חדש) לא מעלה גרסה. שינוי שובר (שינוי משמעות/טיפוס
  של prop, הוספת prop חובה) מעלה `schema_version` ומעדכן `required_props` באותה שורה.
  ה-ingest חותם על כל שורה את הגרסה שבתוקף בזמן הכתיבה, כך שאפשר לפלח לפי גרסה בדיעבד.
- **אסור לשנות שם אירוע.** שם שגוי = השבתה (`is_active=false`) ורישום שם חדש. היסטוריה לא משוכתבת.
- אירוע חדש = INSERT ל-registry (אדמין, עם audit trigger), בלי מיגרציה.

---

## 2. צנרת איסוף

### 2.1 חלוקת לקוח/שרת

```
לקוח (דפדפן / PWA)                          שרת
  page_view, view_product, view_category,     begin_checkout  (בתוך ה-server action,
  add_to_cart, remove_from_cart                אחרי יצירת ההזמנה, service client)
      |                                            |
      | batch עד 20 אירועים, flush כל 10 שניות     |
      | או ב-pagehide דרך navigator.sendBeacon     |
      v                                            v
POST /api/a  (route handler)  ------------------->+
  - קורא session (user_id מהשרת, לא מהלקוח)
  - בדיקת עוגיית הסכמה (2.3): אין הסכמה -> 204, drop
  - rate limit IP (תשתית 002): ~120 אירועים לדקה ל-IP
  - service client -> rpc fn_ingest_analytics_events(batch, user_id, ip, ua)
      v
fn_ingest_analytics_events  (SECURITY DEFINER, service role בלבד)
  - ולידציה מול ה-registry (שם, origin, props חובה)
  - clamp של occurred_at, סימון is_bot לפי user_agent, קיטום IP
  - INSERT ... ON CONFLICT (occurred_at, event_id) DO NOTHING   <- דה-דופ
      v
analytics_events  (partitioned, סעיף 2.4)
```

- אירוע שנפל בולידציה נזרק בשקט (הפונקציה מחזירה כמה נכנסו). אנליטיקה לעולם לא מפילה UX:
  כשל ב-`/api/a` נבלע בצד לקוח בלי retry loop אגרסיבי (נסיון אחד + פעם אחת ב-flush הבא).
- `purchase` לא נפלט מדף התודה (הדפדפן לא אמין: סוגרים טאב, redirect נכשל). ספירת רכישות
  היא תמיד `orders.paid_at`, שנכתב בטרנזקציית ה-webhook המאומתת של Cardcom.

### 2.2 הכרעה: first-party בתוך Supabase, בלי כלי חיצוני

| קריטריון | first-party (Supabase) | GA4 | PostHog Cloud EU |
|---|---|---|---|
| חיבור להכנסה אמיתית (snapshot, ארנק) | JOIN ישיר | ידני, כפול, לא מסתדר | חלקי, דורש sync |
| הסכמה ופרטיות | אין צד שלישי, IP קטום | consent mode, DPA, דיווח לחו"ל | DPA, עלות |
| עלות | כלול ב-DB הקיים | חינם אבל הזמן שלך יקר | ~$0 בהתחלה, גדל |
| עקומת למידה לבעלים יחיד | דשבורד אחד ב-/admin שכבר קיים | ממשק שנלחמים בו | עוד מערכת לתחזק |
| session replay / heatmaps | אין | אין | יש |

**החלטה: איסוף first-party לתוך Supabase, בלי שום כלי חיצוני בשלב זה.**
לבעלים יחיד יש דשבורד אחד, וכל מספר בו ניתן להצלבה ישירה מול ה-ledger. שני טריגרים לפתיחת ההחלטה מחדש:
(א) התחלת רכישת מדיה בתשלום (אז נדרש ייבוא conversions לפלטפורמות הפרסום);
(ב) מעל ~200 אלף אירועי לקוח בחודש או צורך אמיתי ב-session replay, ואז PostHog EU כתוספת, לא כתחליף.
Vercel Speed Insights (ביצועים, לא התנהגות) מאושר בנפרד במסמך ה-ops ואינו סותר.

### 2.3 הסכמה ופרטיות (דין ישראלי)

הבסיס: חוק הגנת הפרטיות + תיקון 13 (בתוקף מאוגוסט 2025): צמצום נתונים, מטרה מוגדרת, שקיפות.
בישראל אין חוק עוגיות נפרד בנוסח ePrivacy, אבל הנחיות הרשות להגנת הפרטיות מחייבות יידוע והסכמה
מדעת לניטור התנהגותי. המדיניות:

1. **רשומות עסקיות אינן מותנות בהסכמה:** הזמנות, תשלומים, סריקות קופון, ארנק, `begin_checkout`
   (חלק מעסקה שהמשתמש יזם). אלה נאספים תמיד; הם תפעול האתר, לא מעקב.
2. **אירועי התנהגות בדפדפן מותנים בהסכמה:** באנר הסכמה (עברית, RTL) עם קבלה/דחייה שוות מעמד.
   בלי הסכמה: אפס אירועי לקוח, ה-SDK לא נטען. ההסכמה נשמרת בעוגיית `ke_consent`
   (12 חודשים) עם `wording_version`, באותו דפוס של `consent_events` מ-031.
3. **צמצום מובנה:** IP נקטם לפני אחסון (/24, IPv6 /48), אין fingerprinting, אין מזהי צד שלישי,
   `props` לעולם לא מכיל PII (שם, טלפון, מייל, כתובת). המזהים היחידים: `user_id` פנימי ועוגיית סשן.
4. **מחיקת חשבון (029):** job המחיקה מאפס `user_id` בשורות `analytics_events` של הנמחק
   (אין FK בכוונה, כדי שה-partitions יישארו זולים; המחיקה היא UPDATE ממוקד באינדקס user_id).
   השורות האנונימיות נשארות (סטטיסטיקה, לא מידע אישי).

### 2.4 אחסון: partitioning ו-retention

- `analytics_events` היא טבלה מפורקת (declarative partitioning) לפי `RANGE (occurred_at)`,
  partition לחודש קלנדרי (UTC), בשם `analytics_events_YYYYMM`, ועוד partition בשם
  `analytics_events_default` כרשת ביטחון (אמור להישאר ריק; שורה בו = התראה).
- `PRIMARY KEY (occurred_at, event_id)`: מפתח החלוקה חייב להיכלל, וה-unique הזה הוא גם הדה-דופ.
- `fn_ensure_analytics_partitions(2)` רץ חודשי ויוצר [חודש קודם .. חודש+2] כולל הפעלת RLS על כל
  partition חדש (partition הוא טבלה נפרדת שחייבת RLS משלה נגד גישה ישירה דרך PostgREST).
- `fn_drop_old_analytics_partitions(13)` מוחק partitions מעבר ל-13 חודשים. DROP של partition
  הוא מיידי וזול (בלי DELETE, בלי vacuum). לפני המחיקה ה-rollup היומי כבר שימר את מה שחשוב.
- ב-free tier (500MB) זה הדומיין הראשון שמתנפח; ה-rollup היומי (`analytics_daily`) הוא זה
  שנשמר לנצח, והוא זעיר (שורות בודדות ליום).

---

## 3. מודל הכנסות

### 3.1 הגדרת הכנסת פלטפורמה (per-order)

לכל שורת הזמנה ששולמה:

| סוג פריט | GMV (מחזור) | הכנסת פלטפורמה | חוב לספק | נגבה בעסק |
|---|---|---|---|---|
| physical | `total_price_ils` | `platform_fee_ils` | `supplier_due_ils` | 0 |
| coupon | `total_price_ils` (שווי הפנים) | `platform_fee_ils` (= כל מה שנגבה באתר) | 0 | `balance_due_at_business_ils` |

- הכול מעמודות ה-snapshot של 026. שורות היסטוריות שלפני 026 מכוסות על ידי ה-backfill
  שהוגדר שם (`commission_percent`/`supplier_payout_ils` הישנים שוכפלו לעמודות החדשות).
- **GMV של קופון הוא שווי הפנים, לא התקבול.** התקבול באתר הוא `charged_on_site_ils`.
  שלושת המספרים מוצגים בנפרד בדשבורד: מחזור (GMV), תקבולים באתר (cash-in), הכנסת פלטפורמה (revenue).
  אצל בעלים יחיד הבלבול בין השלושה הוא הדרך המהירה ביותר להחלטות שגויות.
- **הכנסה מוכרת בזמן `paid`** (מזומן התקבל). ההחזרים מדווחים כשורה שלילית נפרדת לפי יום ההחזר
  (`payments` עם `kind='refund'`), לא כשכתוב של יום המכירה. כך גרף העבר לעולם לא זז רטרואקטיבית.
- ארנק: `cashback_applied_ils` הוא הנחה במקור מימון הפלטפורמה; הוא לא מקטין GMV ולא את חלק הספק
  (הכרעת O5 ב-026). הדשבורד מציג אותו כעמודת "מומן מארנק".

### 3.2 משפך הקופון

מכונת המצבים של 026/027 קובעת: קוד קופון **נוצר רק בתשלום**. כלומר "issued" ו-"paid" הם אותו רגע,
ומשפך המסחר המלא הוא שני שלבים מובחנים:

```
התנהגות (analytics_events):  view_product -> add_to_cart -> begin_checkout
                                                              |
כסף (orders):                                          orders.paid_at
                                                              |
נכס (coupon_codes):        issued --+--> used      (redeem_coupon, מימוש בעסק)
                                    +--> expired   (cron, פקע בלי מימוש)
                                    +--> refunded  (החזר אדמין)
```

מדדי ההכרעה (כולם ב-`v_coupon_funnel_monthly`):

- **scan rate**: `used / (used + expired)` על קופונים שהגיעו למצב סופי. זה מדד הבריאות המרכזי
  של העסק: קופון שפג בלי מימוש = לקוח שנכווה, וספק שלא ראה את הלקוח. יעד מובהק לתזכורות של 029/031.
- **median days to scan**: חציון ימים מהנפקה למימוש. קובע את ברירת המחדל של `expires_at` ואת
  תזמון התזכורות (7d/48h).
- **outstanding**: קופונים `issued` פתוחים: כמה, כמה `platform_paid_ils` כבר בקופה שלנו, וכמה
  `collect_amount_ils` העסקים עוד אמורים לגבות. זה גם המספר של שאלת המדיניות הפתוחה
  (קופון שפג: החזר או לא, שאלה 9.4 במסמך הספקים).

### 3.3 לוח מנהיגות ספקים

`v_supplier_leaderboard_30d`, שורה פר ספק, חלון 30 יום:
GMV, הכנסת פלטפורמה, כמות פריטים, סריקות מוצלחות/כושלות (מ-`coupon_scan_events`, כולל
`wrong_supplier` שהוא אות fraud), שיעור מימוש 90 יום, מחלוקות פתוחות.
ההחלטות שהוא משרת: את מי לקדם בדף הבית, את מי לחייב ב-`platform_percent` גבוה יותר בחידוש,
ומי מסמן סיכון (הרבה סריקות כושלות או מחלוקות).

### 3.4 cohort LTV

`v_cohort_ltv_monthly`: קוהורטת חודש-רכישה-ראשונה, ולכל (קוהורטה, חודש-סטייה): קונים פעילים,
הכנסת פלטפורמה מצטברת, והכנסה מצטברת פר חבר קוהורטה. המספר האחרון הוא תקרת עלות רכישת לקוח
(CAC ceiling) ביום שבו יתחיל פרסום בתשלום, ועד אז הוא מודד אם המוצר מחזיק לקוחות בכלל.
בסיס ההכנסה הוא `platform_fee_ils` (מה שאנחנו באמת מרוויחים), לא GMV.

### 3.5 התחייבות ארנק (wallet liability)

יתרות cashback הן **חוב אמיתי של הפלטפורמה ללקוחות**, לא מדד שיווקי.

- **ההתחייבות = `sum(balance_ils)` על כל חשבונות ה-user** ב-`wallet_accounts`. בזכות ה-double-entry
  של 026 אין דרך להזרים יתרה אלא מחשבון פלטפורמה, אז המספר תמיד ניתן לגזירה גם מה-ledger.
- `v_wallet_ledger_drift` משווה כל יתרה שמורה מול השחזור מה-ledger ומחזירה רק שורות סוטות.
  שורה אחת = באג או התערבות ידנית; זו התראה אדומה ב-`v_money_alarms`, נבדקת לילית.
- **תנאי לנכונות ה-drift view:** העתקת היתרות ההיסטוריות ב-026 חייבת להיעשות כרשומת פתיחה
  ב-ledger (שורת `manual_adjust` מ-`platform:adjustments` עם idempotency key בסגנון
  `opening:<user_id>`), לא כהעתקת עמודה שקטה. אחרת כל חשבון ותיק יסטה מיום אחד. זו עריכה
  נדרשת ל-026 לפני החלה (נרשם בסיכום ההחלטות).
- תנועת היום (`wallet_earn` / `wallet_spend` / `expire`) נקראת ישירות מ-`wallet_transactions`
  לפי `reason`; אין צורך באירועים נוספים.

---

## 4. דשבורדים

### 4.1 הדשבורד היומי היחיד של הבעלים

מסך אחד ב-`/admin/dashboard` (מרחיב את הקיים), שנקרא פעם ביום עם הקפה. שתי שכבות:
שורת התראות (אם יש) ואז המספרים. המקור: `v_owner_dashboard` (שורה אחת) + `v_money_alarms`.

**חשוב:** את ה-views קוראים בצד השרת עם service client אחרי `requireAdminSession`. ה-views
מוגדרים `security_invoker` ולכן קריאה עם JWT של אדמין תיתקל בחורים ב-RLS ישן (למשל אין policy
אדמין על `carts`); service role עוקף את זה, וההגנה היא ה-guard באפליקציה, כמו בשאר האדמין.

| # | מדד | למה זה decision-grade | מקור |
|---|---|---|---|
| 0 | `v_money_alarms` (תשלומים כושלים, חתימות webhook לא תקינות, תשלומים תקועים, drift בארנק, שורות ב-default partition, הזמנות pending שלא פגו) | כל שורה = תקלת כסף שמטופלת היום, לא בסוף החודש | payments, webhook_events, drift view |
| 1 | הכנסת פלטפורמה היום / אתמול / ממוצע 7 ימים | המספר. מתחת לממוצע = לחפור למה עוד היום | order_items snapshot |
| 2 | הזמנות ששולמו + AOV היום | מפריד "פחות הזמנות" מ"הזמנות קטנות" | orders |
| 3 | GMV מול תקבולים באתר | פער גדול = תלות בקופונים (תזרים אצל הספקים) | order_items |
| 4 | לקוחות ראשונים היום | צמיחה אמיתית מול לקוחות חוזרים | orders (min paid_at) |
| 5 | סריקות קופון היום (הצלחות + כשלונות) | כשלונות רבים = בעיה בשטח אצל ספק, מתקשרים אליו היום | coupon_scan_events |
| 6 | שיעור מימוש 30 יום | ירידה = התזכורות לא עובדות או דיל גרוע נמכר | coupon_codes |
| 7 | קופונים פתוחים: כמות + ₪ ששולם לנו + ₪ לגבייה בעסק | החשיפה התפעולית המצטברת מול לקוחות וספקים | coupon_codes snapshot |
| 8 | התחייבות ארנק (סך יתרות לקוחות) + cashback שחולק היום | חוב אמיתי; קופץ פתאום = באג או ניצול | wallet_accounts |
| 9 | החזרים היום (₪) | יום החזרים חריג מטופל מיידית | payments kind=refund |
| 10 | עגלות נטושות פתוחות (1-72 שעות) | דלק למסע ה-abandoned_cart של 031 | carts |
| 11 | סשנים היום + יחס המרה גס (הזמנות/סשנים) | ההקשר לכל השאר: תנועה או המרה | analytics_events |

sketch מרכזי (המימוש המלא ב-033):

```sql
-- הכנסת פלטפורמה ליום עסקים ישראלי
SELECT public.fn_il_date(o.paid_at) AS day_il,
       count(DISTINCT o.id)          AS paid_orders,
       sum(oi.total_price_ils)       AS gmv_ils,
       sum(oi.charged_on_site_ils)   AS charged_on_site_ils,
       sum(oi.platform_fee_ils)      AS platform_revenue_ils,
       sum(oi.cashback_earned_ils)   AS cashback_granted_ils
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.paid_at IS NOT NULL AND o.deleted_at IS NULL AND oi.deleted_at IS NULL
GROUP BY 1;                                   -- = v_revenue_daily
```

```sql
-- התחייבות ארנק (החוב ללקוחות עכשיו)
SELECT COALESCE(sum(balance_ils), 0) AS outstanding_cashback_ils,
       count(*) FILTER (WHERE balance_ils > 0) AS users_with_balance
FROM public.wallet_accounts
WHERE owner_type = 'user';                    -- = v_wallet_liability
```

```sql
-- משפך קופונים לפי חודש הנפקה
SELECT date_trunc('month', (created_at AT TIME ZONE 'Asia/Jerusalem'))::date AS issue_month,
       count(*)                                                        AS issued,
       count(*) FILTER (WHERE status = 'used'::public.coupon_status)    AS scanned,
       count(*) FILTER (WHERE status = 'expired'::public.coupon_status) AS expired,
       count(*) FILTER (WHERE status = 'issued'::public.coupon_status)  AS outstanding,
       round(100.0 * count(*) FILTER (WHERE status = 'used'::public.coupon_status)
         / NULLIF(count(*) FILTER (WHERE status IN
             ('used'::public.coupon_status, 'expired'::public.coupon_status)), 0), 1) AS scan_rate_pct
FROM public.coupon_codes
WHERE deleted_at IS NULL
GROUP BY 1;                                   -- = v_coupon_funnel_monthly (מקוצר)
```

### 4.2 עיון שבועי (weekly deep-dive)

נקרא פעם בשבוע, לא כל בוקר:

| view | שאלה שהוא עונה עליה |
|---|---|
| `v_funnel_daily` | איפה המשפך דולף: צפייה -> עגלה -> checkout -> תשלום, יחס יומי |
| `v_cohort_ltv_monthly` | האם לקוחות חוזרים, וכמה שווה לקוח לאורך זמן |
| `v_supplier_leaderboard_30d` | את מי לקדם, את מי לתמחר מחדש, מי מסוכן |
| `v_channel_revenue_weekly` | מאיפה מגיעה הכנסה (UTM last-touch מ-`orders.attribution`) |
| `v_search_quality_daily` (אם 030 הוחלה) | zero-results ו-p95 של החיפוש; מזין את ספי Meilisearch |
| `v_notification_kpis` + `v_journey_revenue` (031, קיימים שם) | האם המסעות מרוויחים את קיומם |

ייחוס ערוצים: 033 מוסיפה `orders.attribution` (jsonb): `beginCheckout` כותב לתוכו first-touch
ו-last-touch (utm + referrer + landing) מעוגיית ייחוס בת 30 יום. זה נותן הכנסה-לפי-ערוץ ישירות
על טבלת הכסף, בלי stitching של סשנים. ייחוס הודעות כבר פתור ב-031 (`notification_conversions`)
ולא מוכפל כאן.

---

## 5. איכות דאטה

1. **דה-דופ:** `event_id` נוצר פעם אחת אצל השולח; retry שולח את אותו זוג (event_id, occurred_at);
   `ON CONFLICT DO NOTHING` על ה-PK בולע כפילויות. בצנרת הכסף הדה-דופ כבר קיים (webhook events,
   idempotency keys) ולא נוגעים בו.
2. **בוטים:** סימון בזמן ingest (`is_bot` לפי regex על user_agent: crawlers, headless, monitors,
   preview bots של וואטסאפ/פייסבוק). שומרים ולא זורקים (לזיהוי scraping), אבל כל rollup וכל view
   מסננים `NOT is_bot`. ה-route גם דורש Content-Type ו-Origin תקינים.
3. **תנועת צוות:** ה-rollup מסנן משתמשים עם role של admin / super_admin / content_uploader.
   הבעלים שבודק את האתר שלו עשר פעמים ביום הוא זיהום המדידה הגדול ביותר בעסק קטן.
4. **אזור זמן:** אחסון UTC בלבד; בקיטה אך ורק דרך `fn_il_date` (Asia/Jerusalem, מטפל ב-DST).
   ה-partitions הם חודשי UTC (גבול טכני), הדוחות הם ימי ישראל (גבול עסקי); ה-rollup מתרגם.
5. **שעון לקוח:** `occurred_at` עתידי מעל 5 דקות מוצמד ל-now(); ישן מ-7 ימים נזרק (בין השאר
   מגן על partitions שנמחקו מכתיבה מחודשת).
6. **Retention:**

| דאטה | שמירה | מנגנון |
|---|---|---|
| `analytics_events` (raw) | 13 חודשים | DROP partition חודשי |
| `analytics_daily` (rollup) | לנצח | זעיר |
| `orders` / `order_items` / `payments` / `wallet_transactions` / `coupon_codes` | לנצח (7 שנים לפחות, הוראות מס) | אין purge |
| `coupon_scan_events` | 90 יום (הוחלט ב-PRODUCTION-OPS; ה-truth למימוש הוא `coupon_redemptions`) | purge job של אותו דומיין |
| `search_queries` (030) | 6 חודשים | purge job של דומיין הקטלוג |

7. **בדיקת שפיות מובנית:** `v_money_alarms` כוללת גם `analytics_default_partition_rows`
   (ה-default partition אמור להיות ריק תמיד) וגם drift של הארנק. תקלות איכות דאטה מופיעות
   באותו מקום כמו תקלות כסף.

---

## 6. מה 033 כוללת (ומה לא)

כוללת (הכול idempotent, קובץ = טרנזקציה אחת):

1. בדיקת prerequisites קשיחה (026 + 027), בדפוס של 031.
2. עזרים: `fn_il_date` (IMMUTABLE), `fn_is_bot_ua`.
3. `analytics_event_definitions` + seed 12 האירועים הקנוניים + audit trigger + RLS.
4. `analytics_events` (partitioned) + אינדקסים + RLS + `analytics_events_default` +
   `fn_ensure_analytics_partitions` (כולל יצירה ראשונית) + `fn_drop_old_analytics_partitions`.
5. `fn_ingest_analytics_events` (service בלבד, ולידציה מלאה, דה-דופ, בוטים, קיטום IP).
6. `analytics_daily` + `fn_rollup_analytics_daily` (מסנן בוטים וצוות).
7. `orders.attribution` (jsonb, נכתב על ידי `beginCheckout`).
8. אינדקסי עזר לדוחות: `orders(paid_at)`, `coupon_codes(status, created_at)`,
   `coupon_scan_events(created_at)`, `wallet_transactions(created_at)`.
9. views (כולם `security_invoker=true`): `v_revenue_daily`, `v_refunds_daily`, `v_wallet_liability`,
   `v_wallet_ledger_drift`, `v_coupon_funnel_monthly`, `v_supplier_leaderboard_30d`,
   `v_cohort_ltv_monthly`, `v_channel_revenue_weekly`, `v_funnel_daily`, `v_money_alarms`,
   `v_owner_dashboard`.
10. views מותנים (רק אם הטבלה קיימת): `v_search_quality_daily` (על `search_queries` מ-030).

לא כוללת: קוד אפליקציה (SDK צד לקוח, route `/api/a`, באנר הסכמה, מסך הדשבורד, כתיבת
`orders.attribution` ו-event `begin_checkout` בתוך `beginCheckout`), תזמון crons, שינוי כלשהו
ב-026-031, וה-purge jobs של `coupon_scan_events`/`search_queries` (בבעלות הדומיינים שלהם).

תזמון (אחרי החלה):

| job | תדירות | מנגנון |
|---|---|---|
| `fn_rollup_analytics_daily()` | לילי 02:10 ישראל | pg_cron (SQL טהור) |
| `fn_ensure_analytics_partitions(2)` + `fn_drop_old_analytics_partitions(13)` | חודשי, 1 לחודש | pg_cron |
| קריאת `v_money_alarms` + התראה לאדמין | לילי + בכל טעינת דשבורד | Vercel cron (שולח מייל/וואטסאפ דרך outbox) |

סדר החלה: 026 -> 027 (חובה), ואז **033** בכל שלב (028-032 אינן תנאי).
רק דרך Supabase MCP `apply_migration`; אחרי החלה `generate_typescript_types`.

---

## 7. סיכום החלטות

1. **שני מישורים:** כסף מטבלאות ה-ledger בלבד; `analytics_events` להתנהגות בלבד; אירועי
   purchase / refund / coupon_scan / wallet_* / search הם derived ולא נכתבים פעמיים.
2. **first-party בתוך Supabase, בלי כלי חיצוני.** טריגרים לפתיחה מחדש: פרסום בתשלום או
   ~200 אלף אירועים בחודש / צורך ב-session replay (ואז PostHog EU כתוספת).
3. **registry אירועים ב-DB** עם ולידציית שם + props חובה בזמן ingest; snake_case; שינוי שובר
   מעלה `schema_version`; אסור rename.
4. **Partitioning חודשי** על `analytics_events`, PK (occurred_at, event_id) כדה-דופ,
   retention 13 חודשים ל-raw, rollup יומי לנצח.
5. **הסכמה:** אירועי דפדפן רק אחרי opt-in בבאנר (עוגיית `ke_consent` עם wording_version);
   רשומות עסקיות לא מותנות; IP קטום; בלי PII ב-props; מחיקת חשבון מאפסת user_id באירועים.
6. **הכנסה = snapshot:** `platform_fee_ils` בזמן paid; החזרים כשורה שלילית ביום ההחזר;
   GMV, תקבולים באתר והכנסה מוצגים כשלושה מספרים נפרדים.
7. **התחייבות ארנק = sum יתרות user**, עם view drift מול ה-ledger כהתראה. נגזרת: לפני החלת 026
   יש להמיר את העתקת היתרות ההיסטוריות לרשומות פתיחה ב-ledger (אחרת ה-drift view צועק על כולם).
8. **דשבורד אחד** (`v_owner_dashboard` + `v_money_alarms`) נקרא עם service client אחרי
   `requireAdminSession`; עיון שבועי ב-views הייעודיים; ייחוס ערוצים דרך `orders.attribution`
   (last-touch, בלי session stitching).
9. **איכות:** בוטים מסומנים ומסוננים, תנועת צוות מסוננת מה-rollup, זמן עסקי Asia/Jerusalem בלבד
   דרך `fn_il_date`, שעון לקוח מוצמד לחלון.
10. **מספור:** 032 נתפסה על ידי ייבוא הוורדפרס; הדומיין הזה הוא 033, עם תלות קשיחה ב-026+027 בלבד
    (איחוד vendors יקבל מספר עתידי).

## 8. שאלות פתוחות

1. **מדיניות קופון שפג בלי מימוש** (ירושה משאלה 9.4 של מסמך הספקים): החזר לארנק, החזר חלקי, או
   שמירת הכסף? משנה את פרשנות `outstanding_platform_paid_ils` בדשבורד (הכנסה ודאית או מותנית).
2. **פקיעת cashback:** ה-enum `wallet_reason` כולל `expire` אבל אין מדיניות (כמה חודשים? התראה
   לפני?). עד שתוגדר, ההתחייבות בדוח מוצגת כולה כ-open-ended.
3. **נוסח באנר ההסכמה ומעמדו המשפטי** מול הנחיות הרשות להגנת הפרטיות אחרי תיקון 13: לאשר עם
   ייעוץ משפטי לפני production (אותו סבב ייעוץ של חוק הספאם מ-031).
4. **יחס המרה session-scoped:** הוחלט על משפך day-level. אם יידרש stitching מלא (סשן -> הזמנה),
   הדרך: העברת `anonymous_id` לתוך `beginCheckout` ושמירתו על ההזמנה. נדחה עד שיש פרסום בתשלום.
5. **דשבורד ספק:** אילו מהמדדים (סריקות, מימוש, GMV שלו) נחשפים לספק בפורטל? ה-views הנוכחיים
   הם admin בלבד; חשיפה לספק דורשת views נפרדים עם סינון `is_supplier_member`.
6. **גיבוי ה-rollup מול מחיקת raw:** אחרי שנה, האם 13 חודשי raw מספיקים לשאלות עומק (למשל
   השוואת התנהגות שנה-על-שנה ברמת אירוע)? אפשר להאריך ל-25 חודשים במחיר אחסון, החלטה כשמתקרבים.
