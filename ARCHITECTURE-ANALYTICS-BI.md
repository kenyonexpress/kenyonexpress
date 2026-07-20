# ארכיטקטורת אנליטיקה ו-BI: מסמך מאוחד (v3)

תאריך: 2026-07-20. ענף: `phase5/homepage`. design only, אפס מימוש.

מסמך זה הוא **מקור האמת היחיד** לדומיין האנליטיקה וה-BI. הוא בולע את
`docs/ARCHITECTURE-ANALYTICS-BI.md` (v2, 2026-07-17), שמקבל הודעת האחדה בראשו ונשאר
כתיעוד היסטורי. v3 מיושר מול טיוטות המיגרציות הקיימות (033 + 034, לא הוחלו) ומוסיף
את השכבות שחסרו: session stitching אורח-למחובר, דייג'סט מייל יומי, איסוף Web Vitals,
אסטרטגיית שאילתות איטיות, שדה `source_app` לאפליקציות עתידיות, ומדד repeat purchase.

> **הכרעות בעלים (2026-07-20), סגרו את השאלות הפתוחות של הסבב הקודם:**
> 1. **ייחוס = UTM בלבד** בשלב זה (סעיף 6).
> 2. **דייג'סט מייל יומי לאדמין ב-07:00 ישראל** (סעיף 5.4).
> 3. **Vercel Cron ל-jobs אפליקטיביים; pg_cron רק ל-jobs פנימיים ל-DB**
>    (פקיעות, הזמנות תקועות; סעיף 8).

מיגרציות נלוות (טיוטות, לא הוחלו):

| קובץ | תפקיד |
|---|---|
| `supabase/migrations/033_analytics.sql` | שכבת הבסיס: registry, `analytics_events` (partitioned), ingest, rollup יומי, views של הבעלים |
| `supabase/migrations/034_analytics_bi.sql` | שכבת ההרחבה: views לספקים, BI אדמין, materialized views, ממשק סוכנים |

שתי הטיוטות טרם הוחלו, ולכן הדלתא של v3 (סעיף 11) מתוקנת **בתוך הטיוטות עצמן**
לפני החלה, בלי מיגרציית תיקון נוספת ובלי לשבור את רצף המספור (042 כבר תפוס).

תנאים מוקדמים של 033 (קשיחים): 026 (עמודות snapshot על `order_items`, `payments`,
`wallet_accounts`) ו-027 (עמודות snapshot על `coupon_codes`, `coupon_scan_events`).
030 (`search_queries`) ו-028 (`agent_runs`) אופציונליים: ה-views שלהם נוצרים רק אם הטבלאות קיימות.

