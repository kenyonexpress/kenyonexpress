# ארכיטקטורת אנליטיקה ו-BI: מסמך מאוחד (v2)

תאריך: 2026-07-17 (שכבת הבסיס 033 תוכננה ב-2026-07-09). ענף: `phase5/homepage`.

מסמך זה הוא **מקור האמת היחיד** לדומיין האנליטיקה וה-BI. הוא כולל את שתי השכבות:
שכבת הבסיס (033: registry, איסוף אירועים, rollup, דשבורד בעלים) ושכבת ההרחבה
(034: דשבורד ספקים, דוח התחייבות פקיעה, take-rate, cohort retention ואינטגרציית סוכני AI).

מיגרציות נלוות (טיוטות, לא הוחלו):

| קובץ | תפקיד |
|---|---|
| `supabase/migrations/033_analytics.sql` | שכבת הבסיס: registry, `analytics_events` (partitioned), ingest, rollup יומי, views של הבעלים |
| `supabase/migrations/034_analytics_bi.sql` | שכבת ההרחבה: views לספקים, BI אדמין, materialized views, ממשק סוכנים |

> **מספור (עודכן 2026-07-17):** 032 נתפסה על ידי `032_wp_import_staging.sql` (ייבוא מוורדפרס).
> מיגרציית ההרחבה של הדומיין מוספרה מחדש מ-035 ל-**034** (רצף רציף 026-035), ואיחוד
> ה-vendors מתוכנן כ-`036_vendors_unification.sql`. אין תלות של 034 באיחוד: ה-views קוראים
> `suppliers` / `order_items` ישירות וקולטים אוטומטית שורות שיאוחדו.
>
> **תנאים מוקדמים של 033 (קשיחים):** 026 (עמודות snapshot על `order_items`, `payments`,
> `wallet_accounts`) ו-027 (עמודות snapshot על `coupon_codes`, `coupon_scan_events`).
> המיגרציה נכשלת מוקדם ובמכוון אם הם חסרים. 030 (`search_queries`) ו-031
> (`notification_conversions`) אופציונליים: ה-views שלהם נוצרים רק אם הטבלאות קיימות.

