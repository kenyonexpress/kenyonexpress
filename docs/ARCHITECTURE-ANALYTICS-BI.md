# ארכיטקטורת אנליטיקה ו-BI: מסמך מאוחד (v2)

תאריך: 2026-07-17. ענף: `phase5/homepage`.

מסמך זה הוא **מקור האמת המאוחד** לדומיין האנליטיקה וה-BI. הוא בולע את
`ANALYTICS-BI-ARCHITECTURE.md` (תכנון 033, נשאר כתיעוד היסטורי של המיגרציה),
סוגר את השאלות הפתוחות שנשארו בו, ומוסיף את השכבות החסרות:
דשבורד ספקים, דוח התחייבות פקיעה, take-rate, cohort retention ואינטגרציית סוכני AI.

מיגרציות נלוות (טיוטות, לא הוחלו):

| קובץ | תפקיד |
|---|---|
| `supabase/migrations/033_analytics.sql` | שכבת הבסיס: registry, `analytics_events` (partitioned), ingest, rollup יומי, views של הבעלים |
| `supabase/migrations/035_analytics_bi.sql` | שכבת ההרחבה (מסמך זה): views לספקים, BI אדמין, materialized views, ממשק סוכנים |

> **מספור:** בפועל קיימים קבצים עד 033. המספר **034 שמור** ל-`034_vendors_unification.sql`
> (הכרעות 1.19 ו-1.38 במסמך האב), ולכן המיגרציה של מסמך זה היא **035**.
> אין תלות של 035 ב-034: ה-views קוראים `suppliers` / `order_items` ישירות וקולטים
> אוטומטית שורות שיאוחדו.

---

## 0. עקרונות על (מחייבים, ירושה מ-033)

1. **שני מישורים, לעולם לא מערבבים.** כסף ועובדות עסקיות חיים בטבלאות המקור
   (`orders`, `order_items`, `payments`, `wallet_transactions`, `coupon_codes`,
   `coupon_scan_events`, `payout_statements`). התנהגות (צפיות, עגלה, checkout)
   חיה ב-`analytics_events`. **אסור לסכום כסף מאירועי אנליטיקה.**
2. **first-party בלבד בתוך Supabase.** אין GA4, אין PostHog, אין פיקסלים (הכרעה 2.2 במסמך 033).
   טריגרים לפתיחה מחדש: תחילת פרסום בתשלום, או ~200 אלף אירועי לקוח בחודש.
3. **snapshot הוא מקור האמת ההיסטורי.** כל חישוב הכנסה מ-`platform_fee_ils` /
   `platform_paid_ils` שהוקפאו בזמן רכישה. שינוי `platform_percent` היום לא מזיז דוח עבר.
4. **יום עסקים = יום Asia/Jerusalem** דרך `fn_il_date(ts)` בלבד. לעולם לא `::date` על timestamptz.
5. **RLS הוא גבול ההרשאה גם ב-BI.** views לספקים הם `security_invoker` ונשענים על
   policies של 027; אין נתיב שבו ספק רואה נתוני ספק אחר.

---

## 1. טקסונומיית אירועים

### 1.1 מעטפת קנונית (envelope) לאירועי `analytics_events`

| שדה | טיפוס | מי כותב | הערות |
|---|---|---|---|
| `event_id` | uuid | שולח | מפתח דה-דופ; retry שולח אותו id |
| `event_name` | text | שולח | snake_case, מה-registry בלבד |
| `schema_version` | smallint | שרת | נחתם מה-registry בזמן ingest |
| `occurred_at` | timestamptz | שולח | מוצמד לחלון [now-7d, now+5m] |
| `source` | text | שולח | `web` / `pwa` / `server` |
| `anonymous_id` | text | לקוח | עוגיית `ke_session_id` (מתחברת ל-`carts.session_id`) |
| `session_id` | text | לקוח | סשן מתגלגל 30 דקות |
| `user_id` | uuid | שרת | מהסשן בלבד, לעולם לא מהלקוח |
| `path`, `referrer`, `utm` | text/jsonb | לקוח | |
| `props` | jsonb | שולח | מפתחות חובה לפי registry; עד 4KB; **בלי PII** |
| `ip_trunc`, `user_agent`, `is_bot` | | שרת | IP קטום /24 (IPv6 /48) |