מסמכים קשורים: `ARCHITECTURE-COMMERCE.md` (026), `ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027),
`ARCHITECTURE-ACCOUNT-IDENTITY.md` (029), `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` (031),
`ARCHITECTURE-PERFORMANCE.md` (D-9, תקציבי Web Vitals), `ARCHITECTURE-OBSERVABILITY.md`
(OBS-13/15, ערוצי התראה), `ARCHITECTURE-GROWTH-SEO.md` (סכימת UTM קנונית, CAPI),
`ARCHITECTURE-MOBILE-SUPERAPP.md`, `MASTER-ARCHITECTURE.md` (R29).

---

## 0. עקרונות על (מחייבים)

1. **שני מישורים, לעולם לא מערבבים.** כסף ועובדות עסקיות חיים בטבלאות המקור
   (`orders`, `order_items`, `payments`, `wallet_transactions`, `coupon_codes`,
   `coupon_scan_events`, `payout_statements`). התנהגות (צפיות, עגלה, checkout)
   חיה ב-`analytics_events`. **אסור לסכום כסף מאירועי אנליטיקה.** הכנסה נקראת תמיד
   מה-ledger; אירועים סופרים התנהגות בלבד.
2. **first-party בלבד בתוך Supabase.** אין GA4, אין PostHog, אין פיקסלים בשלב זה
   (הכרעה בסעיף 3.1). טריגרים לפתיחה מחדש: פרסום בתשלום או ~200 אלף אירועי לקוח בחודש.
3. **מספרים להחלטה, לא לגאווה.** כל מדד בדשבורד חייב לענות על "איזו פעולה אעשה אם המספר רע".
4. **snapshot הוא מקור האמת ההיסטורי.** כל חישוב הכנסה מ-`platform_fee_ils` /
   `platform_paid_ils` שהוקפאו בזמן רכישה. שינוי `platform_percent` היום לא מזיז דוח עבר.
5. **יום עסקים = יום Asia/Jerusalem** דרך `fn_il_date(ts)` בלבד. אחסון UTC (`timestamptz`);
   לעולם לא `::date` ישיר על timestamptz.
6. **RLS הוא גבול ההרשאה גם ב-BI.** views לספקים הם `security_invoker` ונשענים על
   policies של 027; אין נתיב שבו ספק רואה נתוני ספק אחר.
7. **בלי PII באירועים.** PII חי אך ורק ב-`profiles` / `user_addresses` / auth;
   באירועים יש `user_id` פנימי, מזהי סשן ו-IP קטום בלבד (סעיף 3.4).

---

## 1. טקסונומיית אירועים

### 1.1 מעטפת קנונית (envelope)

כל אירוע, מכל מקור, נושא את אותה מעטפת:

| שדה | טיפוס | מי כותב | הערות |
|---|---|---|---|
| `event_id` | uuid | שולח | מפתח דה-דופ; retry שולח אותו id |
| `event_name` | text | שולח | snake_case, מה-registry בלבד (1.3) |
| `schema_version` | smallint | שרת | נחתם מה-registry בזמן ingest, לא מהלקוח |
| `occurred_at` | timestamptz | שולח | ingest מצמיד לחלון [now-7d, now+5m] |
| `source` | text | שולח | `web` / `pwa` / `server` (עתידי: `mobile`) |
| `source_app` | text | שולח | **חדש ב-v3.** `shop` (ברירת מחדל) / `delivery` / `taxi`. סעיף 10 |
| `anonymous_id` | text | לקוח | עוגיית `ke_session_id` הקיימת (אותה עוגייה של עגלת אורח, מתחברת ל-`carts.session_id`) |
| `session_id` | text | לקוח | סשן מתגלגל 30 דקות, נוצר בצד לקוח |
| `user_id` | uuid | שרת | נכתב על ידי ה-route מהסשן בלבד, לעולם לא מהלקוח |
| `path`, `referrer` | text | לקוח | |
| `utm` | jsonb | לקוח | `{source, medium, campaign, content, term}`, אם קיים |
| `props` | jsonb | שולח | מפתחות חובה לפי registry; עד 4KB; **בלי PII** |
| `ip_trunc`, `user_agent`, `is_bot` | | שרת | IP קטום /24 (IPv6 /48); בלי IP מלא |

### 1.2 האירועים המלאים

מקור האמת: טבלת `analytics_event_definitions`. **הכרעת המפתח: אירוע `derived` לא נכתב
ל-`analytics_events` בכלל**; הוא נקרא מטבלת המקור שלו, שהיא כבר append-only עם snapshot
כספי. אין כתיבה כפולה, אין triggers חדשים על טבלאות ליבה, אין double-counting.

| event_name | origin | payload (props / עמודות מקור) | מקור אמת |
|---|---|---|---|
| `page_view` | client | (אין props חובה) | `analytics_events` |
| `view_product` | client | `product_id` (חובה), `category_id`, `price_ils`, `product_type` | `analytics_events` |
| `view_category` | client | `category_id` (חובה) | `analytics_events` |
| `add_to_cart` | client | `product_id`, `quantity` (חובה), `variant_id`, `price_ils` | `analytics_events` |
| `remove_from_cart` | client | `product_id` (חובה) | `analytics_events` |
| `checkout_step` | client (**חדש ב-v3**) | `step` (חובה): `identity` / `address` / `payment_redirect` | `analytics_events`; ממפה את המשפך של ARCHITECTURE-CHECKOUT-PAYMENT לפני ההפניה ל-Cardcom |
| `begin_checkout` | server | `order_id`, `items_count` (חובה), `cart_total_ils` | `analytics_events`, נפלט מ-`beginCheckout` אחרי יצירת הזמנה pending |
| `web_vital` | client (**חדש ב-v3**) | `metric` (חובה: LCP/CLS/INP/TTFB/FCP), `value` (חובה), `rating`, `route` | `analytics_events`; סעיף 7 |
| `purchase` | derived | `orders.paid_at` + עמודות snapshot של `order_items` | `orders` + `order_items` (webhook מאומת של Cardcom) |
| `refund` | derived | `payments`: `amount_ils`, `succeeded_at`, `order_id` | `payments` עם `kind='refund'`, `status='succeeded'` |
| `coupon_scan` | derived | `coupon_scan_events`: `result`, `scan_method`, `supplier_id` | כל ניסיון סריקה, כולל כשלונות |
| `coupon_redeemed` | derived | `coupon_codes`: `used_at`, `supplier_id`, סכומי snapshot | מעבר ל-`used` בתוך `redeem_coupon()` |
| `wallet_earn` | derived | `wallet_transactions`: credit לחשבון user | `wallet_transactions` |
| `wallet_spend` | derived | `wallet_transactions`: debit מחשבון user | `wallet_transactions` |
| `supplier_payout` | derived | `payout_statements` במעבר ל-`paid` | `payout_statements` |
| `search` | derived | `search_queries`: `query`, `results_count`, `took_ms` | `search_queries` (030) |

`purchase` לא נפלט מדף התודה (הדפדפן לא אמין). ספירת רכישות היא תמיד `orders.paid_at`,
שנכתב בטרנזקציית ה-webhook המאומתת של Cardcom. שימוש בארנק בזמן checkout
(`cashback_applied_ils`) נקרא מ-`wallet_transactions` לפי `reason`, לא מאירוע.

### 1.3 registry, שמות וגרסאות (מחייבים)

- `analytics_event_definitions` היא מקור האמת: `event_name` (PK), `origin`,
  `required_props`, `schema_version`, `is_active`. ה-ingest דוחה אירוע שלא רשום
  או שחסר לו prop חובה.
- שמות: `snake_case`, פועל ואז אובייקט, אנגלית בלבד, 3-50 תווים (CHECK בטבלה).
- שינוי מוסיף (prop אופציונלי) לא מעלה גרסה; שינוי שובר מעלה `schema_version`.
  **אסור לשנות שם אירוע**: שם שגוי מושבת (`is_active=false`) ונרשם שם חדש.
- אירוע חדש = INSERT ל-registry (אדמין, עם audit trigger), בלי מיגרציה.
  `checkout_step` ו-`web_vital` נכנסים ל-seed של טיוטת 033 (סעיף 11).

---

## 2. צנרת איסוף

### 2.1 חלוקת לקוח/שרת

```
לקוח (דפדפן / PWA)                          שרת
  page_view, view_product, view_category,     begin_checkout  (בתוך ה-server action,
  add_to_cart, remove_from_cart,               אחרי יצירת ההזמנה, service client)
  checkout_step, web_vital                        |
      |                                           |
      | batch עד 20 אירועים, flush כל 10 שניות    |
      | או ב-pagehide דרך navigator.sendBeacon    |
      v                                           v
POST /api/a  (route handler)  ------------------>+
  - קורא session (user_id מהשרת, לא מהלקוח)
  - בדיקת עוגיית הסכמה (3.4): אין הסכמה -> 204, drop
  - rate limit IP (תשתית 002): ~120 אירועים לדקה ל-IP
  - service client -> rpc fn_ingest_analytics_events(batch, user_id, ip, ua)
      v
fn_ingest_analytics_events  (SECURITY DEFINER, service role בלבד)
  - ולידציה מול ה-registry (שם, origin, props חובה)
  - clamp של occurred_at, סימון is_bot, קיטום IP, ולידציית source_app
  - INSERT ... ON CONFLICT (occurred_at, event_id) DO NOTHING   <- דה-דופ
      v