מסמכים קשורים: `ARCHITECTURE-COMMERCE.md` (026), `ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027),
`ARCHITECTURE-ACCOUNT-IDENTITY.md` (029), `ARCHITECTURE-CATALOG-SEARCH-SEO.md` (030),
`ARCHITECTURE-NOTIFICATIONS-MARKETING.md` (031), `ARCHITECTURE-PRODUCTION-OPS.md`, `MASTER-ARCHITECTURE.md`.

---

## 0. עקרונות על (מחייבים)

1. **שני מישורים, לעולם לא מערבבים.** כסף ועובדות עסקיות חיים בטבלאות המקור
   (`orders`, `order_items`, `payments`, `wallet_transactions`, `coupon_codes`,
   `coupon_scan_events`, `payout_statements`). התנהגות (צפיות, עגלה, checkout)
   חיה ב-`analytics_events`. **אסור לסכום כסף מאירועי אנליטיקה.** הכנסה נקראת תמיד
   מה-ledger; אירועים סופרים התנהגות בלבד. זה מבטל מראש את בעיית ה"דשבורד לא מסתדר
   עם הנהלת החשבונות" שכל מערכת אנליטיקה כפולה סובלת ממנה.
2. **first-party בלבד בתוך Supabase.** אין GA4, אין PostHog, אין פיקסלים (הכרעה בסעיף 3.1).
   טריגרים לפתיחה מחדש: תחילת פרסום בתשלום, או ~200 אלף אירועי לקוח בחודש.
3. **מספרים להחלטה, לא לגאווה.** כל מדד בדשבורד חייב לענות על "איזו פעולה אעשה אם המספר רע".
   אין impressions, אין "עמודים לביקור". יש הכנסת פלטפורמה, שיעור מימוש, התחייבות ארנק, והתראות כסף.
4. **snapshot הוא מקור האמת ההיסטורי.** כל חישוב הכנסה מ-`platform_fee_ils` /
   `platform_paid_ils` שהוקפאו בזמן רכישה. שינוי `platform_percent` היום לא מזיז דוח עבר.
   אין חישוב אחוזים בדיעבד.
5. **יום עסקים = יום Asia/Jerusalem** דרך `fn_il_date(ts)` בלבד. אחסון UTC (`timestamptz`);
   לעולם לא `::date` ישיר על timestamptz (זה יום UTC, שקו החצות שלו נופל ב-02:00/03:00
   בלילה בישראל).
6. **RLS הוא גבול ההרשאה גם ב-BI.** views לספקים הם `security_invoker` ונשענים על
   policies של 027; אין נתיב שבו ספק רואה נתוני ספק אחר.

---

## 1. טקסונומיית אירועים

### 1.1 מעטפת קנונית (envelope) לאירועי `analytics_events`

כל אירוע, מכל מקור, נושא את אותה מעטפת:

| שדה | טיפוס | מי כותב | הערות |
|---|---|---|---|
| `event_id` | uuid | שולח | מפתח דה-דופ; retry שולח אותו id |
| `event_name` | text | שולח | snake_case, מה-registry בלבד (1.3) |
| `schema_version` | smallint | שרת | נחתם מה-registry בזמן ingest, לא מהלקוח |
| `occurred_at` | timestamptz | שולח | זמן האירוע אצל השולח; ingest מצמיד לחלון [now-7d, now+5m] |
| `source` | text | שולח | `web` / `pwa` / `server` |
| `anonymous_id` | text | לקוח | עוגיית `ke_session_id` הקיימת (אותה עוגייה של עגלת אורח, כך שנטישת עגלה מתחברת ל-`carts.session_id`) |
| `session_id` | text | לקוח | סשן מתגלגל 30 דקות, נוצר בצד לקוח |
| `user_id` | uuid | שרת | נכתב על ידי ה-route מהסשן בלבד, לעולם לא מהלקוח |
| `path`, `referrer` | text | לקוח | |
| `utm` | jsonb | לקוח | `{source, medium, campaign, content, term}`, אם קיים |
| `props` | jsonb | שולח | מפתחות חובה לפי registry; עד 4KB; **בלי PII** |
| `ip_trunc`, `user_agent`, `is_bot` | | שרת | IP קטום /24 (IPv6 /48); בלי IP מלא |

### 1.2 האירועים המלאים וסכימות ה-payload

מקור האמת: טבלת `analytics_event_definitions`. **הכרעת המפתח: אירוע `derived` לא נכתב
ל-`analytics_events` בכלל**; הוא נקרא מטבלת המקור שלו, שהיא כבר append-only עם snapshot כספי.
כתיבה כפולה (גם לטבלת המקור וגם לאירועים) היא מתכון ל-drift ולשני מספרים שונים לאותה שאלה.
לכן אין triggers חדשים על טבלאות הליבה, אין הכפלת נפח, ואין סיכון לצנרת התשלומים.
זו ההגנה המבנית מפני double-counting.

| event_name | origin | payload (props / עמודות מקור) | מקור אמת |
|---|---|---|---|
| `page_view` | client | (אין props חובה) | `analytics_events` |
| `view_product` | client | `product_id` uuid (חובה), `category_id` uuid, `price_ils` numeric, `product_type` text | `analytics_events` |
| `view_category` | client | `category_id` uuid (חובה) | `analytics_events` |
| `add_to_cart` | client | `product_id` uuid (חובה), `quantity` int (חובה), `variant_id` uuid, `price_ils` numeric | `analytics_events` |
| `remove_from_cart` | client | `product_id` uuid (חובה) | `analytics_events` |
| `begin_checkout` | server | `order_id` uuid (חובה), `items_count` int (חובה), `cart_total_ils` numeric | `analytics_events`, נפלט מ-`beginCheckout` אחרי יצירת הזמנה pending |
| `purchase` | derived | `orders.paid_at`, `order_items`: `total_price_ils`, `charged_on_site_ils`, `platform_fee_ils`, `supplier_due_ils`, `cashback_earned_ils`, `platform_percent`, `product_type` | `orders` + `order_items` (webhook מאומת של Cardcom) |
| `refund` | derived | `payments`: `amount_ils`, `succeeded_at`, `order_id` | `payments` עם `kind='refund'`, `status='succeeded'` |
| `coupon_scan` | derived | `coupon_scan_events`: `result` (success/not_found/already_used/expired/refunded/wrong_supplier/unauthorized/rate_limited), `scan_method`, `supplier_id`, `scanned_by` | `coupon_scan_events` (כל ניסיון, כולל כשלונות) |
| `coupon_redeemed` | derived (**חדש ב-034**) | `coupon_codes`: `used_at`, `supplier_id`, `face_value_ils`, `platform_paid_ils`, `collect_amount_ils` | `coupon_codes` במעבר ל-`used` בתוך `redeem_coupon()` |
| `wallet_earn` | derived | `wallet_transactions`: `amount_ils`, `reason`, `related_order_id`, `idempotency_key` | credit לחשבון user (המקבילה ל-`wallet_credit` מהדרישה; השם הקנוני נשאר `wallet_earn`) |
| `wallet_spend` | derived | כנ"ל, debit מחשבון user | `wallet_transactions` |
| `supplier_payout` | derived (**חדש ב-034**) | `payout_statements`: `paid_at`, `supplier_id`, `total_gross_ils`, `total_platform_fee_ils`, `total_payout_ils`, `payment_reference`, `bank_snapshot` | `payout_statements` במעבר ל-`paid` בתוך `mark_payout_statement_paid()` |
| `search` | derived | `search_queries`: `query`, `results_count`, `source`, `took_ms` | `search_queries` (030) |

`purchase` לא נפלט מדף התודה (הדפדפן לא אמין: סוגרים טאב, redirect נכשל). ספירת רכישות
היא תמיד `orders.paid_at`, שנכתב בטרנזקציית ה-webhook המאומתת של Cardcom.

מיפוי שמות מהדרישה העסקית לשמות הקנוניים:

| שם בדרישה | שם קנוני | הערה |
|---|---|---|
| `coupon_redeemed` | `coupon_redeemed` | נוסף ב-034; רמת "הצלחה בלבד". רמת הניסיון היא `coupon_scan` |
| `wallet_credit` | `wallet_earn` | אין שינוי שם: rename אסור לפי כללי ה-registry |
| `supplier_payout` | `supplier_payout` | נוסף ב-034 |

### 1.3 registry, כללי שמות וגרסאות (מחייבים)

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
  - בדיקת עוגיית הסכמה (3.4): אין הסכמה -> 204, drop
  - rate limit IP (תשתית 002): ~120 אירועים לדקה ל-IP
  - service client -> rpc fn_ingest_analytics_events(batch, user_id, ip, ua)
      v
fn_ingest_analytics_events  (SECURITY DEFINER, service role בלבד)
  - ולידציה מול ה-registry (שם, origin, props חובה)
  - clamp של occurred_at, סימון is_bot לפי user_agent, קיטום IP
  - INSERT ... ON CONFLICT (occurred_at, event_id) DO NOTHING   <- דה-דופ
      v
analytics_events  (partitioned, סעיף 3.2)
```