### 1.2 האירועים המלאים וסכימות ה-payload

מקור האמת: טבלת `analytics_event_definitions`. אירוע `derived` **לא נכתב** ל-`analytics_events`;
הוא נקרא מטבלת המקור שלו. זו ההגנה המבנית מפני double-counting ו-drift.

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
| `coupon_redeemed` | derived (**חדש ב-035**) | `coupon_codes`: `used_at`, `supplier_id`, `face_value_ils`, `platform_paid_ils`, `collect_amount_ils` | `coupon_codes` במעבר ל-`used` בתוך `redeem_coupon()` |
| `wallet_earn` | derived | `wallet_transactions`: `amount_ils`, `reason`, `related_order_id`, `idempotency_key` | credit לחשבון user (המקבילה ל-`wallet_credit` מהדרישה; השם הקנוני נשאר `wallet_earn`) |
| `wallet_spend` | derived | כנ"ל, debit מחשבון user | `wallet_transactions` |
| `supplier_payout` | derived (**חדש ב-035**) | `payout_statements`: `paid_at`, `supplier_id`, `total_gross_ils`, `total_platform_fee_ils`, `total_payout_ils`, `payment_reference`, `bank_snapshot` | `payout_statements` במעבר ל-`paid` בתוך `mark_payout_statement_paid()` |
| `search` | derived | `search_queries`: `query`, `results_count`, `source`, `took_ms` | `search_queries` (030) |

מיפוי שמות מהדרישה העסקית לשמות הקנוניים:

| שם בדרישה | שם קנוני | הערה |
|---|---|---|
| `coupon_redeemed` | `coupon_redeemed` | נוסף ב-035; רמת "הצלחה בלבד". רמת הניסיון היא `coupon_scan` |
| `wallet_credit` | `wallet_earn` | אין שינוי שם: rename אסור לפי כללי ה-registry |
| `supplier_payout` | `supplier_payout` | נוסף ב-035 |

כללי registry (ירושה מ-033, מחייבים): snake_case בלבד, אסור rename (השבתה + שם חדש),
שינוי שובר מעלה `schema_version`, אירוע חדש = INSERT ל-registry בלי מיגרציה.

---

## 2. עיצוב אחסון

### 2.1 הכרעה: Supabase, לא כלי חיצוני

נשארת בתוקף (סעיף 2.2 במסמך 033): איסוף first-party לתוך Postgres של Supabase.
נימוק מכריע: JOIN ישיר בין התנהגות לכסף האמיתי (snapshot + ledger) בדשבורד אחד,
בלי sync, בלי DPA צד שלישי, בלי העברת מידע לחו"ל.

### 2.2 Partitioning ו-retention

- `analytics_events`: declarative partitioning לפי `RANGE (occurred_at)`, partition לחודש UTC
  (`analytics_events_YYYYMM`), PK `(occurred_at, event_id)` שהוא גם הדה-דופ,
  ועוד `analytics_events_default` שחייב להישאר ריק (שורה בו = התראה ב-`v_money_alarms`).
- תחזוקה: `fn_ensure_analytics_partitions(2)` חודשי, `fn_drop_old_analytics_partitions(13)` חודשי.

| דאטה | שמירה | מנגנון |
|---|---|---|
| `analytics_events` (raw) | 13 חודשים | DROP partition חודשי |
| `analytics_daily` (rollup) | לנצח | זעיר |
| `mv_cohort_retention_monthly`, `mv_take_rate_monthly` | מתרעננים לילית | REFRESH, לא גדלים |
| טבלאות כסף (`orders`, `payments`, `wallet_transactions`, `coupon_codes`, `payout_statements`) | לנצח (7 שנים לפחות, הוראות ניהול ספרים) | אין purge |
| `coupon_scan_events` | 90 יום | purge של דומיין הספקים |
| `search_queries` | 6 חודשים | purge של דומיין הקטלוג |
| `agent_run_steps` | 90 יום | purge של דומיין הסוכנים |

### 2.3 פרטיות: GDPR + חוק הגנת הפרטיות (תיקון 13)