analytics_events  (partitioned, סעיף 3.2)
```

- אירוע שנפל בולידציה נזרק בשקט. אנליטיקה לעולם לא מפילה UX: כשל ב-`/api/a`
  נבלע בצד לקוח (נסיון אחד + פעם אחת ב-flush הבא).
- ה-route דורש Content-Type ו-Origin תקינים.

### 2.2 session stitching אורח-למחובר (הכרעת v3)

הבעיה: משתמש גולש כאורח (יש `anonymous_id`, אין `user_id`), מתחבר בזמן checkout,
ומרגע זה האירועים נושאים `user_id`. בלי חיבור בין שני החלקים, משפך ההמרה מפוצל.

ההכרעה, בשלוש שכבות, מהזול ליקר:

1. **צד לקוח (קיים בתכנון):** `anonymous_id` הוא עוגיית `ke_session_id` שאינה מתאפסת
   בהתחברות. אחרי login האירועים נושאים **גם** `anonymous_id` וגם `user_id`, כך שרוב
   ה-stitching הוא JOIN טבעי על `anonymous_id` בלי שום תשתית נוספת.
2. **טבלת קישור (נוסף ב-v3 לטיוטת 033):** `analytics_identity_links`
   (`anonymous_id` text, `user_id` uuid, `linked_at` timestamptz,
   PK `(anonymous_id, user_id)`). נכתבת פעם אחת, server-side, בשני מקומות:
   ה-callback של ההתחברות ו-`beginCheckout` (החגורה והשלייקס). היא מאפשרת לייחס
   בדיעבד אירועי טרום-התחברות למשתמש **בזמן שאילתה**, בלי UPDATE על partitions
   (UPDATE רוחבי על טבלה מפורקת הוא בדיוק מה שה-partitioning נועד למנוע).
   RLS: קריאה לאדמין בלבד; כתיבה דרך service client בלבד.
3. **מה לא עושים עכשיו:** משפכים user-level מלאים (stitched) נשארים שאילתת עומק
   אד-הוק, לא view קבוע. `v_funnel_daily` נשאר ברמת יום. ההשקעה במשפך stitched קבוע
   נדחית לטריגר של פרסום בתשלום (עקבי עם הכרעת 11.2.8 של v2), אבל **הדאטה נאסף
   מהיום הראשון**, כך שביום שנצטרך, ההיסטוריה קיימת.

מחיקת חשבון (029): job המחיקה מוחק גם את שורות `analytics_identity_links` של
המשתמש, באותה ריצה שמאפסת `user_id` ב-`analytics_events`.

---

## 3. עיצוב אחסון ופרטיות

### 3.1 הכרעה: first-party בתוך Supabase, בלי כלי חיצוני

JOIN ישיר בין התנהגות לכסף האמיתי (snapshot + ledger) בדשבורד אחד, בלי sync,
בלי DPA צד שלישי, בלי העברת מידע לחו"ל. שני טריגרים לפתיחת ההחלטה מחדש:
(א) התחלת רכישת מדיה בתשלום (ייבוא conversions לפלטפורמות, מתוכנן ב-GROWTH 5.2/5.3);
(ב) מעל ~200 אלף אירועי לקוח בחודש או צורך אמיתי ב-session replay, ואז PostHog EU
כתוספת, לא כתחליף. הכרעת Vercel: סעיף 7.2.

### 3.2 Partitioning

- `analytics_events` מפורקת לפי `RANGE (occurred_at)`, partition לחודש קלנדרי (UTC)
  בשם `analytics_events_YYYYMM`, ועוד `analytics_events_default` כרשת ביטחון שחייבת
  להישאר ריקה (שורה בו = התראה ב-`v_money_alarms`).
- `PRIMARY KEY (occurred_at, event_id)`: מפתח החלוקה חייב להיכלל, וה-unique הזה הוא גם הדה-דופ.
- `fn_ensure_analytics_partitions(2)` רץ חודשי ויוצר [חודש קודם .. חודש+2] כולל RLS
  על כל partition חדש.
- `fn_drop_old_analytics_partitions(13)` מוחק partitions ישנים. DROP של partition הוא
  מיידי וזול (בלי DELETE, בלי vacuum). לפני המחיקה ה-rollup היומי כבר שימר את מה שחשוב.

### 3.3 Retention (מדיניות גיזום מלאה)

| דאטה | שמירה | מנגנון |
|---|---|---|
| `analytics_events` (raw) | **13 חודשים** | DROP partition חודשי (pg_cron, 1 לחודש) |
| `analytics_daily` (rollup) | לנצח | זעיר (שורות בודדות ליום) |
| `analytics_identity_links` | כחיי החשבון; נמחק במחיקת חשבון | job המחיקה של 029 |
| `mv_cohort_retention_monthly`, `mv_take_rate_monthly` | מתרעננים, לא גדלים | REFRESH |
| טבלאות כסף | לנצח (7 שנים לפחות, הוראות מס) | אין purge |
| `coupon_scan_events` | 90 יום | purge של דומיין הספקים |
| `search_queries` | 6 חודשים | purge של דומיין הקטלוג |

הדרישה העסקית היא "12 חודשים ל-raw". ההכרעה נשארת **13**: 12 החודשים המבוקשים ועוד
חודש חפיפה אחד, כדי שהשוואת year-over-year על raw (למשל אוקטובר מול אוקטובר) אפשרית
כל החודש ולא רק ביומו הראשון. העלות: partition אחד נוסף. ההשוואות הרב-שנתיות נעשות
על `analytics_daily` ועל ה-matviews שנשמרים לנצח.

### 3.4 פרטיות: GDPR + חוק הגנת הפרטיות (תיקון 13)

1. **רשומות עסקיות אינן מותנות בהסכמה:** הזמנות, תשלומים, מימושים, ארנק, payouts,
   `begin_checkout` (חלק מעסקה שהמשתמש יזם).
2. **אירועי דפדפן מותנים בהסכמה:** באנר עברית RTL, קבלה/דחייה שוות מעמד, עוגיית
   `ke_consent` (12 חודשים) עם `wording_version`. בלי הסכמה: אפס אירועי לקוח,
   ה-SDK לא נטען. `web_vital` נכלל באותו gate (שמרני: הוא נוסע באותה צנרת עם מזהי סשן).
3. **הפרדת PII מבנית:** PII רק ב-`profiles` / `user_addresses` / auth. `props` לעולם
   לא מכיל PII; IP נקטם לפני אחסון; אין fingerprinting; אין מזהי צד שלישי.
4. **מחיקת חשבון (029):** איפוס `user_id` באירועים (UPDATE ממוקד באינדקס; אין FK
   בכוונה) + מחיקת שורות `analytics_identity_links`. השורות האנונימיות נשארות כסטטיסטיקה.
5. **בקרת גישה:** raw ו-rollup נקראים רק על ידי אדמין (RLS) או service role;
   ה-matviews בלי RLS ולכן SELECT נשלל מ-anon/authenticated וניגשים אליהם רק דרך
   service client אחרי `requireAdminSession`.

---

## 4. מדדים עסקיים (הגדרות מחייבות)

### 4.1 טבלת ההגדרות

כל מדד: נוסחה אחת, מקור אחד, view אחד. שני מספרים שונים לאותה שאלה = באג.

| מדד | הגדרה | מקור | view |
|---|---|---|---|
| GMV | `sum(order_items.total_price_ils)` על הזמנות paid; קופון לפי **שווי פנים** | snapshot 026 | `v_revenue_daily` |
| תקבולים באתר (cash-in) | `sum(charged_on_site_ils)` | snapshot | `v_revenue_daily` |
| הכנסת פלטפורמה | `sum(platform_fee_ils)` בזמן paid; החזרים כשורה שלילית ביום ההחזר | snapshot | `v_revenue_daily` + `v_refunds_daily` |
| הכנסת ספקים | physical: `sum(supplier_due_ils)`; קופונים: `sum(collect_amount_ils)` שנגבה בעסק במימוש | snapshot | `v_supplier_sales_daily`, `v_supplier_redemptions_monthly` |
| התחייבות cashback | `sum(balance_ils)` על חשבונות user; drift מול ה-ledger = התראה | `wallet_accounts` | `v_wallet_liability` + `v_wallet_ledger_drift` |
| שיעור מימוש פר ספק | `used / (used + expired)` על מצבים סופיים בלבד; זהה לאדמין ולספק | `coupon_codes` | `v_supplier_redemptions_monthly`, `v_supplier_leaderboard_30d` |
| בזבוז פקיעת קופונים | קופונים שפגו בלי מימוש + ההתחייבות שנוצרה (LEGAL 1.2: זיכוי `refund_credit` אוטומטי מלא, אין breakage) | `coupon_codes` | `v_coupon_expiry_liability` |
| AOV | GMV / הזמנות paid, ליום עסקים ישראלי | orders + snapshot | `v_owner_dashboard` |
| repeat purchase rate | מבין הקונים בחודש: אחוז שהיו להם הזמנות paid קודמות אי-פעם | `orders` | `v_repeat_purchase_monthly` (**חדש ב-v3**, 4.3) |
| המרת משפך פר שלב | sessions -> product_views -> add_to_carts -> checkout_steps -> checkouts -> purchases, יחס יומי | rollup + orders | `v_funnel_daily` (מורחב, 4.4) |
| cohort LTV / retention | קוהורטת חודש-רכישה-ראשונה; הכנסה = `platform_fee_ils`, לא GMV | orders + snapshot | `v_cohort_ltv_monthly`, `mv_cohort_retention_monthly` |
| take-rate אפקטיבי | `platform_fee / GMV` פר (חודש, product_type, platform_percent מה-snapshot) | snapshot | `v_take_rate_monthly` |

### 4.2 משפך הקופון (ללא שינוי מ-v2)

קוד קופון נוצר רק בתשלום ("issued" = "paid" הם אותו רגע):

```
התנהגות (analytics_events):  view_product -> add_to_cart -> checkout_step -> begin_checkout
                                                                                |