- אירוע שנפל בולידציה נזרק בשקט (הפונקציה מחזירה כמה נכנסו). אנליטיקה לעולם לא מפילה UX:
  כשל ב-`/api/a` נבלע בצד לקוח בלי retry loop אגרסיבי (נסיון אחד + פעם אחת ב-flush הבא).
- ה-route דורש Content-Type ו-Origin תקינים.

---

## 3. עיצוב אחסון ופרטיות

### 3.1 הכרעה: first-party בתוך Supabase, בלי כלי חיצוני

| קריטריון | first-party (Supabase) | GA4 | PostHog Cloud EU |
|---|---|---|---|
| חיבור להכנסה אמיתית (snapshot, ארנק) | JOIN ישיר | ידני, כפול, לא מסתדר | חלקי, דורש sync |
| הסכמה ופרטיות | אין צד שלישי, IP קטום | consent mode, DPA, דיווח לחו"ל | DPA, עלות |
| עלות | כלול ב-DB הקיים | חינם אבל הזמן שלך יקר | ~$0 בהתחלה, גדל |
| עקומת למידה לבעלים יחיד | דשבורד אחד ב-/admin שכבר קיים | ממשק שנלחמים בו | עוד מערכת לתחזק |
| session replay / heatmaps | אין | אין | יש |

**החלטה: איסוף first-party לתוך Postgres של Supabase, בלי שום כלי חיצוני בשלב זה.**
נימוק מכריע: JOIN ישיר בין התנהגות לכסף האמיתי (snapshot + ledger) בדשבורד אחד,
בלי sync, בלי DPA צד שלישי, בלי העברת מידע לחו"ל. שני טריגרים לפתיחת ההחלטה מחדש:
(א) התחלת רכישת מדיה בתשלום (אז נדרש ייבוא conversions לפלטפורמות הפרסום);
(ב) מעל ~200 אלף אירועי לקוח בחודש או צורך אמיתי ב-session replay, ואז PostHog EU
כתוספת, לא כתחליף. Vercel Speed Insights (ביצועים, לא התנהגות) מאושר בנפרד במסמך
ה-ops ואינו סותר.

### 3.2 Partitioning

- `analytics_events` היא טבלה מפורקת (declarative partitioning) לפי `RANGE (occurred_at)`,
  partition לחודש קלנדרי (UTC) בשם `analytics_events_YYYYMM`, ועוד partition בשם
  `analytics_events_default` כרשת ביטחון שחייבת להישאר ריקה (שורה בו = התראה ב-`v_money_alarms`).
- `PRIMARY KEY (occurred_at, event_id)`: מפתח החלוקה חייב להיכלל, וה-unique הזה הוא גם הדה-דופ.
- `fn_ensure_analytics_partitions(2)` רץ חודשי ויוצר [חודש קודם .. חודש+2] כולל הפעלת RLS על כל
  partition חדש (partition הוא טבלה נפרדת שחייבת RLS משלה נגד גישה ישירה דרך PostgREST).
- `fn_drop_old_analytics_partitions(13)` מוחק partitions מעבר ל-13 חודשים. DROP של partition
  הוא מיידי וזול (בלי DELETE, בלי vacuum). לפני המחיקה ה-rollup היומי כבר שימר את מה שחשוב.
- ב-free tier (500MB) זה הדומיין הראשון שמתנפח; ה-rollup היומי (`analytics_daily`) הוא זה
  שנשמר לנצח, והוא זעיר (שורות בודדות ליום).

### 3.3 Retention