הבסיס המשפטי: חוק הגנת הפרטיות ותיקון 13 (בתוקף מאוגוסט 2025): צמצום נתונים,
מטרה מוגדרת, שקיפות, חובת מחיקה. GDPR רלוונטי עקרונית (שרתים ב-EU) ומיושם באותם כלים.

1. **רשומות עסקיות אינן מותנות בהסכמה:** הזמנות, תשלומים, מימושים, ארנק, payouts,
   `begin_checkout`. אלו תפעול העסקה, לא מעקב.
2. **אירועי דפדפן מותנים בהסכמה:** באנר עברית RTL, קבלה/דחייה שוות מעמד, עוגיית
   `ke_consent` עם `wording_version` (דפוס `consent_events` מ-031). בלי הסכמה ה-SDK לא נטען.
3. **הפרדת PII מבנית:**
   - PII (שם, מייל, טלפון, כתובת) חי אך ורק ב-`profiles` / `user_addresses` / auth.
   - `analytics_events.props` לעולם לא מכיל PII; המזהים היחידים הם `user_id` פנימי ועוגיות סשן.
   - IP נקטם לפני אחסון (/24, IPv6 /48); אין fingerprinting; אין מזהי צד שלישי.
   - `notification_events.payload` (031): ids ועובדות כסף בלבד, בלי PII. אותו כלל כאן.
4. **מחיקת חשבון (029):** `fn_execute_account_deletion` מבצע פסאודונימיזציה; job המחיקה
   מאפס `user_id` בשורות `analytics_events` (UPDATE ממוקד אינדקס; אין FK בכוונה).
   השורות האנונימיות נשארות כסטטיסטיקה. רשומות הכסף נשמרות 7 שנים מכוח דין.
5. **בקרת גישה:** raw ו-rollup נקראים רק על ידי אדמין (RLS) או service role;
   ה-matviews בלי RLS ולכן SELECT נשלל מ-anon/authenticated וניגשים אליהם רק דרך
   service client אחרי `requireAdminSession`.

---

## 3. דשבורד ספקים (RLS-scoped)

### 3.1 מנגנון האבטחה

כל ה-views לספקים הם `security_invoker = true`, כלומר רצים עם הרשאות הקורא, ו-RLS
של 027 עושה את הסינון: `is_supplier_member(supplier_id)` על `order_items`, `orders`,
`coupon_codes`, `coupon_scan_events`, ו-policy שמסתירה statements בסטטוס `draft`.
אין `WHERE supplier_id = ...` באפליקציה בתור הגנה; זה נוחות בלבד. אדמין רואה את כולם
דרך policies של אדמין. את ה-views קוראים עם ה-client של המשתמש (לא service client).

### 3.2 ה-views (נוצרים ב-035)

| view | גרעין | שאלת ההחלטה של הספק |
|---|---|---|
| `v_supplier_sales_daily` | מכירות ששולמו פר יום ישראלי: פריטים, הזמנות, GMV, שולם באתר, לגבייה בעסק, עמלת פלטפורמה, `supplier_due_ils` | כמה מכרתי וכמה מגיע לי |
| `v_supplier_redemptions_monthly` | משפך קופונים פר חודש הנפקה: issued / redeemed / expired / outstanding, `redemption_rate_pct`, מזומן שנגבה בעסק, חציון ימים למימוש | כמה לקוחות באמת מגיעים אליי |
| `v_supplier_scans_daily` | ניסיונות סריקה פר יום: הצלחות, already_used, expired, כשלים אחרים | בעיית מכשיר/הדרכה בעסק |
| `v_supplier_payouts` | ה-statements שלו (בלי drafts): תקופה, סטטוס, סכומים, אסמכתה, מחלוקות פתוחות | מתי ואיפה הכסף |

`redemption_rate_pct` מוגדר `used / (used + expired)` על מצבים סופיים בלבד, זהה להגדרת
האדמין, כדי ששני הצדדים יראו את אותו מספר בשיחת טלפון.

### 3.3 מה במפורש לא נחשף לספק