כסף (orders):                                                            orders.paid_at
                                                                                |
נכס (coupon_codes):        issued --+--> used      (redeem_coupon, מימוש בעסק)
                                    +--> expired   (cron; מזכה refund_credit אוטומטית, LEGAL 1.2)
                                    +--> refunded  (החזר אדמין)
```

מדדי ההכרעה: scan rate (`used / (used+expired)`), median days to scan (קובע
`expires_at` ותזמון תזכורות 7d/48h), ו-outstanding (כמות + `platform_paid_ils` שכבר
בקופה + `collect_amount_ils` שהעסקים עוד מצפים לגבות).

### 4.3 `v_repeat_purchase_monthly` (חדש ב-v3, נוסף לטיוטת 034)

view רגיל (`security_invoker`), פר חודש ישראלי:

| עמודה | הגדרה |
|---|---|
| `month_il` | `date_trunc('month', paid_at AT TIME ZONE 'Asia/Jerusalem')` |
| `buyers` | `count(DISTINCT user_id)` עם הזמנה paid בחודש |
| `new_buyers` | קונים שזו ההזמנה ה-paid הראשונה שלהם אי-פעם |
| `repeat_buyers` | `buyers - new_buyers` |
| `repeat_rate_pct` | `100 * repeat_buyers / buyers` |
| `orders_per_buyer` | הזמנות paid בחודש / buyers |

זה המדד המשלים ל-cohort retention: retention עונה "האם קוהורטה חוזרת לאורך זמן",
repeat rate עונה "מי קנה החודש: חדשים או חוזרים" במבט אחד.

### 4.4 הרחבת `v_funnel_daily`

נוספת עמודת `checkout_steps` (ספירת `checkout_step` מה-rollup) בין `add_to_carts`
ל-`checkouts`, כדי להבחין בין "לא התחילו checkout" לבין "התחילו ונפלו לפני יצירת
הזמנה" (זה הפער שמסמך התשלומים צריך למדוד). אחוזי ההמרה בין שלבים מחושבים בשכבת
התצוגה, לא ב-view (אותו מספר גולמי, כמה יחסים).

---

## 5. דשבורדים

### 5.1 דשבורד האדמין היומי (מסך אחד)

`/admin/dashboard`: שורת התראות (`v_money_alarms`, אם יש) ואז המספרים
(`v_owner_dashboard`, שורה אחת). נקרא בצד השרת עם service client אחרי
`requireAdminSession` (ה-views הם `security_invoker`, ו-service role עוקף חורי RLS
היסטוריים; ההגנה היא ה-guard באפליקציה, כמו בשאר האדמין).

**הכרעת הטריות (v3): הדשבורד מוגש מ-views רגילים בזמן אמת, לא מ-matviews שעתיים.**
הדרישה "materialized views מרועננים כל שעה" נענית כך:

1. הנפחים הצפויים (עשרות אלפי שורות הזמנה בשנים הקרובות) הופכים את
   `v_owner_dashboard` לזול; view רגיל נותן טריות מושלמת בחינם. matview שעתי היה
   מוסיף staleness של עד שעה ותחזוקת refresh, בלי להאיץ כלום.
2. שני ה-matviews הקיימים (cohort retention, take-rate) הם סריקות היסטוריה מלאות
   שמשתנות לאט; הם נשארים ברענון **לילי** 02:40.
3. **שער מוגדר מראש למעבר לרענון שעתי:** אם שאילתת דשבורד נמדדת מעל 200ms
   (p95, מתוך pg_stat_statements, סעיף 7.4), אותו SELECT הופך ל-matview ייעודי
   (`mv_owner_kpis`) עם unique index, ונרשם pg_cron שעתי
   (`REFRESH MATERIALIZED VIEW CONCURRENTLY`, בתדירות `5 * * * *`). ההיפוך זול
   כי ה-SELECT זהה; ההקדמה יוצרת בעיות staleness בחינם.

### 5.2 עיון שבועי (לא כל בוקר)

| view | שאלה שהוא עונה עליה |
|---|---|
| `v_funnel_daily` (מורחב) | איפה המשפך דולף, כולל שלבי checkout |
| `v_repeat_purchase_monthly` | חדשים מול חוזרים |
| `v_cohort_ltv_monthly` + `mv_cohort_retention_monthly` | האם לקוחות חוזרים וכמה שווה לקוח |
| `v_supplier_leaderboard_30d` | את מי לקדם, את מי לתמחר מחדש, מי מסוכן |
| `v_channel_revenue_weekly` | מאיפה מגיעה הכנסה (UTM last-touch) |
| `v_take_rate_monthly` / `mv_take_rate_monthly` | אילו מדרגות עמלה מייצרות הכנסה |
| `v_coupon_expiry_liability` | חשיפת פקיעה, `overdue_not_swept` חייב 0 |
| `v_web_vitals_daily` (**חדש**, סעיף 7.3) | ביצועים בשטח מול תקציבי PERFORMANCE 4.1 |
| `v_search_quality_daily` (אם 030 הוחלה) | zero-results ו-p95 של החיפוש |

### 5.3 דשבורד ספקים (RLS-scoped, ללא שינוי מ-v2)

כל ה-views לספקים `security_invoker = true`; RLS של 027 מסנן
(`is_supplier_member(supplier_id)`), נקראים עם ה-client של המשתמש (לא service):

| view | שאלת ההחלטה של הספק |
|---|---|
| `v_supplier_sales_daily` | כמה מכרתי וכמה מגיע לי |
| `v_supplier_redemptions_monthly` | כמה לקוחות באמת מגיעים אליי |
| `v_supplier_scans_daily` | בעיית מכשיר/הדרכה בעסק |
| `v_supplier_payouts` | מתי ואיפה הכסף |

לא נחשפים לספק: leaderboard והשוואות בין ספקים, אירועי התנהגות, פירוט
`wrong_supplier` (אות fraud, נשאר אצל האדמין).

### 5.4 דייג'סט מייל יומי לאדמין (חדש ב-v3)

**הכרעת בעלים (2026-07-20): יומי ב-07:00 ישראל, לאדמין.**

מייל אחד, עברית RTL, כל בוקר 07:00 ישראל. מתמזג עם דייג'סט ה-SEV3 של
OBSERVABILITY (OBS-15) לאותה שליחה: מייל בוקר אחד, לא שניים.

| רכיב | ערך |
|---|---|
| מנגנון | Vercel cron -> route `/api/cron/daily-digest` מוגן `CRON_SECRET`. Vercel cron הוא UTC בלבד, לכן נרשמים שני schedules (04:00 + 05:00 UTC) וה-route שולח רק כשהשעה המקומית בישראל היא 07, עם idempotency key `owner_digest:<il_date>` כך שכפל DST ו-retries מתמוטטים למייל אחד ביום ישראלי |
| מקורות | `v_owner_dashboard` (יום אתמול מלא + היום עד כה), `v_money_alarms`, SEV3 פתוחים |
| שליחה | שלב A (לפני 031 חיה): Resend ישירות מה-route. שלב B: דרך `notifications_outbox` (031), template ייעודי `owner_digest`, ערוץ מייל + WhatsApp |
| תוכן | 1) התראות פתוחות (אם יש: הן למעלה, באדום). 2) הכנסת פלטפורמה אתמול מול ממוצע 7 ימים. 3) הזמנות + AOV. 4) GMV מול cash-in. 5) לקוחות ראשונים. 6) סריקות (הצלחות/כשלונות). 7) קופונים פתוחים + ₪. 8) התחייבות ארנק. 9) עגלות נטושות פתוחות |
| כלל ניסוח | כל מספר מוצג מול baseline (אתמול / ממוצע 7 ימים); בלי baseline המספר חסר משמעות במייל |
| כשל שליחה | לא retry אגרסיבי; הדשבורד הוא מקור האמת, המייל הוא נוחות. כשל נרשם ללוג ומופיע בבדיקת ה-heartbeat של Better Stack (monitor על ה-cron) |

זה **לא** מחליף את מנוע ההתראות של OBS-13 (`/api/cron/alerts` כל 15 דקות):
תקלת כסף לא מחכה למייל של הבוקר.

---

## 6. ייחוס שיווקי (attribution)

**הכרעת בעלים (2026-07-20): ייחוס = UTM בלבד בשלב זה.**

1. **עוגיית ייחוס 30 יום** (first-party): נלכדים אך ורק פרמטרי `utm_*`
   (הסכימה הקנונית של GROWTH 3.1: lowercase, סדר אלפביתי).
   נשמרים first-touch (הביקור הראשון בחלון) ו-last-touch (העדכני).
   **נדחה במפורש עד פרסום בתשלום:** `referrer`, `landing_path`, click IDs
   (`gclid`, `fbclid`, `ttclid`) ומפתח `ref` של קישורי הפניה `/r/<code>`.
   מבנה ה-jsonb מכיל אותם כמפתחות עתידיים, כך שההרחבה היא שינוי SDK בלבד,
   בלי מיגרציה ובלי שינוי ב-`orders.attribution`.
2. **`orders.attribution` (jsonb, קיים בטיוטת 033):** `beginCheckout` כותב לתוכו
   `{first: {...}, last: {...}}` פעם אחת; לעולם לא מתעדכן אחרי paid. זה נותן
   הכנסה-לפי-ערוץ ישירות על טבלת הכסף, בלי session stitching.
3. **רמת האירוע:** כל אירוע client נושא את ה-`utm` של הדף הנוכחי (envelope 1.1),
   לניתוח התנהגות פר קמפיין גם לפני רכישה.
4. **דוח:** `v_channel_revenue_weekly` (last-touch): הזמנות, GMV, הכנסת פלטפורמה
   פר (שבוע, utm_source, utm_campaign). ייחוס הודעות CRM כבר פתור ב-031
   (`notification_conversions`) ולא מוכפל; ROAS ו-CAPI הם שכבת GROWTH (041) שצורכת
   את אותם שדות, לא צנרת מקבילה.
5. **מודל:** last-touch כברירת מחדל לדוחות; first-touch נשמר באותו jsonb כך
   שמודל משוקלל עתידי לא ידרוש דאטה חדש.

---

## 7. ביצועים: Web Vitals ושאילתות איטיות

### 7.1 איסוף Web Vitals (מיישם את הכרעת PERFORMANCE D-9)

- **RUM ראשי: Vercel Speed Insights** (`@vercel/speed-insights` ב-root layout).
  מקור האמת ל-p75 פר route מול תקציבי PERFORMANCE 4.1. דורש Vercel Pro (ממילא חובה).
- **RUM משני, בבעלותנו:** `useReportWebVitals` (hook של Next) שולח אירוע `web_vital`
  אל `/api/a` לתוך `analytics_events`:

| prop | חובה | ערכים |
|---|---|---|
| `metric` | כן | `LCP` / `CLS` / `INP` / `TTFB` / `FCP` |
| `value` | כן | numeric (ms; CLS יחידה חסרת ממד) |
| `rating` | לא | `good` / `needs-improvement` / `poor` (כפי שמדווח web-vitals) |
| `route` | לא | ה-route template (`/product/[slug]`), לא ה-path המלא, לשליטה ב-cardinality |

- **דגימה:** 25% מהסשנים (הגרלה חד-פעמית בצד לקוח, נשמרת לסשן). p75 יציב לא דורש
  100%, והחיסכון בנפח ישיר. הדגימה קבועה ב-SDK, לא פר אירוע.
- **הסכמה:** אותו gate של שאר אירועי הלקוח (סעיף 3.4). בלי הסכמה יש עדיין את
  Speed Insights (מדידה אגרגטיבית של Vercel, בלי עוגיות).
- הערך המוסף מול Speed Insights: retention של 13 חודשים, פילוח לפי קמפיין/מקור
  (ה-envelope נושא utm), והצלבה מול conversion באותו מחסן.

### 7.2 הכרעת Vercel (סופית)

| מוצר | הכרעה | נימוק |
|---|---|---|
| Vercel Speed Insights | **כן** | RUM ביצועים ראשי; אין לנו תחליף אגרגטיבי בלי הסכמה; כבר הוכרע ב-PERFORMANCE D-9 |
| Vercel Web Analytics | **לא** | כפילות מלאה של אירועי ההתנהגות first-party (page views, referrers), בלי JOIN לכסף, בעלות Pro-metered. סותר את עקרון "מחסן אחד" |

### 7.3 `v_web_vitals_daily` (חדש ב-v3, נוסף לטיוטת 034)

view רגיל על raw (13 חודשים מספיקים לניתוח ביצועים): פר (יום ישראלי, `metric`,
`route`): `samples`, `p75` (percentile_cont), `pct_good`. מסונן `NOT is_bot`.
צריכה: העיון השבועי (5.2) והשוואה מול תקציבי PERFORMANCE 4.1. חריגת p75 מהתקציב
7 ימים רצופים פותחת משימת ביצועים לפני פיצ'רים (הכלל הקיים ב-PERFORMANCE 4.2).

### 7.4 אסטרטגיית שאילתות איטיות

1. **מקור ראשי: `pg_stat_statements`** (זמין ב-Supabase). שגרה חודשית (יחד עם
   `get_advisors`): חמש הכבדות לפי `total_exec_time` + כל שאילתה עם
   `mean_exec_time > 100ms`, ואז reset למדידה נקייה של החודש הבא.
2. **Supabase Query Performance** (Dashboard > Reports) לבדיקה נקודתית אחרי deploy
   או אחרי החלת מיגרציה עם אינדקסים.
3. **ספים מחייבים:** שאילתת דשבורד מעל 200ms p95 = מעבר ל-matview (השער של 5.1);
   שאילתת נתיב לקוח (קטלוג/checkout) מעל 100ms mean = תיקון באותו שבוע
   (אינדקס, `use cache`, או שכתוב).
4. **אין log drain ייעודי לשאילתות בשלב זה:** לוגי Postgres ב-free/Pro נשמרים יום
   אחד; `pg_stat_statements` נותן את אותה תשובה (מצטבר) בלי תשתית. אם יידרש ניתוח
   רגעי, `log_min_duration_statement` מופעל זמנית דרך ה-Dashboard לחקירה בלבד ומכובה.
5. אינדקס שלא נעשה בו שימוש 60 יום נמחק (הכלל הקיים ב-PERFORMANCE 5.2).

---

## 8. אסטרטגיית אגרגציה ולוח רענון

שלוש מדרגות, לפי עלות החישוב מול טריות:

| מדרגה | אובייקטים | טריות | נימוק |
|---|---|---|---|
| טבלת rollup | `analytics_daily` (`fn_rollup_analytics_daily`) | לילי, ניתנת לבנייה מחדש פר יום | שורדת מחיקת partitions; זעירה; לנצח |
| views רגילים | כל ה-`v_*` (בעלים, ספקים, take-rate, liability, repeat, web vitals) | real-time | נפחים קטנים; אינדקסים מספיקים; אפס תחזוקת קונסיסטנטיות |
| materialized views | `mv_cohort_retention_monthly`, `mv_take_rate_monthly` | לילי | סריקות היסטוריה מלאות; בלי RLS ולכן service-role בלבד |

מעבר view -> matview רק בבעיה נמדדת (מעל 200ms, סעיף 5.1), ואז עם unique index
ורענון שעתי CONCURRENTLY אם הדשבורד דורש טריות תוך-יומית.

### לוח רענון (נקבע בזמן החלה, לא בתוך המיגרציות)

**הכרעת בעלים (2026-07-20): חלוקת cron מחייבת. Vercel Cron לכל job ברמת
האפליקציה; pg_cron אך ורק ל-jobs פנימיים ל-DB (SQL טהור, בלי רשת ובלי API
חיצוני): פקיעת קופונים, הזמנות pending תקועות, rollup, matviews, partitions, purges.**

| job | תדירות | מנגנון | למה בצד הזה של הקו |
|---|---|---|---|
| `expire_coupons()` (027) + זיכויי refund_credit של פקיעה | יומי 01:50, לפני ה-rollup | pg_cron | סריקת מצב SQL טהורה |
| ביטול הזמנות pending שעברו `expires_at` | כל 15 דקות | pg_cron | SQL טהור; אחרת מציף את `v_money_alarms` |
| `fn_rollup_analytics_daily()` | לילי 02:10 ישראל | pg_cron | SQL טהור |
| `fn_refresh_analytics_matviews()` | לילי 02:40 ישראל | pg_cron | SQL טהור |
| `fn_ensure_analytics_partitions(2)` + `fn_drop_old_analytics_partitions(13)` | חודשי, 1 לחודש 03:00 | pg_cron | DDL פנימי |
| purge של `coupon_scan_events` (90 יום) / `search_queries` (6 חודשים) | לפי הדומיינים שלהם | pg_cron | SQL טהור |
| `/api/cron/alerts` (קורא `v_money_alarms` + ספים, OBS-13) | כל 15 דקות | Vercel cron | שולח התראות (API חיצוני) |
| `/api/cron/daily-digest` (סעיף 5.4) | יומי 07:00 ישראל (schedules כפולים ב-UTC + guard) | Vercel cron | שולח מייל (API חיצוני) |
| worker של `notifications_outbox`, reconcile מול Cardcom | לפי המסמכים שלהם | Vercel cron | APIs חיצוניים |

הרציונל: pg_cron ב-Supabase לא מחזיק סודות ספקים ולא קורא HTTP; Vercel cron לא
מתחרה ב-sweep תוך-DB בטרנזקציוניות ובזמינות. החלוקה גם שורדת נפילת Vercel עם
מצב כסף תקין (פקיעות וביטולי pending ממשיכים לרוץ ב-DB). תזמון pg_cron נעשה
בזמן החלה (בלוק `cron.schedule` אחד פר job), לעולם לא בתוך המיגרציות הממוספרות;
jobs של Vercel חיים ב-`vercel.json` עם handlers תחת `/api/cron/*` מוגני `CRON_SECRET`.

---

## 9. איכות דאטה

1. **דה-דופ:** `event_id` נוצר פעם אחת אצל השולח; retry שולח את אותו זוג
   (event_id, occurred_at); `ON CONFLICT DO NOTHING` על ה-PK בולע כפילויות.
2. **בוטים:** סימון בזמן ingest (`is_bot` לפי regex על user_agent). שומרים ולא
   זורקים (לזיהוי scraping), אבל כל rollup וכל view מסננים `NOT is_bot`.
3. **תנועת צוות:** ה-rollup מסנן משתמשים עם role של admin / super_admin /
   content_uploader. הבעלים שבודק את האתר שלו עשר פעמים ביום הוא זיהום המדידה
   הגדול ביותר בעסק קטן.
4. **אזור זמן:** אחסון UTC בלבד; בקיטה אך ורק דרך `fn_il_date`. ה-partitions חודשי
   UTC (גבול טכני), הדוחות ימי ישראל (גבול עסקי); ה-rollup מתרגם.
5. **שעון לקוח:** `occurred_at` עתידי מעל 5 דקות מוצמד ל-now(); ישן מ-7 ימים נזרק.
6. **בדיקת שפיות מובנית:** `v_money_alarms` כוללת `analytics_default_partition_rows`
   (ה-default partition חייב להיות ריק) ו-drift של הארנק. תקלות איכות דאטה מופיעות
   באותו מקום כמו תקלות כסף.

---

## 10. מוכנות לאפליקציות עתידיות: `source_app` (חדש ב-v3)

ה-superapp (MOBILE-SUPERAPP) מתכנן ורטיקלים נוספים (משלוחים, הסעות). כדי שלא
תידרש מיגרציית סכימה על טבלה של מיליוני שורות ביום שהם מגיעים:

1. **עמודה חדשה בטיוטת 033:** `analytics_events.source_app text NOT NULL DEFAULT 'shop'`.
   ה-ingest מוסיף אותה ל-whitelist: בשלב זה רק `shop` מתקבל; ערך אחר נופל ל-`shop`.
   הוספת ורטיקל = הרחבת ה-whitelist בפונקציה (CREATE OR REPLACE), בלי נגיעה בטבלה.
2. **`analytics_daily`:** `source_app` נכנס למפתח
   (PK: `day_il, source_app, event_name, source`), כדי שהאגרגט ההיסטורי יהיה מפולח
   מהיום הראשון. עם ורטיקל אחד זו עמודה קבועה שאינה מוסיפה שורות.
3. **`source` נשאר ממד הפלטפורמה** (`web` / `pwa` / `server`, עתידי `mobile`);
   `source_app` הוא ממד המוצר. שני צירים שונים בכוונה: אפליקציית delivery ב-web
   ואפליקציית shop ב-mobile הם ארבעה תאים שונים.
4. **שמות אירועים נשארים גנריים** (`page_view`, `add_to_cart`): הוורטיקל הוא ממד,
   לא שם. אירוע ייחודי לוורטיקל (למשל `ride_requested`) נרשם ב-registry ב-INSERT
   רגיל ביום שצריך, בלי מיגרציה.
5. **כסף של ורטיקלים חדשים** ימשיך באותו דפוס: טבלת אמת פר דומיין, אירוע derived
   ב-registry, ו-views. אין שינוי נוסף בסכימת האירועים.

---

## 11. דלתא לטיוטות המיגרציות (מה משתנה לפני החלה)

שתי הטיוטות לא הוחלו, ולכן העריכות נעשות בתוכן. אין מיגרציה חדשה.

### 11.1 עריכות בטיוטת `033_analytics.sql`

1. `analytics_events`: עמודת `source_app text NOT NULL DEFAULT 'shop'` (סעיף 10)
   + ולידציה ב-`fn_ingest_analytics_events`.
2. `analytics_daily`: הוספת `source_app` לעמודות ול-PK; עדכון
   `fn_rollup_analytics_daily` בהתאם.
3. seed של ה-registry: שני אירועי client חדשים:
   `checkout_step` (`required_props: ["step"]`) ו-`web_vital`
   (`required_props: ["metric","value"]`).
4. טבלה חדשה `analytics_identity_links` (סעיף 2.2): PK
   `(anonymous_id, user_id)`, `linked_at`, RLS (admin read, service write),
   אינדקס על `user_id` לטובת job המחיקה של 029.

### 11.2 עריכות בטיוטת `034_analytics_bi.sql`

1. view חדש `v_repeat_purchase_monthly` (סעיף 4.3).
2. view חדש `v_web_vitals_daily` (סעיף 7.3).
3. הרחבת `v_funnel_daily` בעמודת `checkout_steps` (סעיף 4.4). ההגדרה המקורית
   ב-033; העדכון נעשה שם (CREATE OR REPLACE באותה טיוטה).

### 11.3 מה נשאר קוד אפליקציה (לא SQL, לא במיגרציות)

SDK צד לקוח (batch, sendBeacon, דגימת web vitals, עוגיות סשן וייחוס), route
`/api/a`, באנר הסכמה, כתיבת `orders.attribution` + פליטת `begin_checkout` +
כתיבת `analytics_identity_links` בתוך `beginCheckout` וב-callback ההתחברות,
מסכי הדשבורד (אדמין + ספק), route הדייג'סט, `useReportWebVitals`, תזמון crons.

### 11.4 סדר החלה

026 -> 027 -> ... -> 033 -> 034 (033 דורשת רק 026+027; 034 דורשת 026+027+033;
028/030 אופציונליות ומזוהות דינמית). רק דרך Supabase MCP `apply_migration`
(לעולם לא `db push`); אחרי החלה `generate_typescript_types`.

---

## 12. סיכום הכרעות v3 (בנוסף להכרעות v2 שנשארות בתוקף)

1. **`source_app` נכנס עכשיו** לטיוטת 033 (עמודה + rollup + ingest whitelist),
   כי הוספתו אחרי החלה = מיגרציה על טבלה מפורקת חיה. `source` = פלטפורמה,
   `source_app` = מוצר.
2. **session stitching בשלוש שכפות:** עוגיית `anonymous_id` יציבה + טבלת
   `analytics_identity_links` הנכתבת ב-login וב-beginCheckout + שאילתות stitched
   אד-הוק בלבד. משפך user-level קבוע נדחה לטריגר פרסום בתשלום; הדאטה נאסף מהיום הראשון.
3. **דשבורד אדמין מ-views בזמן אמת; אין matview שעתי עכשיו.** שער מוגדר: שאילתה
   מעל 200ms p95 הופכת ל-matview עם רענון שעתי CONCURRENTLY. שני ה-matviews
   ההיסטוריים נשארים ליליים 02:40.
4. **דייג'סט מייל יומי 07:00 ישראל לאדמין** (הכרעת בעלים 2026-07-20) דרך
   `/api/cron/daily-digest` (Vercel cron כפול ב-UTC + guard שעה ישראלית +
   idempotency פר יום), ממוזג עם דייג'סט ה-SEV3 של OBS-15; שלב A ב-Resend ישיר,
   שלב B דרך outbox. כל מספר מול baseline.
5. **Web Vitals בשני מסלולים:** Speed Insights ראשי (הכרעת D-9), `web_vital`
   first-party משני בדגימת 25% ובאותו gate הסכמה; `v_web_vitals_daily` לעיון השבועי.
6. **Vercel Web Analytics: לא.** Speed Insights: כן. אין כפילות התנהגות מחוץ למחסן.
7. **שאילתות איטיות:** `pg_stat_statements` חודשי + advisors; ספים: 200ms דשבורד,
   100ms נתיב לקוח; בלי log drain ייעודי לשאילתות.
8. **retention raw: 13 חודשים** (12 המבוקשים + חודש חפיפת YoY); אגרגטים לנצח.
9. **מדדים חדשים בהגדרה אחת:** `v_repeat_purchase_monthly` (repeat rate),
   `checkout_step` במשפך. הכנסת ספקים מוגדרת: `supplier_due_ils` (physical) +
   `collect_amount_ils` במימוש (קופונים).
10. **הדלתא נכנסת לטיוטות 033/034 עצמן**, לא למיגרציה חדשה (הן טרם הוחלו; 042 תפוס).
11. **ייחוס = UTM בלבד** (הכרעת בעלים 2026-07-20): עוגיית 30 יום עם `utm_*`
    first/last בלבד; referrer, click IDs ו-`ref` נדחים לפרסום בתשלום; ההרחבה
    היא שינוי SDK בלי מיגרציה.
12. **חלוקת cron** (הכרעת בעלים 2026-07-20): Vercel Cron לכל job אפליקטיבי
    (מיילים, התראות, workers, reconcile); pg_cron רק ל-SQL פנימי (פקיעת קופונים,
    ביטול pending תקועות, rollup, matviews, partitions, purges).

---

## 13. שאלות פתוחות

1. **נוסח באנר ההסכמה** ומעמדו מול הנחיות הרשות להגנת הפרטיות אחרי תיקון 13:
   ייעוץ משפטי לפני production (יחד עם סבב חוק הספאם של 031). האם `web_vital`
   יכול להיחשב טלמטריה תפעולית הפטורה מהסכמה (ואז נאסף גם בלי opt-in), או
   שנשאר תחת ה-gate כפי שהוכרע כאן שמרנית.
2. **איחוד מנועי הסליקה לספקים** (`supplier_payouts` מ-026 מול `payout_statements`
   מ-027): ה-BI בנוי על `payout_statements`; אם ההכרעה תתהפך, `v_supplier_payouts`
   ו-`supplier_payout` יוסבו באותה מיגרציה.
3. **ספק שירות המייל לדייג'סט בשלב A:** Resend הונח כאן (עקבי עם 031), אבל טרם
   נפתח חשבון; אם ייבחר ספק אחר, רק ה-route משתנה.
4. **דגימת `web_vital` (25%)**: לאשרר אחרי חודש ראשון בפרודקשן מול הנפח בפועל
   (יעד: אירועי web_vital לא עולים על ~20% מסך האירועים).
5. **מודל ייחוס משוקלל** (first/last משולב): נשאר last-touch עד שיש פרסום בתשלום;
   הדאטה (first-touch) כבר נשמר.
6. **חלון הייחוס (30 יום):** מספיק לקטגוריית קנייה אימפולסיבית? להחליט מול דאטה
   אמיתי של median days from first visit to purchase אחרי רבעון.