| דאטה | שמירה | מנגנון |
|---|---|---|
| `analytics_events` (raw) | 13 חודשים | DROP partition חודשי |
| `analytics_daily` (rollup) | לנצח | זעיר |
| `mv_cohort_retention_monthly`, `mv_take_rate_monthly` | מתרעננים לילית | REFRESH, לא גדלים |
| טבלאות כסף (`orders`, `payments`, `wallet_transactions`, `coupon_codes`, `payout_statements`) | לנצח (7 שנים לפחות, הוראות מס וניהול ספרים) | אין purge |
| `coupon_scan_events` | 90 יום (הוחלט ב-PRODUCTION-OPS; ה-truth למימוש הוא `coupon_redemptions`) | purge של דומיין הספקים |
| `search_queries` | 6 חודשים | purge של דומיין הקטלוג |
| `agent_run_steps` | 90 יום | purge של דומיין הסוכנים |

### 3.4 פרטיות: GDPR + חוק הגנת הפרטיות (תיקון 13)

הבסיס המשפטי: חוק הגנת הפרטיות ותיקון 13 (בתוקף מאוגוסט 2025): צמצום נתונים,
מטרה מוגדרת, שקיפות, חובת מחיקה. בישראל אין חוק עוגיות נפרד בנוסח ePrivacy, אבל
הנחיות הרשות להגנת הפרטיות מחייבות יידוע והסכמה מדעת לניטור התנהגותי. GDPR רלוונטי
עקרונית (שרתים ב-EU) ומיושם באותם כלים. המדיניות:

1. **רשומות עסקיות אינן מותנות בהסכמה:** הזמנות, תשלומים, מימושים, ארנק, payouts,
   `begin_checkout` (חלק מעסקה שהמשתמש יזם). אלו תפעול העסקה, לא מעקב.
2. **אירועי דפדפן מותנים בהסכמה:** באנר עברית RTL, קבלה/דחייה שוות מעמד, עוגיית
   `ke_consent` (12 חודשים) עם `wording_version`, בדפוס `consent_events` מ-031.
   בלי הסכמה: אפס אירועי לקוח, ה-SDK לא נטען.
3. **הפרדת PII מבנית:**
   - PII (שם, מייל, טלפון, כתובת) חי אך ורק ב-`profiles` / `user_addresses` / auth.
   - `analytics_events.props` לעולם לא מכיל PII; המזהים היחידים הם `user_id` פנימי ועוגיות סשן.
   - IP נקטם לפני אחסון (/24, IPv6 /48); אין fingerprinting; אין מזהי צד שלישי.
   - `notification_events.payload` (031): ids ועובדות כסף בלבד, בלי PII. אותו כלל כאן.
4. **מחיקת חשבון (029):** `fn_execute_account_deletion` מבצע פסאודונימיזציה; job המחיקה
   מאפס `user_id` בשורות `analytics_events` של הנמחק (UPDATE ממוקד באינדקס user_id;
   אין FK בכוונה, כדי שה-partitions יישארו זולים). השורות האנונימיות נשארות כסטטיסטיקה.
   רשומות הכסף נשמרות 7 שנים מכוח דין.
5. **בקרת גישה:** raw ו-rollup נקראים רק על ידי אדמין (RLS) או service role;
   ה-matviews בלי RLS ולכן SELECT נשלל מ-anon/authenticated וניגשים אליהם רק דרך
   service client אחרי `requireAdminSession`.

---

## 4. מודל הכנסות

### 4.1 הגדרת הכנסת פלטפורמה (per-order)

לכל שורת הזמנה ששולמה:

| סוג פריט | GMV (מחזור) | הכנסת פלטפורמה | חוב לספק | נגבה בעסק |
|---|---|---|---|---|
| physical | `total_price_ils` | `platform_fee_ils` | `supplier_due_ils` | 0 |
| coupon | `total_price_ils` (שווי הפנים) | `platform_fee_ils` (= כל מה שנגבה באתר) | 0 | `balance_due_at_business_ils` |

- הכול מעמודות ה-snapshot של 026. שורות היסטוריות שלפני 026 מכוסות על ידי ה-backfill
  שהוגדר שם (`commission_percent`/`supplier_payout_ils` הישנים שוכפלו לעמודות החדשות).
- **GMV של קופון הוא שווי הפנים, לא התקבול.** התקבול באתר הוא `charged_on_site_ils`.
  שלושת המספרים מוצגים בנפרד בדשבורד: מחזור (GMV), תקבולים באתר (cash-in), הכנסת
  פלטפורמה (revenue). אצל בעלים יחיד הבלבול בין השלושה הוא הדרך המהירה ביותר להחלטות שגויות.
- **הכנסה מוכרת בזמן `paid`** (מזומן התקבל). ההחזרים מדווחים כשורה שלילית נפרדת לפי יום ההחזר
  (`payments` עם `kind='refund'`), לא כשכתוב של יום המכירה. כך גרף העבר לעולם לא זז רטרואקטיבית.
- ארנק: `cashback_applied_ils` הוא הנחה במקור מימון הפלטפורמה; הוא לא מקטין GMV ולא את חלק הספק
  (הכרעת O5 ב-026). הדשבורד מציג אותו כעמודת "מומן מארנק".