- השוואות בין ספקים (leaderboard, דירוגים, מדדי ספקים אחרים): אדמין בלבד.
- אירועי התנהגות (`analytics_events`, צפיות במוצרים): נשאר admin-only בשלב זה;
  אם ייחשף בעתיד, יהיה זה rollup יומי לפי מוצר, לא raw.
- פירוט `wrong_supplier` (אות fraud): הספק רואה רק "כשלים אחרים"; החקירה אצל האדמין.

זה סוגר את שאלה פתוחה 5 של מסמך 033.

---

## 4. BI אדמין

### 4.1 שכבת הבסיס (קיימת ב-033, ללא שינוי)

`v_owner_dashboard` (שורה אחת, כל בוקר) + `v_money_alarms` + views שבועיים:
`v_revenue_daily`, `v_refunds_daily`, `v_wallet_liability`, `v_wallet_ledger_drift`,
`v_coupon_funnel_monthly`, `v_supplier_leaderboard_30d`, `v_cohort_ltv_monthly`,
`v_channel_revenue_weekly`, `v_funnel_daily`, `v_search_quality_daily` (מותנה ב-030).

GMV, תקבולים באתר והכנסת פלטפורמה נשארים שלושה מספרים נפרדים; GMV של קופון = שווי פנים.

### 4.2 take-rate לפי platform_percent (חדש ב-035)

`v_take_rate_monthly` + snapshot לילי `mv_take_rate_monthly`: פר (חודש ישראלי,
`product_type`, `platform_percent` מה-snapshot): הזמנות, פריטים, GMV, שולם באתר,
הכנסת פלטפורמה, ו-`effective_take_rate_pct = platform_fee / GMV`.

ההחלטות שהוא משרת: אילו מדרגות עמלה באמת מייצרות הכנסה, איפה effective take-rate
נמוך מהחוזי (קופונים: היחס בין `coupon_price` לשווי הפנים), ואת מי לתמחר מחדש בחידוש.

### 4.3 דוח התחייבות פקיעת קופונים (חדש ב-035)

`v_coupon_expiry_liability`, שורה פר דלי:

| דלי | משמעות |
|---|---|
| `overdue_not_swept` | `expires_at` עבר אבל עדיין `issued`: ה-cron `expire_coupons()` מפגר. חייב להיות 0 |
| `expiring_7d` / `expiring_8_30d` / `expiring_31_90d` / `expiring_90d_plus` / `no_expiry` | קופונים פתוחים לפי זמן לפקיעה, עם `platform_paid_ils` (כבר אצלנו) ו-`collect_amount_ils` (העסק עוד מצפה לגבות) |
| `expired_unredeemed_12m` | breakage מוכר, 12 חודשים אחורה |
| `refunded_12m` | הקשר: כמה הוחזר |

**הכרעת מדיניות (סוגרת שאלה פתוחה 1 של 033 ושאלה 9.4 של מסמך הספקים):**
קופון שפג בלי מימוש **אינו מוחזר אוטומטית**. `platform_paid_ils` מוכר כהכנסת breakage
ביום הפקיעה. מחווה ללקוח (זיכוי ארנק) עוברת רק דרך תמיכה, כ-`manual_adjust` ב-ledger,
ולכן מדווחת אוטומטית בדוחות הארנק. תנאי המכר בדף המוצר חייבים לומר זאת מפורשות.
נגזרת: דלי `expiring_7d` הוא היעד של תזכורות 7d/48h מ-031; שיעור מימוש נמוך פוגע
בעסק פעמיים (לקוח שנכווה + ספק שלא ראה אותו), לכן breakage הוא הכנסה שאסור לרדוף אחריה.

**הכרעת מדיניות (סוגרת שאלה פתוחה 2 של 033):** cashback פוקע **12 חודשים** אחרי הצבירה,
עם תזכורת 30 יום מראש דרך ה-outbox של 031. מימוש: job של דומיין הארנק (לא 035) שמזרים
`expire` ב-`fn_wallet_transfer` מחשבון המשתמש ל-`platform:cashback_reserve`.
עד שה-job קיים, ההתחייבות בדוח מוצגת open-ended, וזה השמרני הנכון.

### 4.4 cohort retention (חדש ב-035)