### 4.2 משפך הקופון

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
  `collect_amount_ils` העסקים עוד אמורים לגבות. מדיניות הפקיעה שקובעת את פרשנות המספר
  הוכרעה בסעיף 6.3 (breakage, אין החזר אוטומטי).

### 4.3 לוח מנהיגות ספקים

`v_supplier_leaderboard_30d`, שורה פר ספק, חלון 30 יום:
GMV, הכנסת פלטפורמה, כמות פריטים, סריקות מוצלחות/כושלות (מ-`coupon_scan_events`, כולל
`wrong_supplier` שהוא אות fraud), שיעור מימוש 90 יום, מחלוקות פתוחות.
ההחלטות שהוא משרת: את מי לקדם בדף הבית, את מי לחייב ב-`platform_percent` גבוה יותר בחידוש,
ומי מסמן סיכון (הרבה סריקות כושלות או מחלוקות).

### 4.4 cohort LTV

`v_cohort_ltv_monthly`: קוהורטת חודש-רכישה-ראשונה, ולכל (קוהורטה, חודש-סטייה): קונים פעילים,
הכנסת פלטפורמה מצטברת, והכנסה מצטברת פר חבר קוהורטה. המספר האחרון הוא תקרת עלות רכישת לקוח
(CAC ceiling) ביום שבו יתחיל פרסום בתשלום, ועד אז הוא מודד אם המוצר מחזיק לקוחות בכלל.
בסיס ההכנסה הוא `platform_fee_ils` (מה שאנחנו באמת מרוויחים), לא GMV.

### 4.5 התחייבות ארנק (wallet liability)

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

## 5. דשבורד ספקים (RLS-scoped)

### 5.1 מנגנון האבטחה

כל ה-views לספקים הם `security_invoker = true`, כלומר רצים עם הרשאות הקורא, ו-RLS
של 027 עושה את הסינון: `is_supplier_member(supplier_id)` על `order_items`, `orders`,
`coupon_codes`, `coupon_scan_events`, ו-policy שמסתירה statements בסטטוס `draft`.
אין `WHERE supplier_id = ...` באפליקציה בתור הגנה; זה נוחות בלבד. אדמין רואה את כולם
דרך policies של אדמין. את ה-views קוראים עם ה-client של המשתמש (לא service client).

### 5.2 ה-views (נוצרים ב-034)

| view | גרעין | שאלת ההחלטה של הספק |
|---|---|---|
| `v_supplier_sales_daily` | מכירות ששולמו פר יום ישראלי: פריטים, הזמנות, GMV, שולם באתר, לגבייה בעסק, עמלת פלטפורמה, `supplier_due_ils` | כמה מכרתי וכמה מגיע לי |
| `v_supplier_redemptions_monthly` | משפך קופונים פר חודש הנפקה: issued / redeemed / expired / outstanding, `redemption_rate_pct`, מזומן שנגבה בעסק, חציון ימים למימוש | כמה לקוחות באמת מגיעים אליי |
| `v_supplier_scans_daily` | ניסיונות סריקה פר יום: הצלחות, already_used, expired, כשלים אחרים | בעיית מכשיר/הדרכה בעסק |
| `v_supplier_payouts` | ה-statements שלו (בלי drafts): תקופה, סטטוס, סכומים, אסמכתה, מחלוקות פתוחות | מתי ואיפה הכסף |

`redemption_rate_pct` מוגדר `used / (used + expired)` על מצבים סופיים בלבד, זהה להגדרת
האדמין, כדי ששני הצדדים יראו את אותו מספר בשיחת טלפון.

### 5.3 מה במפורש לא נחשף לספק

- השוואות בין ספקים (leaderboard, דירוגים, מדדי ספקים אחרים): אדמין בלבד.
- אירועי התנהגות (`analytics_events`, צפיות במוצרים): נשאר admin-only בשלב זה;
  אם ייחשף בעתיד, יהיה זה rollup יומי לפי מוצר, לא raw.
- פירוט `wrong_supplier` (אות fraud): הספק רואה רק "כשלים אחרים"; החקירה אצל האדמין.

---

## 6. BI אדמין

### 6.1 הדשבורד היומי היחיד של הבעלים (033)

מסך אחד ב-`/admin/dashboard` (מרחיב את הקיים), שנקרא פעם ביום עם הקפה. שתי שכבות:
שורת התראות (אם יש) ואז המספרים. המקור: `v_owner_dashboard` (שורה אחת) + `v_money_alarms`.

**חשוב:** את ה-views של האדמין קוראים בצד השרת עם service client אחרי `requireAdminSession`.
ה-views מוגדרים `security_invoker` ולכן קריאה עם JWT של אדמין תיתקל בחורים ב-RLS ישן
(למשל אין policy אדמין על `carts`); service role עוקף את זה, וההגנה היא ה-guard באפליקציה,
כמו בשאר האדמין.

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

### 6.2 עיון שבועי (weekly deep-dive, 033)

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
ולא מוכפל כאן. GMV, תקבולים באתר והכנסת פלטפורמה נשארים שלושה מספרים נפרדים;
GMV של קופון = שווי פנים.

### 6.3 take-rate לפי platform_percent (חדש ב-034)

`v_take_rate_monthly` + snapshot לילי `mv_take_rate_monthly`: פר (חודש ישראלי,
`product_type`, `platform_percent` מה-snapshot): הזמנות, פריטים, GMV, שולם באתר,
הכנסת פלטפורמה, ו-`effective_take_rate_pct = platform_fee / GMV`.

ההחלטות שהוא משרת: אילו מדרגות עמלה באמת מייצרות הכנסה, איפה effective take-rate
נמוך מהחוזי (קופונים: היחס בין `coupon_price` לשווי הפנים), ואת מי לתמחר מחדש בחידוש.

### 6.4 דוח התחייבות פקיעת קופונים (חדש ב-034)

`v_coupon_expiry_liability`, שורה פר דלי:

| דלי | משמעות |
|---|---|
| `overdue_not_swept` | `expires_at` עבר אבל עדיין `issued`: ה-cron `expire_coupons()` מפגר. חייב להיות 0 |
| `expiring_7d` / `expiring_8_30d` / `expiring_31_90d` / `expiring_90d_plus` / `no_expiry` | קופונים פתוחים לפי זמן לפקיעה, עם `platform_paid_ils` (כבר אצלנו) ו-`collect_amount_ils` (העסק עוד מצפה לגבות) |
| `expired_unredeemed_12m` | breakage מוכר, 12 חודשים אחורה |
| `refunded_12m` | הקשר: כמה הוחזר |

**הכרעת מדיניות (סוגרת את שאלת "קופון שפג" של 033 ושאלה 9.4 של מסמך הספקים):**
קופון שפג בלי מימוש **אינו מוחזר אוטומטית**. `platform_paid_ils` מוכר כהכנסת breakage
ביום הפקיעה. מחווה ללקוח (זיכוי ארנק) עוברת רק דרך תמיכה, כ-`manual_adjust` ב-ledger,
ולכן מדווחת אוטומטית בדוחות הארנק. תנאי המכר בדף המוצר חייבים לומר זאת מפורשות.
נגזרת: דלי `expiring_7d` הוא היעד של תזכורות 7d/48h מ-031; שיעור מימוש נמוך פוגע
בעסק פעמיים (לקוח שנכווה + ספק שלא ראה אותו), לכן breakage הוא הכנסה שאסור לרדוף אחריה.

**הכרעת מדיניות (סוגרת את שאלת פקיעת ה-cashback של 033):** cashback פוקע **12 חודשים**
אחרי הצבירה, עם תזכורת 30 יום מראש דרך ה-outbox של 031. מימוש: job של דומיין הארנק
(לא 034) שמזרים `expire` ב-`fn_wallet_transfer` מחשבון המשתמש ל-`platform:cashback_reserve`.
עד שה-job קיים, ההתחייבות בדוח מוצגת open-ended, וזה השמרני הנכון.

### 6.5 cohort retention (חדש ב-034)

`mv_cohort_retention_monthly`: קוהורטת חודש-רכישה-ראשונה x חודש-סטייה, עם
`retention_pct = active_buyers / cohort_size` בנוסף ל-LTV המצטבר של `v_cohort_ltv_monthly`.
retention עונה "האם לקוחות חוזרים"; LTV עונה "כמה זה שווה". שניהם על
`platform_fee_ils`, לא GMV.

---

## 7. אסטרטגיית אגרגציה ו-materialized views

שלוש מדרגות, לפי עלות החישוב מול טריות:

| מדרגה | אובייקטים | טריות | נימוק |
|---|---|---|---|
| טבלת rollup | `analytics_daily` (נכתבת ב-`fn_rollup_analytics_daily`) | לילי, ניתנת לבנייה מחדש פר יום | שורדת מחיקת partitions; זעירה; לנצח |
| views רגילים | כל ה-`v_*` (בעלים, ספקים, take-rate, liability) | real-time | הנפחים קטנים (עשרות אלפי שורות בשנים הקרובות); אינדקסים של 033/034 מספיקים; אפס תחזוקת קונסיסטנטיות |
| materialized views | `mv_cohort_retention_monthly`, `mv_take_rate_monthly` | לילי | סריקות היסטוריה מלאות שאין צורך לרוץ בכל טעינת מסך; בלי RLS ולכן service-role בלבד |

**הכרעה:** לא הופכים views נוספים ל-mat views עד שיש בעיה נמדדת (מעל ~200ms לשאילתה
בדשבורד). ההיפוך זול (אותו SELECT), וההקדמה יוצרת בעיות staleness בחינם.

### לוח רענון (נקבע בזמן החלה, לא בתוך המיגרציות)