`mv_cohort_retention_monthly`: קוהורטת חודש-רכישה-ראשונה x חודש-סטייה, עם
`retention_pct = active_buyers / cohort_size` בנוסף ל-LTV המצטבר של `v_cohort_ltv_monthly`.
retention עונה "האם לקוחות חוזרים"; LTV עונה "כמה זה שווה". שניהם על
`platform_fee_ils`, לא GMV.

---

## 5. אסטרטגיית אגרגציה ו-materialized views

שלוש מדרגות, לפי עלות החישוב מול טריות:

| מדרגה | אובייקטים | טריות | נימוק |
|---|---|---|---|
| טבלת rollup | `analytics_daily` (נכתבת ב-`fn_rollup_analytics_daily`) | לילי, ניתנת לבנייה מחדש פר יום | שורדת מחיקת partitions; זעירה; לנצח |
| views רגילים | כל ה-`v_*` (בעלים, ספקים, take-rate, liability) | real-time | הנפחים קטנים (עשרות אלפי שורות בשנים הקרובות); אינדקסים של 033/035 מספיקים; אפס תחזוקת קונסיסטנטיות |
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
| קריאת `v_money_alarms` + התראה | לילי + בכל טעינת דשבורד | Vercel cron (דורש Pro) |

pg_cron זמין גם ב-free tier ומריץ SQL טהור; כל מה שנוגע ב-API חיצוני (התראות, reconcile)
נשאר ב-Vercel cron עם `CRON_SECRET`.

---

## 6. אינטגרציה עם סוכני AI (028)

עקרון: **סוכנים צורכים אנליטיקה דרך משטחים צרים וקריאים בלבד; לעולם לא raw events,
לעולם לא כתיבה.** RLS נשאר גבול ההרשאה של tools בצד המשתמש.

1. **`fn_agent_kpi_snapshot()` (חדש ב-035):** קריאה אחת זולה, service role בלבד,
   מחזירה jsonb עם KPI מטבלאות האמת: הכנסת פלטפורמה היום/7 ימים, הזמנות היום,
   קופונים פתוחים + לגבייה, שיעור מימוש 30 יום, התחייבות ארנק, מספר התראות כסף.
   זה משטח ה-grounding של `support` ושל דוחות אוטומטיים עתידיים. הרחבת יכולות
   סוכן = הוספת מפתח כאן, לא הרחבת הרשאות טבלאות.
2. **`v_agent_costs_daily` (חדש ב-035, מותנה בקיום `agent_runs`):** עלות/טוקנים/סטטוסים
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

## 7. מה 035 כוללת (ומה לא)

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
job פקיעת cashback (דומיין הארנק), שינוי כלשהו ב-026-033, ו-034 שנשארת שמורה לאיחוד vendors.

סדר החלה: 026 -> 027 -> ... -> 033 -> 034 -> **035** (035 דורשת בפועל רק 026+027+033;
028 אופציונלית ומזוהה דינמית). רק דרך Supabase MCP `apply_migration`; אחרי החלה
`generate_typescript_types`.

---

## 8. סיכום הכרעות (חדשות במסמך זה)

1. **מספור:** 034 שמורה לאיחוד vendors; דומיין ה-BI הוא 035.
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
8. **יחס המרה session-scoped** (שאלה 4 של 033): נשאר day-level; stitching מלא נדחה
   עד פרסום בתשלום.
9. **הארכת raw מעבר ל-13 חודשים** (שאלה 6 של 033): נשארת 13; ההשוואות השנתיות נעשות
   על `analytics_daily` ועל ה-matviews שנשמרים לנצח.

## 9. שאלות פתוחות שנשארו

1. נוסח באנר ההסכמה ומעמדו מול הנחיות הרשות להגנת הפרטיות אחרי תיקון 13:
   ייעוץ משפטי לפני production (יחד עם סבב חוק הספאם של 031).
2. איחוד מנועי הסליקה לספקים (`supplier_payouts` מ-026 מול `payout_statements` מ-027):
   קונפליקט ידוע שחייב הכרעה לפני החלת 026/027. ה-BI כאן בנוי על `payout_statements`
   (027); אם ההכרעה תתהפך, `v_supplier_payouts` ו-`supplier_payout` יוסבו באותה מיגרציה.