| job | תדירות | מנגנון |
|---|---|---|
| `fn_rollup_analytics_daily()` | לילי 02:10 ישראל | pg_cron |
| `fn_refresh_analytics_matviews()` | לילי 02:40 ישראל (אחרי ה-rollup) | pg_cron |
| `fn_ensure_analytics_partitions(2)` + `fn_drop_old_analytics_partitions(13)` | חודשי, 1 לחודש 03:00 | pg_cron |
| `expire_coupons()` (027) | יומי, לפני ה-rollup | pg_cron |
| קריאת `v_money_alarms` + התראה לאדמין (מייל/וואטסאפ דרך outbox) | לילי + בכל טעינת דשבורד | Vercel cron (דורש Pro) |

pg_cron זמין גם ב-free tier ומריץ SQL טהור; כל מה שנוגע ב-API חיצוני (התראות, reconcile)
נשאר ב-Vercel cron עם `CRON_SECRET`.

---

## 8. איכות דאטה

1. **דה-דופ:** `event_id` נוצר פעם אחת אצל השולח; retry שולח את אותו זוג (event_id, occurred_at);
   `ON CONFLICT DO NOTHING` על ה-PK בולע כפילויות. בצנרת הכסף הדה-דופ כבר קיים (webhook events,
   idempotency keys) ולא נוגעים בו.
2. **בוטים:** סימון בזמן ingest (`is_bot` לפי regex על user_agent: crawlers, headless, monitors,
   preview bots של וואטסאפ/פייסבוק). שומרים ולא זורקים (לזיהוי scraping), אבל כל rollup וכל view
   מסננים `NOT is_bot`.
3. **תנועת צוות:** ה-rollup מסנן משתמשים עם role של admin / super_admin / content_uploader.
   הבעלים שבודק את האתר שלו עשר פעמים ביום הוא זיהום המדידה הגדול ביותר בעסק קטן.
4. **אזור זמן:** אחסון UTC בלבד; בקיטה אך ורק דרך `fn_il_date` (Asia/Jerusalem, מטפל ב-DST).
   ה-partitions הם חודשי UTC (גבול טכני), הדוחות הם ימי ישראל (גבול עסקי); ה-rollup מתרגם.
5. **שעון לקוח:** `occurred_at` עתידי מעל 5 דקות מוצמד ל-now(); ישן מ-7 ימים נזרק (בין השאר
   מגן על partitions שנמחקו מכתיבה מחודשת).
6. **בדיקת שפיות מובנית:** `v_money_alarms` כוללת גם `analytics_default_partition_rows`
   (ה-default partition אמור להיות ריק תמיד) וגם drift של הארנק. תקלות איכות דאטה מופיעות
   באותו מקום כמו תקלות כסף.

(מדיניות ה-retention המלאה: סעיף 3.3.)

---

## 9. אינטגרציה עם סוכני AI (028)

עקרון: **סוכנים צורכים אנליטיקה דרך משטחים צרים וקריאים בלבד; לעולם לא raw events,
לעולם לא כתיבה.** RLS נשאר גבול ההרשאה של tools בצד המשתמש.

1. **`fn_agent_kpi_snapshot()` (חדש ב-034):** קריאה אחת זולה, service role בלבד,
   מחזירה jsonb עם KPI מטבלאות האמת: הכנסת פלטפורמה היום/7 ימים, הזמנות היום,
   קופונים פתוחים + לגבייה, שיעור מימוש 30 יום, התחייבות ארנק, מספר התראות כסף.
   זה משטח ה-grounding של `support` ושל דוחות אוטומטיים עתידיים. הרחבת יכולות
   סוכן = הוספת מפתח כאן, לא הרחבת הרשאות טבלאות.
2. **`v_agent_costs_daily` (חדש ב-034, מותנה בקיום `agent_runs`):** עלות/טוקנים/סטטוסים
   פר יום ופר `agent_key`. זה ה-view שמסמך 028 הזכיר ולא מימש; הוא מזין את תקרת
   התקציב היומית ואת מתג ההשבתה (`is_active=false`).
3. **fraud_watch:** ממשיך לקרוא דטקטורים דטרמיניסטיים על `coupon_scan_events`
   (`wrong_supplier`, `rate_limited`, velocity). `v_supplier_scans_daily` נותן לאדמין
   את אותה תמונה בעין אנושית; ההצלבה מכוונת.
4. **supplier_ops:** ממשיך עם `category_benchmark` (אגרגציה בלבד, בלי שורות של ספקים
   אחרים). `v_take_rate_monthly` הוא הצד האדמיני של אותה שאלה (מה platform_percent שווה).
5. **אירועי סוכנים באנליטיקה:** ריצות סוכן הן `agent_runs` (טבלת מקור, origin=derived
   בפוטנציה). לא נרשם אירוע client על שיחת צ'אט בשלב זה; אם יידרש משפך widget,
   יתווסף `agent_chat_opened` ל-registry ב-INSERT, בלי מיגרציה.
6. **עתידי (superapp):** ורטיקלים חדשים ימשיכו לעבוד באותו דפוס: טבלת אמת פר דומיין,
   אירוע derived ב-registry, ו-views. אין צורך בשינוי סכימת האירועים.

---

## 10. תכולת המיגרציות

### 10.1 מה 033 כוללת (ומה לא)

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

### 10.2 מה 034 כוללת (ומה לא)

כוללת (idempotent, קובץ = טרנזקציה אחת, בדיקת prerequisites קשיחה על 026+027+033):

1. שני אירועי registry חדשים: `coupon_redeemed`, `supplier_payout` (derived).
2. אינדקסים: `coupon_codes(expires_at) WHERE issued`, `coupon_codes(supplier_id, status)`,
   `order_items(supplier_id)`.
3. views לספקים: `v_supplier_sales_daily`, `v_supplier_redemptions_monthly`,
   `v_supplier_scans_daily`, `v_supplier_payouts` (כולם security_invoker).
4. BI אדמין: `v_take_rate_monthly`, `v_coupon_expiry_liability`.
5. matviews: `mv_cohort_retention_monthly`, `mv_take_rate_monthly` (REVOKE מ-anon/authenticated,
   unique index ל-REFRESH CONCURRENTLY) + `fn_refresh_analytics_matviews()`.
6. ממשק סוכנים: `fn_agent_kpi_snapshot()` + `v_agent_costs_daily` (מותנה ב-028).

לא כוללת: קוד אפליקציה (מסכי פורטל ספק, מסכי BI, חיווט tool לסוכנים), תזמון pg_cron,
job פקיעת cashback (דומיין הארנק), שינוי כלשהו ב-026-033; איחוד ה-vendors מתוכנן כ-036.

### 10.3 סדר החלה

026 -> 027 -> ... -> 033 -> **034**. בפועל: 033 דורשת רק 026+027 (028-032 אינן תנאי);
034 דורשת רק 026+027+033 (028 אופציונלית ומזוהה דינמית). רק דרך Supabase MCP
`apply_migration`; אחרי החלה `generate_typescript_types`.

---

## 11. סיכום הכרעות

### 11.1 הכרעות שכבת הבסיס (033)

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
10. **מספור:** 032 נתפסה על ידי ייבוא הוורדפרס; שכבת הבסיס היא 033, עם תלות קשיחה ב-026+027 בלבד.

### 11.2 הכרעות שכבת ההרחבה (034)

1. **מספור:** דומיין ה-BI המורחב הוא 034 (מוספר מחדש מ-035); איחוד ה-vendors מתוכנן כ-036.
2. **שמות אירועים:** `wallet_credit` מהדרישה = `wallet_earn` הקנוני (אין rename);
   `coupon_redeemed` ו-`supplier_payout` נוספים כ-derived. רמת ניסיון (כשלים) נשארת `coupon_scan`.
3. **קופון שפג בלי מימוש: אין החזר אוטומטי.** breakage מוכר ביום הפקיעה; זיכוי מחווה
   רק דרך תמיכה כ-`manual_adjust`. מופיע בתנאי המכר.
4. **cashback פוקע אחרי 12 חודשים,** תזכורת 30 יום מראש; מימוש אצל דומיין הארנק.
5. **דשבורד ספק:** נחשפים מכירות, מימושים, סריקות ו-payouts שלו בלבד, דרך RLS;
   לא נחשפים leaderboard, התנהגות גולשים, ופירוט `wrong_supplier`.
6. **אגרגציה:** views רגילים כברירת מחדל; בדיוק שני matviews (cohort retention, take-rate),
   רענון לילי 02:40, service-role בלבד; אין matviews נוספים בלי בעיית ביצועים נמדדת.
7. **סוכנים:** צריכת אנליטיקה דרך `fn_agent_kpi_snapshot()` ו-views בלבד; אף סוכן לא
   קורא `analytics_events` raw ולא כותב לאובייקט אנליטי.
8. **יחס המרה session-scoped:** נשאר day-level; stitching מלא נדחה עד פרסום בתשלום.
   (אם יידרש: העברת `anonymous_id` לתוך `beginCheckout` ושמירתו על ההזמנה.)
9. **הארכת raw מעבר ל-13 חודשים:** נשארת 13; ההשוואות השנתיות נעשות
   על `analytics_daily` ועל ה-matviews שנשמרים לנצח.

הערה: שש השאלות הפתוחות של תכנון 033 נסגרו כך: קופון שפג (הכרעה 11.2.3), פקיעת cashback
(11.2.4), דשבורד ספק (11.2.5), session stitching (11.2.8), הארכת raw (11.2.9);
נוסח באנר ההסכמה נשאר פתוח (סעיף 12).

## 12. שאלות פתוחות שנשארו

1. נוסח באנר ההסכמה ומעמדו מול הנחיות הרשות להגנת הפרטיות אחרי תיקון 13:
   ייעוץ משפטי לפני production (יחד עם סבב חוק הספאם של 031).
2. איחוד מנועי הסליקה לספקים (`supplier_payouts` מ-026 מול `payout_statements` מ-027):
   קונפליקט ידוע שחייב הכרעה לפני החלת 026/027. ה-BI כאן בנוי על `payout_statements`
   (027); אם ההכרעה תתהפך, `v_supplier_payouts` ו-`supplier_payout` יוסבו באותה מיגרציה.
