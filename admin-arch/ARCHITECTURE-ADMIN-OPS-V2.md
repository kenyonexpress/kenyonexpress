# ארכיטקטורת תפעול אדמין V2 (Admin Operations)

מסמך הכרעות. תאריך: 2026-07-17. ענף: `phase5/homepage`.

מעמד המסמך: מסמך הדומיין המחייב להעמקה התפעולית של פאנל האדמין הקיים
(8 עמודים). הוא בנוי מעל ההכרעות הקיימות ואינו סותר אותן. בכל סתירה:

| תחום | המסמך הגובר |
|---|---|
| מכונת המצבים המשפטית (ביטולים, החזרים, חשבוניות) | `docs/ARCHITECTURE-LEGAL-COMPLIANCE.md` (037) |
| snapshot כספי, ארנק, תשלומים | `docs/ARCHITECTURE-COMMERCE.md` (026) |
| ספקים, מימוש, payout | `docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md` (027) |
| חוזי API, רמות הרשאה, envelope | `docs/ARCHITECTURE-API-CONTRACTS.md` |
| אבטחה, RLS, security_events | `docs/ARCHITECTURE-SECURITY.md` (035, גובר על הכול) |
| ‏views אנליטיים | `docs/ARCHITECTURE-ANALYTICS-BI.md` (033/034) |
| התראות ומוניטורינג | `obs-arch/ARCHITECTURE-OBSERVABILITY.md` (040) |
| סוכני AI ותורי אישור | `docs/ARCHITECTURE-AI-AGENTS-RUNTIME.md` (039) |
| צמיחה, ROAS, ‏CRM | `docs/ARCHITECTURE-GROWTH-SEO.md` (041) |
| סדר מיגרציות קנוני | `docs/MASTER-ARCHITECTURE.md` (v3) |

מה שמסמך זה מוסיף: ביקורת פערים מלאה של האדמין הקיים מול כל 16
הדומיינים, מפרט הקוקפיט היומי, קונסולת הביטולים, תפעול ה-payout,
תפעול התוכן (כולל CSV), מטריצת הרשאות מלאה, ומפרט מיגרציה עתידית
`042_admin_ops.sql` (לפי משמעת המספור R31: ‏036 vendors, ‏037 משפטי,
‏038 ביצועים, ‏039 סוכנים, ‏040 observability, ‏041 growth, והפנוי
הבא הוא 042). המסמך אינו משנה קבצים ב-`supabase/`, ‏`src/` או `docs/`.

---

## 0. עקרונות על

1. **האדמין הוא UI דק מעל הכרעות קיימות.** כל פעולה כספית עוברת דרך
   ה-RPCs וה-server actions שכבר הוכרעו (I1-I12, ‏D4, ‏G3). האדמין
   לא ממציא מסלול כסף חדש לעולם.
2. **אין כתיבה בלי audit.** כל mutation באדמין מייצרת שורת `audit_log`
   (טריגר DB) והפעולות הרגישות גם `security_events`. פעולה שאין לה
   טריגר audit לא נבנית עד שיש.
3. **הרשאות בשלוש שכבות תמיד:** ‏guard בשכבת ה-layout, בדיקה בתוך
   ה-server action (`requireAdminSession`/`requireStaffSession`),
   ‏ו-RLS/בדיקת `is_admin()` בתוך ה-RPC. ‏UI שמסתיר כפתור אינו הגנה.
4. **‏`/admin/*` דינמי מלא, אפס cache** (הכרעת הביצועים). אדמין רואה
   תמיד אמת עדכנית. קוד האדמין נשאר מחוץ ל-bundle של החנות
   (code-split ברמת route group).
5. **עברית, RTL, בלי אופציות.** כל מסך מציג ערכי enum במיפוי עברי
   אחד (קובץ `src/lib/admin/labels.ts` יחיד), וכל fallback של ערך
   לא מוכר מציג את הערך הגולמי, לא שגיאה (כלל 5.3 של החוזים).
6. **מספרים רק מה-ledger ומה-views.** אף מסך אדמין לא מחשב כסף
   ב-JS מנתוני שורות; הכול נקרא מ-`v_*` של 033/034 או מעמודות
   ה-snapshot. ‏GMV, ‏cash-in והכנסת פלטפורמה לא מתערבבים לעולם.

---

## 1. ביקורת פערים (Gap Audit)

### 1.1 מצב קיים: 8 עמודים

| עמוד | מצב | פסק דין |
|---|---|---|
| `/admin/dashboard` | 3 ספירות גולמיות (products, orders, coupon_deals) בלי כסף, בלי מגמות | נכתב מחדש כקוקפיט (סעיף 2) |
| `/admin/products` | היחיד עם pagination אמיתי (20); טפסים מלאים כולל וריאציות ותמונות | נשאר; מתוקן לפי G-6 (‏sold_out, ‏service, ‏platform_percent, ‏supplier_id) + תזמון (סעיף 5.3) |
| `/admin/categories` | עובד; שני מסלולי UI מקבילים (דיאלוג + עמודים) | נשאר מסלול הדיאלוג בלבד; העמודים העצמאיים נמחקים |
| `/admin/coupons` | עובד אבל מחיר הפלטפורמה מקודד קשיח `original_price * 0.1` בניגוד ל-MASTER 1.40 (שדה חופשי) | תיקון ל-`coupon_price` חופשי + ולידציית מינימום 4 חודשים (LEG-05) |
| `/admin/suppliers` | כותב ל-`vendors` הישנה עם `commission_rate` ברירת מחדל 90 (הפיצול ההפוך, G-2) | קפוא עד 036; נכתב מחדש מול `suppliers` לפי I5 |
| `/admin/orders` | ‏enum מת מ-001 (‏processing/shipped/delivered, ‏G-1), ‏limit 100 בלי pagination | נכתב מחדש לפי I7 + ‏cursor pagination |
| `/admin/users` | עובד; בלי pagination, בלי מסך משתמש | נשאר + נוסף `/admin/users/[id]` (משתמש 360) |
| `/admin/audit-log` | **שבור לחלוטין**: שואל את `admin_audit_log` שנמחקה ב-025; קורא `user_id` במקום `actor_id`; תוויות `INSERT/UPDATE/DELETE` מול enum `created/updated/deleted` | נכתב מחדש מול `audit_log` עם פילטרים (סעיף 1.2) |

קוד יתום שנמחק (הוכרע): `ProductBulkClient.tsx` (מוחלף ב-bulk אמיתי
בסעיף 5), ‏`VendorDetailClient.tsx` (מוחלף במסך ספק 036),
‏`CategoryTree.tsx` + ‏`CategoryDialog.tsx` והפעולה `deleteCategory`
(מחיקה קשיחה; נשארת רק מחיקה רכה). ‏`CouponForm.tsx` (alias ריק)
נמחק, ‏import ישיר של `CouponDealForm`.

### 1.2 תיקוני חובה בקיים (לפני מסכים חדשים)

| # | תיקון | מקור |
|---|---|---|
| F1 | ‏layout: ‏`requireAdminSession` מוחלף ב-`requireStaffSession` + הרשאה פר-סקשן (סעיף 6); בלי זה `content_uploader` נעול מחוץ לפאנל שהוא אמור לעבוד בו | ביקורת קוד |
| F2 | ‏`admin/orders.ts` נכתב מחדש מול `order_status` האמיתי; המעבר הידני היחיד: `pending -> cancelled` עם reason; ‏`refunded` נדחה עם הפניה לקונסולת ההחזרים | G-1, ‏I7 |
| F3 | עמוד audit-log מול `audit_log`: עמודות actor_id/actor_role/action(enum)/entity_type/entity_id/changes; פילטרים: actor, entity_type, action, טווח תאריכים; ‏cursor pagination | 011/025 |
| F4 | ‏pagination בכל הרשימות (‏cursor לפי API-6): orders, suppliers, users, coupons, audit-log | API-6 |
| F5 | ‏`src/types/database.ts`: הסרת טיפוס `admin_audit_log` והוספת `audit_log` | ביקורת קוד |
| F6 | כל ה-actions החדשים ב-envelope ‏`ActionResult<T>`; הקיימים מוסבים בהזדמנות (G-8) | API-2 |

### 1.3 מסכים חסרים: הרשימה המלאה

כל שורה: מסך, המסמך שמחייב אותו, התשתית שכבר קיימת (טבלה/view/RPC).

**תפעול יומי:**

| מסך | route | מחויב על ידי | תשתית |
|---|---|---|---|
| קוקפיט בוקר | `/admin/dashboard` (rewrite) | ‏ANALYTICS 6.1, ‏OBS 4.7 | `v_owner_dashboard`, ‏`v_money_alarms`, ‏`v_admin_pending_queues` (042) |
| קונסולת ביטולים והחזרים | `/admin/refunds`, ‏`/admin/refunds/[id]` | ‏LEGAL 2.1-2.6 (LEG-01 קריטי) | `cancellation_requests` (037), ‏D4 ‏`refundPayment`, ‏`fn_request_cancellation` (037) |
| תור אסקלציות (כולל refund_intake מהסוכנים) | `/admin/escalations` | ‏AI-RUNTIME (‏agent_escalations) | `agent_escalations` (028) |

**כספים:**

| מסך | route | מחויב על ידי | תשתית |
|---|---|---|---|
| תור אישורי payout + הפקת דוחות | `/admin/payouts`, ‏`/admin/payouts/[id]` | ‏SUPPLIER 5, ‏I8/I9 | `payout_statements`, ‏4 ה-RPCs של 027 |
| התאמות סליקה (Cardcom) | `/admin/reconciliation` | ‏SUPPLIER 5.4, ‏I10, ‏A7 | `cardcom_settlements(+txns)`, ‏`reconcile_cardcom_settlement` |
| דוח התחייבות קופונים וארנק | `/admin/liability` | ‏ANALYTICS 4.2, ‏LEGAL 1.2 | `v_coupon_expiry_liability`, ‏`v_coupon_funnel_monthly`, ‏`v_wallet_liability`, ‏`v_wallet_ledger_drift` |
| ארנק: חיפוש, היסטוריה, זיכוי ידני | `/admin/wallet` | ‏COMMERCE, ‏G3 | `wallet_accounts`, ‏`wallet_transactions`, ‏`adminAdjustWallet` |
| הוצאות פרסום (CSV) | `/admin/ads` | ‏GROWTH 5.5 | `ad_spend_daily` (041), ‏`v_roas_weekly` |

**ספקים:**

| מסך | route | מחויב על ידי | תשתית |
|---|---|---|---|
| שער אישור ספקים (בקשות הצטרפות) | `/admin/suppliers/applications` | ‏SUPPLIER 1, ‏I4 | `supplier_applications`, ‏`approve/reject_supplier_application` |
| ספק 360 (חדש, מול `suppliers`) | `/admin/suppliers/[id]` (rewrite) | ‏I5, ‏036 | `suppliers`, ‏`supplier_members`, ‏`supplier_bank_accounts`, ‏`v_supplier_leaderboard_30d` |
| מחלוקות ספקים | `/admin/disputes` | ‏SUPPLIER 5.5, ‏I11 | `supplier_disputes`, ‏`resolveSupplierDispute` |

**סיכון ואבטחה:**

| מסך | route | מחויב על ידי | תשתית |
|---|---|---|---|
| תור בדיקת fraud | `/admin/fraud` | ‏AI-AGENTS (‏fraud_watch) | `agent_flags` (028): ‏open -> reviewing -> confirmed/dismissed |
| צופה אירועי אבטחה | `/admin/security` | ‏SECURITY 7, ‏OBS 1.6 | `security_events` (035, admin-select) |

**קטלוג ותוכן:**

| מסך | route | מחויב על ידי | תשתית |
|---|---|---|---|
| ייבוא תוכן (CSV + ‏curation של WP) | `/admin/import` | סעיף 5 כאן; ‏WP-MIGRATION 4 | `catalog_import_batches/rows` (042), ‏`wp_import.*` (032, ‏admin-read) |
| מנהל redirects ודוח 404 | `/admin/redirects` | ‏CATALOG (030), ‏GROWTH 2.2.10 | `seo_redirects` (‏hits, ‏last_hit_at) |
| חיפוש: מילים נרדפות ואיכות | `/admin/search` | ‏CATALOG C5 | `search_synonyms`, ‏`v_search_quality_daily` |
| אוספים (collections) וכללים | `/admin/collections` | ‏CATALOG C5 | `categories.kind='collection'`, ‏`rule` jsonb |
| ניהול hero | `/admin/hero` | קיימת טבלה בלי מסך | `hero_slides` (017) |
| מאפיינים (attributes) | `/admin/attributes` | ‏CATALOG C5 | `attribute_definitions`, ‏`category_attributes` |

**שיווק והתראות:**

| מסך | route | מחויב על ידי | תשתית |
|---|---|---|---|
| תבניות התראות (גרסאות + הפעלה) | `/admin/notifications` | ‏I12, ‏NOTIFICATIONS 3 | `notification_templates`, ‏`fn_activate_template` |
| בריאות outbox + ‏dead-letter | `/admin/notifications` (טאב) | ‏NOTIFICATIONS, ‏A10 | `notifications_outbox`, ‏`fn_requeue_dead_notification`, ‏`v_notification_kpis` |

**אנליטיקה:**

| מסך | route | מחויב על ידי | תשתית |
|---|---|---|---|
| עיון שבועי (טאבים: משפך, קוהורטות, ערוצים, take-rate, ‏ROAS, ‏CRM) | `/admin/analytics` | ‏ANALYTICS 6.2, ‏GROWTH 6 | `v_funnel_daily`, ‏`mv_cohort_retention_monthly`, ‏`v_channel_revenue_weekly`, ‏`v_take_rate_monthly`, ‏`v_roas_weekly` (041), ‏`v_crm_segments` (041), ‏`v_journey_revenue` |

**מערכת וסוכנים:**

| מסך | route | מחויב על ידי | תשתית |
|---|---|---|---|
| משתמש 360 | `/admin/users/[id]` | ‏ACCOUNT, ‏LEGAL 5 | ‏profiles, ‏orders, ‏wallet, ‏coupon_codes, ‏consent_events, ‏account_deletion_requests |
| סוכני AI: ריצות, עלויות, kill switch | `/admin/agents` | ‏AI-RUNTIME 4 | `agent_runs`, ‏`agent_run_steps`, ‏`v_agent_costs_daily`, ‏`agent_prompts.is_active` |
| אישור טיוטות ספקים | `/admin/agents/drafts` | ‏AI (‏supplier_ops) | `listing_drafts`: ‏pending_admin -> approved/rejected |
| אישור העשרות קטלוג | `/admin/agents/enrichment` | ‏AI-RUNTIME (039) | `enrichment_suggestions` (039) |

סך הכול: 8 עמודים קיימים (מהם 4 דורשים שכתוב) + 24 מסכים חסרים.

### 1.4 מפת ניווט יעד (Sidebar)

שמונה סקשנים בסדר קבוע. פריט מוצג רק אם לתפקיד יש קריאה בו (סעיף 6):

```
דשבורד      -> /admin/dashboard
תפעול       -> orders, refunds, escalations
כספים       -> payouts, reconciliation, liability, wallet, ads
קטלוג       -> products, categories, collections, attributes, coupons, hero, import, redirects, search
ספקים       -> suppliers, suppliers/applications, disputes
סיכון       -> fraud, security, audit-log
שיווק       -> notifications, analytics
מערכת       -> users, agents
```

תג ספירה אדום על "תפעול", "כספים", "ספקים", "סיכון" מוזן מ-
`v_admin_pending_queues` (סעיף 7.3), רענון בכל ניווט (אין polling).

---

## 2. הקוקפיט היומי: `/admin/dashboard`

המסך האחד שהבעלים פותח כל בוקר. עיקרון: אפס קליקים כדי לדעת אם
הלילה קרה משהו רע, קליק אחד לכל תור שדורש טיפול. כל הנתונים
נקראים ב-RSC אחד (queries מקביליים), בלי client fetching.

### 2.1 פריסה (מלמעלה למטה)

**שורה 0: פס אזעקות (מוצג רק כשיש).** ‏`select * from v_money_alarms`.
כל שורה = כרטיס אדום עם שם האזעקה, המספר, וקישור למסך המטפל:

| אזעקה | קישור |
|---|---|
| `failed_payments_24h` | `/admin/orders?status=pending&payment=failed` |
| `invalid_webhook_signatures_24h` | `/admin/security?event_type=webhook_signature_invalid` |
| `payments_stuck_redirected_10m` | `/admin/orders?stuck=1` |
| `pending_orders_past_expiry_1h` | `/admin/orders?status=pending&expired=1` |
| `wallet_ledger_drift_accounts` | `/admin/liability#drift` (מקפיא זיכויים ידניים, ‏RB-8) |
| `analytics_default_partition_rows` | ‏tooltip טכני בלבד |

**שורה 1: שמונה מספרי היום** (מקור: `v_owner_dashboard`, שורה אחת):

1. הזמנות היום (`orders_today`)
2. הכנסת פלטפורמה היום (`platform_revenue_today_ils`) + השוואה לאתמול
   (`platform_revenue_yesterday_ils`) ולממוצע 7 ימים (`platform_revenue_7d_avg_ils`)
3. ‏cash-in היום (`charged_on_site_today_ils`)
4. ‏GMV היום (`gmv_today_ils`)
5. מימושים היום (`coupons_scanned_today`) + כשלי סריקה (`scan_failures_today`)
6. לקוחות חדשים (`new_customers_today`)
7. החזרים היום (`refunds_today_ils`)
8. ‏cashback שחולק היום (`cashback_granted_today_ils`)

פיצול ההכנסה (פלטפורמה מול ספקים) מוצג כגרף עמודות 7 ימים מ-
`v_revenue_daily`: ‏`platform_revenue_ils` מול `supplier_due_ils`
פר יום. שלושת המספרים (GMV, ‏cash-in, ‏revenue) לעולם לא מסוכמים
יחד (עיקרון 0.6).

**שורה 2: תורי אישור ממתינים.** כרטיס פר תור מ-`v_admin_pending_queues`
(סעיף 7.3), עם ספירה, גיל הפריט הישן ביותר, וקישור:
ביטולים ממתינים, ‏payouts לאישור, בקשות ספקים, דגלי fraud פתוחים,
אסקלציות פתוחות, טיוטות ספקים לאישור, מחלוקות פתוחות, שורות סליקה
לא מותאמות, הודעות dead. כרטיס עם פריט מעל SLA (טבלת 7.3) נצבע אדום.

**שורה 3: התחייבויות פתוחות.** ‏`coupons_outstanding` +
‏`coupons_outstanding_platform_paid_ils` + ‏`coupons_outstanding_collect_ils`
‏+ ‏`wallet_liability_ils` + ‏`scan_rate_30d_pct`. קישור ל-`/admin/liability`.

**שורה 4: פיד אירועים ואנומליות (24 שעות).** שני טורים:

1. **אירועי אבטחה**: ‏`security_events` עם `severity <> 'info'`,
   ‏20 אחרונים. קריטי = שורה אדומה.
2. **אנומליות עליונות**: ‏`agent_flags` בסטטוס open בסדר
   ‏severity (high קודם) ואז created_at; ‏5 עליונות עם `summary_he`
   וכפתור מעבר ל-`/admin/fraud`.

### 2.2 כללי מימוש

1. ‏guard: ‏admin ומעלה. ‏support (עתידי) רואה הכול חוץ משורה 1
   (מספרי הכסף מוחלפים בכרטיס "אין הרשאה").
2. אפס חישובי כסף בצד הלקוח; המסך הוא הצגת views בלבד.
3. ‏`export const dynamic = 'force-dynamic'` (ירושה מהקבוצה).
4. ‏`StatsCard` הקיים נשאר הרכיב; ‏prop ה-trend מנוצל סוף סוף
   (היום מול ממוצע 7 ימים).
5. הדשבורד הזה הוא הקריאה היומית היחידה (הכרעת 033: אין דשבורד
   שלישי); העיון השבועי חי ב-`/admin/analytics`.

---

## 3. קונסולת ביטולים והחזרים: `/admin/refunds`

מימוש מלא של מכונת המצבים המשפטית (LEGAL 2.1-2.6) מעל
`cancellation_requests` (037) ו-D4 ‏`refundPayment`. זה המסך שסוגר
את LEG-01 (הפער הקריטי).

### 3.1 מסך הרשימה

טאבים לפי `cancellation_status`: ‏submitted (ברירת מחדל) / approved /
rejected / refunded / closed. עמודות: מספר הזמנה, לקוח, פריט, סוג
(coupon/physical), ‏reason, סכום בסיס, גיל הבקשה, מקור (אזור אישי /
‏`/cancel` ציבורי / אסקלציית סוכן). **שעון SLA:** בקשה approved שלא
refunded בתוך 10 ימים נצבעת אדום (ה-cron של 037 גם שולח התראה;
החוק דורש החזר בתוך 14 יום מהודעת הביטול).

חיפוש הזמנה חופשי בראש המסך: מספר הזמנה / אימייל / טלפון / 8 ספרות
של קופון. תוצאה מובילה למסך ההזמנה עם כפתור "פתח בקשת ביטול" פר
פריט (זה המסלול כשהלקוח פונה בטלפון/מייל במקום בטופס).

### 3.2 מסך בקשה: `/admin/refunds/[id]`

ארבעה בלוקים קבועים:

**בלוק 1: הקשר.** ההזמנה המלאה (פריטים, snapshot כספי מ-026:
‏`charged_on_site_ils`, ‏`platform_fee_ils`, ‏`supplier_due_ils`,
‏`balance_due_at_business_ils`), הלקוח, התשלומים (כולל `wallet_applied_ils`),
סטטוס הקופון אם רלוונטי, והיסטוריית בקשות קודמות של אותו לקוח
(דגל צהוב אם 3+ בקשות ב-30 יום: זה בדיוק detector ‏`refund_abuse`).

**בלוק 2: בדיקת הזכאות האוטומטית.** מחושבת ב-server action קריאה
בלבד (`getRefundEligibility(order_item_id, reason)`), ומוצגת
כצ'קליסט ירוק/אדום. הכללים, כפי שהוכרעו במסמך המשפטי:

| בדיקה | כלל |
|---|---|
| חלון חרטה (remorse), קופון | עד 14 יום מ-`orders.paid_at`; אם לדיל מועד שירות קבוע: לפחות 2 ימי עסקים לפני המועד |
| חלון חרטה, פיזי | עד 14 יום מ-`order_items.delivered_at` |
| פגם / אי-התאמה / אי-אספקה | אין מגבלת 14 יום; חובת בדיקת אדמין; דמי ביטול 0 |
| פטור מביטול | `products.cancellation_exempt` (037): פסידים, תוכן דיגיטלי, ייצור אישי, אריזה שנפתחה, אירוח/פנאי בתוך 7 ימים שאינם ימי מנוחה לפני השירות. חסימה עם `exempt_reason` מוצג |
| מצב הקופון | ‏issued: זכאי. ‏used: אין ביטול צרכני, הפניה למסלול מחלוקת (3.5). ‏expired: הוסבר שהזיכוי האוטומטי כבר בוצע (LEG-04). ‏refunded: כפילות, נדחה |
| דמי ביטול | ‏remorse: ‏`min(5% * refund_base, 100)` ש"ח; כל סיבה אחרת: 0. ‏`refund_base = charged_on_site_ils` |

הצ'קליסט הוא תמיכת החלטה; המחייב הוא `fn_request_cancellation` (037)
שאוכף את אותם כללים ב-DB. אדמין יכול לאשר בקשה שנכשלה בבדיקת
remorse רק במסלול goodwill (בלוק 4), לעולם לא לעקוף את הפונקציה.

**בלוק 3: תמיכת החלטה ארנק מול כרטיס.** מציג את חלוקת ההחזר
המחושבת לפי LEG-10, לקריאה בלבד:

1. חלק הכרטיס חוזר לכרטיס (Cardcom refund על העסקה המקורית). ברירת
   מחדל שאינה ניתנת לעקיפה.
2. חלק הארנק שהוחל על ההזמנה (`wallet_applied_ils`) חוzר לארנק
   כ-`refund_credit`, בלי פקיעה מוקדמת מהמקור.
3. סדר הפיצול בהחזר חלקי: קודם הכרטיס, ורק היתרה מעל מה שנגבה
   בכרטיס חוזרת לארנק.
4. "החזר לארנק במקום לכרטיס" מותר רק כשהלקוח בחר זאת אקטיבית;
   הצ'קבוקס באדמין דורש הזנת אסמכתה (ציטוט פנייה/מייל) שנשמרת
   ב-`cancellation_requests.note` וב-audit. ברירת המחדל תמיד כרטיס.
5. פיצוי goodwill מעבר להחזר: ארנק בלבד, דרך `adminAdjustWallet`
   (‏reason ‏`manual_adjust`), לעולם לא דרך ה-refund עצמו.

**בלוק 4: ביצוע.** שלושה כפתורים בלבד:

| פעולה | מי | מה קורה |
|---|---|---|
| אישור וביצוע החזר | ‏admin + ‏`requireRecentAuth(15)` | ‏`fn_approve_cancellation` (037): קופון ‏issued -> refunded, חישוב fee, ואז D4 ‏`refundPayment` עם ‏`ref:<payment_id>:<n>`; חשבונית זיכוי (credit note) נוצרת באותה טרנזקציה (LEG-02); ההודעה ללקוח דרך ה-outbox |
| דחייה | ‏admin | ‏status -> rejected + ‏reason חובה (מוצג ללקוח) |
| הפניה למחלוקת ספק | ‏admin | יצירת `supplier_disputes` בקטגוריה `consumer_complaint` וקישור הבקשה (3.5) |

### 3.3 שרשרת ה-audit

כל בקשה מציגה בתחתית את שרשרת האירועים המלאה: יצירה (מי, מאיפה),
בדיקות זכאות שנשמרו, החלטה (מי, מתי, reason), שורת ה-payments של
ה-refund, תנועות הארנק, החשבונית/זיכוי, וההודעות שנשלחו. המקור:
‏`audit_log` + ‏`payments` + ‏`wallet_transactions` + ‏`invoices` (037)
מסוננים לפי entity. אין עריכה של שום דבר בהיסטוריה.

### 3.4 החזרים בלי בקשת ביטול

‏refund יזום (למשל תקלה תפעולית רוחבית) נשאר אפשרי ישירות ממסך
ההזמנה, אבל תמיד יוצר `cancellation_requests` עם ‏reason מנומק
(‏`not_delivered` או פגם) כדי שלא יהיו החזרים מחוץ לרישום. אין מסלול
refund בלי שורת בקשה.

### 3.5 קופון שמומש ("קיבלתי שירות גרוע")

‏used = השירות נצרך; אין זכות ביטול סטטוטורית דרך הפלטפורמה.
המסלול: מחלוקת ספק `consumer_complaint`. פסיקת אדמין יכולה לחייב
את הספק בשורת adjustment שלילית בדוח הבא ולזכות את הלקוח (ארנק,
או כרטיס במקרה חמור). המסך של זה הוא `/admin/disputes`, והקישור
מהקונסולה יוצר את המחלוקת עם ההקשר המלא.

---

## 4. תפעול תשלומים לספקים: `/admin/payouts`

מעטפת UI מלאה ל-4 ה-RPCs של 027. אף שקל לא זז מחוץ להן.

### 4.1 מחזור החיים על המסך

טאבים לפי `payout_status`: ‏draft / pending_approval (ברירת מחדל) /
approved / paid / cancelled. עמודות: ‏`statement_number` (‏PS-######),
ספק, תקופה, ‏`total_gross_ils`, ‏`total_platform_fee_ils`,
‏`total_payout_ils`, מחלוקות פתוחות (חוסם), גיל.

### 4.2 הפקת דוחות

1. **אוטומטי (הוכרע):** ‏cron חודשי ב-3 לחודש (‏route חדש
   `/api/cron/payout-statements`, ‏CRON_SECRET, נרשם ב-vercel.json)
   מריץ `generate_payout_statement` לכל ספק active עם שורות
   settleable בחודש הקודם (פריט physical delivered / קופון used
   שטרם נכללו בדוח חי). ‏idempotent בזכות ה-UNIQUE החלקי על התקופה.
2. **ידני:** כפתור "הפק דוח" עם ספק + טווח; ‏CONFLICT על תקופה
   חופפת מוצג כשגיאה ידידותית.
3. דוח שנוצר נולד `pending_approval` ונכנס לתור.

### 4.3 מסך דוח: `/admin/payouts/[id]`

1. כותרת: ספק, תקופה, סטטוס, סכומים, `payout_terms_days` (שוטף+).
2. שורות (`payout_statement_lines`): פר שורה line_type
   (‏physical_delivery / coupon_redemption / adjustment), הפניה
   לפריט/קופון, ‏gross, ‏percent, ‏fee, ‏payout. שורות קופון מוצגות
   כאינפורמטיביות (payout 0) בסקשן נפרד.
3. **אישור** (‏admin): ‏`approve_payout_statement`. חסום אם קיימת
   מחלוקת open/in_review על הדוח (מוצגת עם קישור).
4. **סימון שולם** (‏super_admin + ‏`requireRecentAuth(15)`): טופס עם
   ‏`payment_reference` חובה (3-80 תווים, אסמכתת ההעברה הבנקאית).
   לפני ההגשה מוצג `bank_snapshot` העתידי: חשבון הבנק הפעיל של
   הספק (מ-`supplier_bank_accounts`, מוצג מלא לאדמין) + אזהרה אם
   ‏`verified_at IS NULL` (חשבון שלא אומת ידנית: חסימה רכה, דורש
   צ'קבוקס "אימתתי טלפונית"). **כלל ארבע עיניים (הוכרע):** ה-action
   דוחה כשהמסמן-כשולם הוא אותו משתמש שאישר (`approved_by`), אכיפה
   אפליקטיבית + audit; חריג יחיד: כשיש בעל super_admin יחיד במערכת
   (המצב היום), הכלל מדולג עם רישום security_event ‏info.
5. **ביטול דוח** (‏admin): ‏`cancel_payout_statement`; מוסבר שהשורות
   משתחררות לדוח הבא.
6. חסימה תקופתית: אם ל-settlement של התקופה יש שורות
   ‏unmatched/amount_mismatch (‏A7), כפתור הסימון-כשולם נעול עם
   קישור ל-`/admin/reconciliation` (הכלל הפרוצדורלי של 027 הופך
   לאכיפת UI; האכיפה הקשיחה נשארת ההתראה).

### 4.4 התאמות סליקה: `/admin/reconciliation`

1. העלאת קובץ settlement של Cardcom (CSV/XLSX): יצירת
   `cardcom_settlements` + שורות `cardcom_settlement_txns` עם ה-user
   client (מדיניות admin ALL, ‏I10), ואז הרצת
   ‏`reconcile_cardcom_settlement` והצגת הסיכום
   ‏`{matched, unmatched, amount_mismatch}`.
2. תור העבודה: טאב unmatched (אין הזמנה תואמת) וטאב amount_mismatch
   (סכום שונה). פר שורה: קישור חיפוש הזמנה, פעולת "שיוך ידני"
   (עדכון `order_id` + הרצת reconcile מחדש), או "סמן כמטופל" עם
   note (למשל עמלת סליקה ידועה).
3. שורה שנשארת פתוחה מעל 7 ימים עולה לפיד הקוקפיט (דרך
   ‏`v_admin_pending_queues`).

### 4.5 מחלוקות: `/admin/disputes`

טאבים open / in_review / resolved. פר מחלוקת: ספק, מקור (statement /
line / order_item / coupon / consumer_complaint מהקונסולה), reason,
גיל. פעולות: ‏in_review (סימון בעבודה), ‏resolve עם
‏`resolution_notes` חובה (‏I11: ‏resolved_accepted / resolved_rejected).
‏resolved_accepted עם השפעה כספית מייצר שורת adjustment בדוח הבא
(ידנית בשלב זה: כפתור "הוסף adjustment לדוח הבא" שפותח טופס סכום
שלילי/חיובי עם הפניה; האוטומציה נדחתה בהכרעת 027).

---

## 5. תפעול תוכן: `/admin/import` + הרחבות קטלוג

### 5.1 עיקרון

שני מסלולי ייבוא נפרדים, מנגנון אחד: מסלול W (וורדפרס, 032) הוא
חד-פעמי ומנוהל בסקריפטים; מסלול ה-CSV השוטף (חדש, 042) הוא כלי
העבודה הקבוע של האדמין. שניהם עובדים באותו דפוס: ‏staging -> ‏issues
-> אישור -> הקרנה. אין ייבוא ישיר ל-public בלי שלב ביניים.

### 5.2 ‏CSV: סכימות מחייבות

קידוד UTF-8 עם BOM (אקסל ישראלי), מפריד פסיק, שורת כותרת חובה,
מחירים בשקלים עם עד 2 עשרוניות, תאריכים `YYYY-MM-DD` או
`YYYY-MM-DDTHH:mm` (שעון ישראל, מומר ל-UTC בטעינה), בוליאני
`true/false`. מפתח טבעי: ‏`sku` למוצרים (חובה בייבוא, בניגוד לטופס),
‏`external_ref` לדילים. שורה עם מפתח קיים = עדכון (upsert), חדש =
יצירה. ‏multi-value מופרד `|`.

**מוצרים (`products.csv`):**

```csv
sku,name_he,name_en,slug,type,status,category_slug,secondary_category_slugs,kenyon_price,full_price,stock_quantity,low_stock_threshold,brand,description_he,search_keywords,supplier_business_id,platform_percent,is_featured,publish_at,unpublish_at,image_urls,seo_title,seo_description
SPA-001,עיסוי זוגי 60 דק,Couples Spa,spa-couples-60min,coupon,draft,beauty-health,hot-deals,89.90,240.00,,,,"פינוק זוגי מלא...","ספא|עיסוי|זוגי",512345678,,false,2026-08-01T09:00,,https://cdn.example/a.jpg|https://cdn.example/b.jpg,,
```

כללי ולידציה (zod, שורת error חוסמת את השורה בלבד):
‏`type` מתוך `coupon|physical|service`; ‏`status` מתוך
`draft|active|paused|sold_out|archived` (ה-enum המלא, ‏G-6);
‏`category_slug` חייב להתקיים; ‏`full_price` ריק או גדול ממש מ-
`kenyon_price` (‏CHECK של 030); ‏`supplier_business_id` = ח.פ (9
ספרות) שמזוהה מול `suppliers.business_id`, לא UUID (אנושי יותר,
ריק = בלי ספק + ‏issue ‏info); ‏`platform_percent` ריק = ‏fallback
השרשרת (מוצר -> ספק -> 10); ‏slug ריק = תעתיק אוטומטי מוצע (כמו
בייבוא WP) שמופיע בדוח לאישור.

**דילים (`coupon_deals.csv`):**

```csv
external_ref,title_he,business_name,supplier_business_id,total_deal_price,coupon_price,valid_from,valid_until,max_uses,max_uses_per_user,terms_he,location_he,lat,lng,image_url,status,publish_at
DEAL-2026-014,ארוחה זוגית,ביסטרו הים,512345678,240.00,45.00,2026-08-01,2026-12-15,200,1,"בתיאום מראש...",נהריה,33.006,35.094,https://cdn.example/deal.jpg,draft,
```

ולידציה: ‏`coupon_price < total_deal_price` (ה-refine של I3);
‏**`valid_until - תאריך ההקרנה >= 4 חודשים` (LEG-05, חוסם error)**;
‏`lat/lng` יחד או כלום. אחרי 036 העמודה נכתבת ל-`supplier_id`.

### 5.3 מנגנון הייבוא (‏UI + ‏042)

1. העלאה במסך `/admin/import`: יצירת `catalog_import_batches` (042)
   עם ‏kind ‏(products/coupon_deals), ‏sha256 של הקובץ, ‏dry_run=true
   תמיד בסיבוב הראשון.
2. פירסור וולידציה ב-server action (‏zod שורה-שורה); כל שורה נכתבת
   ל-`catalog_import_rows` עם ‏`payload` (הגולמי), ‏`normalized`,
   ‏`issues` ‏(error/warn/info) ו-`row_status`.
3. מסך הסקירה: טבלת שורות עם פילטר לפי severity, ספירות, והצגת
   diff לשורות upsert (ערך קיים מול חדש, בדפוס `id_map.projected`
   של 032: שדה שאדמין ערך ידנית אחרי ייבוא קודם לא נדרס, נרשם
   conflict).
4. כפתור "הקרן" נפתח רק על אפס errors; ‏warnings דורשים צ'קבוקס
   אישור. ההקרנה רצה דרך אותם server actions קיימים
   (‏`upsertProduct`/`upsertCouponDeal`) שורה-שורה בטרנזקציה פר
   שורה, כך שכל ה-audit והוולידציות הקיימות חלות; ‏batch_id נרשם
   ב-audit metadata.
5. ‏idempotency: הרצת אותו קובץ פעמיים = ‏upsert זהה (המפתח הטבעי);
   ‏batch נשמר עם stats לתחקור.
6. ייצוא: כפתור "ייצא CSV" בכל אחת מרשימות הקטלוג מפיק קובץ באותה
   סכימה בדיוק (ייבוא-ייצוא סימטרי לעריכה באקסל).

### 5.4 צנרת התמונות

1. **מקור:** ‏URL ‏חיצוני (‏CSV) או קובץ (טופס). בייבוא CSV השרת
   מוריד עם אימות Content-Type וגודל מקסימלי 15MB.
2. **עיבוד בהעלאה (כלל "מעלים מוכן" של PRODUCTION-OPS, זהה לצנרת
   ה-WP):** ‏sharp: ‏WebP רוחב מקסימלי 1600px איכות 80; לתמונה
   הראשית נגזרת OG ‏1200x630 מתחת ל-300KB (דרישת וואטסאפ). ‏EXIF
   מוסר.
3. **יעד:** ‏bucket ‏`product-images` (מוצרים) / ‏`coupon-images`
   (דילים), ‏path ‏`csv/<batch_id>/<sha256-12>.webp`; דה-דופ לפי
   ‏sha256 של קובץ המקור (קובץ זהה = ‏URL קיים, בלי העלאה).
4. ‏`ImageUploader` הקיים מקבל את אותו עיבוד צד-שרת (היום הוא מעלה
   גולמי): פעולת upload אחת משותפת ב-`src/lib/storage/upload.ts`.
5. תמונה ראשונה ברשימה = ראשית = מקור ה-OG. מוצר active בלי תמונה
   = ‏warn בייבוא ובטופס.

### 5.5 תזמון פרסום (042)

1. עמודות חדשות: ‏`publish_at timestamptz NULL`,
   ‏`unpublish_at timestamptz NULL` על `products` ועל `coupon_deals`
   ‏(+ ‏CHECK ‏`unpublish_at > publish_at` כששניהם קיימים).
2. סמנטיקה: מוצר/דיל ב-`draft` עם `publish_at` = מתוזמן. ‏cron
   ‏`/api/cron/content-scheduler` (כל 10 דקות, נוסף ל-vercel.json)
   מפעיל: ‏`draft -> active` כש-`publish_at <= now()` (בתנאי שעובר
   ולידציית active: מחיר, תמונה, קטגוריה), ‏`active -> paused`
   כש-`unpublish_at <= now()`. שני הכיוונים ‏idempotent וכותבים
   audit (‏actor: system).
3. פקיעת דילים נשארת של `valid_until` (הצגה ורכישה נחסמות ממילא);
   ‏`unpublish_at` הוא כלי תפעולי נפרד (הורדת קמפיין).
4. ‏UI: שדות "פרסם בתאריך" / "הורד בתאריך" בטפסים וב-CSV; רשימת
   המוצרים מקבלת badge ‏"מתוזמן" עם השעה.

### 5.6 תצוגה מקדימה בעיצוב Electro (חובת שער)

הכרעה: **אין פרסום בלי תצוגה מקדימה.** ‏"Electro" = עיצוב החנות
החי (ה-design system של phase5), לא ספרייה חיצונית; החובה היא
שהתצוגה המקדימה מרונדרת מאותם קומפוננטים של החנות עצמה, לא ממוקאפ
אדמיני.

1. **בטופס מוצר/דיל:** פאנל preview חי (בדפוס ה-preview הקיים של
   `CouponDealForm`, מורחב לכל הטפסים) שמרנדר את `ProductCard`
   ואת בלוק ה-hero של עמוד המוצר מאותם רכיבי `src/components/` של
   החנות, עם toggle רוחב (מובייל 390px / דסקטופ) ו-RTL מלא.
2. **עמוד מלא:** ‏route ‏`/admin/preview/product/[id]` מרנדר את עמוד
   המוצר האמיתי (אותו RSC של החנות) גם כשהוא draft, תחת ‏guard
   האדמין, עם פס עליון "תצוגה מקדימה: draft". אותו דבר לדיל.
3. **אכיפה:** המעבר ל-`status='active'` (בטופס, ב-bulk וב-CSV) דורש
   ‏`preview_confirmed=true` ב-input של ה-action (הטופס חוסם עד
   שהאדמין פתח preview; ‏CSV: צ'קבוקס ברמת ה-batch אחרי מסך סקירה
   שמציג את 10 הכרטיסים הראשונים מרונדרים). זו אכיפת תהליך, לא DB.
4. שינוי עיצוב בחנות משתקף אוטומטית ב-preview (אותם קומפוננטים),
   ולכן אין drift בין "איך זה נראה באדמין" ל"איך זה נראה ללקוח".

### 5.7 ‏bulk בפעולות הרשימה

‏`bulkUpdateProductStatus` הקיים מקבל סוף סוף UI: צ'קבוקסים בטבלת
המוצרים + פעולת סטטוס קבוצתית (עם אותה חסימת preview למעבר ל-active
של שורות בלי אישור קודם), וכן "שיוך קטגוריה קבוצתי" ו"שיוך ספק
קבוצתי" (‏actions חדשים באותו דפוס, ‏staff). ‏`ProductBulkClient`
היתום נמחק ונכתב מחדש בתוך `ProductsTable`.

---

## 6. מטריצת הרשאות

### 6.1 התפקידים

| תפקיד | מהות | קיים? |
|---|---|---|
| `super_admin` | הבעלים. כסף יוצא (mark-paid), הענקת תפקידי אדמין | קיים |
| `admin` | תפעול מלא: החזרים, אישורי payout, ספקים, fraud | קיים |
| `content_uploader` | קטלוג בלבד: מוצרים, קטגוריות, דילים, ייבוא, מדיה | קיים |
| `support` | עתידי: שירות לקוחות. קריאת הזמנות/משתמשים, פתיחת בקשות ביטול וטיפול באסקלציות, בלי ביצוע כסף | לא קיים; מוגדר כאן, נולד ב-042 |

הכרעות מבנה:

1. **‏`support` אינו בהיררכיית `has_role`.** ההיררכיה הקיימת
   (‏customer < vendor < content_uploader < admin < super_admin)
   נשארת כמות שהיא; ‏support מקבל פונקציה נפרדת `is_support()`
   ‏(admin ומעלה מחזירים true גם בה) ומדיניות RLS מפורשות. הכנסתו
   להיררכיה הייתה מעניקה לו בטעות כתיבת קטלוג או ההפך.
2. ה-enum ‏`user_role` מקבל ערך `support` ב-042 (‏ALTER TYPE ADD
   VALUE, ‏idempotent); הטריגר `enforce_role_change_privilege` (035)
   כבר מכסה אותו (רק admin+ מעניק, רק super_admin מעניק admin+).
3. ‏guard השכבה: ה-layout עובר ל-`requireStaffSession` מורחב
   (‏content_uploader/support/admin/super_admin), וכל page מפעיל
   ‏gate פר-סקשן לפי הטבלה. ‏actions נשארים עם ה-guard הקשיח שלהם.

### 6.2 מטריצה פר מסך

‏R = קריאה, ‏W = כתיבה/פעולה, ‏- = אין גישה (גם לא בניווט).

| מסך | content_uploader | support | admin | super_admin |
|---|---|---|---|---|
| קוקפיט | - | R (בלי מספרי כסף) | R | R |
| הזמנות | - | R | R+W (ביטול pending) | R+W |
| קונסולת החזרים | - | R+W חלקי (6.3) | R+W | R+W |
| אסקלציות | - | R+W | R+W | R+W |
| ‏payouts | - | - | R+W (הפקה, אישור, ביטול) | R+W + ‏mark-paid |
| ‏reconciliation | - | - | R+W | R+W |
| התחייבויות (liability) | - | - | R | R |
| ארנק | - | R (יתרה והיסטוריה) | R+W (‏adjust) | R+W |
| הוצאות פרסום | - | - | R+W | R+W |
| מוצרים/קטגוריות/דילים/אוספים/מאפיינים/hero | R+W | - | R+W | R+W |
| ייבוא CSV | R+W | - | R+W | R+W |
| ‏redirects/חיפוש | R+W | - | R+W | R+W |
| ספקים + בקשות | - | R | R+W (אישור/דחייה/עריכה) | R+W |
| מחלוקות | - | R+W (פתיחה וטיוב) | R+W (‏resolve) | R+W |
| ‏fraud | - | - | R+W | R+W |
| ‏security | - | - | R | R |
| ‏audit-log | - | - | R | R |
| התראות (תבניות/outbox) | - | R (‏outbox של לקוח) | R+W | R+W |
| אנליטיקה | - | - | R | R |
| משתמשים | - | R (בלי שינוי תפקיד) | R+W (תפקידים עד content_uploader/support) | R+W (הכול) |
| משתמש 360 | - | R | R | R |
| סוכנים (‏runs/עלויות/prompts) | - | - | R+W | R+W |
| טיוטות ספקים / העשרות | R+W (העשרות בלבד) | - | R+W | R+W |

### 6.3 פעולות רגישות (חיתוך רוחבי)

| פעולה | תפקיד מינימלי | תנאים נוספים |
|---|---|---|
| `markPayoutStatementPaid` | ‏super_admin | ‏`requireRecentAuth(15)`; שונה מהמאשר (4.3.4); אין מחלוקות פתוחות |
| `refundPayment` (כרטיס, כל סכום) | ‏admin | ‏`requireRecentAuth(15)`; דרך בקשת ביטול בלבד (3.4) |
| החזר לארנק / ‏goodwill עד 200 ש"ח | ‏support | ‏`adminAdjustWallet` עם תקרה יומית 500 ש"ח פר נציג (נאכף ב-action + נמדד ב-audit); מעבר לזה: admin |
| `adminAdjustWallet` בלי תקרה | ‏admin | ‏`requireRecentAuth(15)`; ‏idempotency ‏`adjust:<client_ref>` |
| `updateUserRole` לתפקיד admin+ | ‏super_admin | ‏`requireRecentAuth(15)` + טריגר 035 |
| אישור/דחיית בקשת ספק | ‏admin | ‏RPC בודק `is_admin()` בגוף |
| ‏kill switch של סוכן (`is_active=false`) | ‏admin | תמיד זמין, בלי recentAuth (עצירת חירום לא מחכה) |
| ‏resolve מחלוקת | ‏admin | ‏notes חובה |
| מחיקה רכה (מוצר/קטגוריה/דיל) | ‏content_uploader (מוצר) / ‏admin (השאר) | אין מחיקה קשיחה בשום מסך |

### 6.4 מיפוי ל-RLS הקיים

1. מסכי הקטלוג נשענים על מדיניות ה-staff הקיימות (‏025 + ‏SEC-06:
   ‏`has_role('content_uploader')` על products/product_images וכו').
2. מסכי הכסף, הספקים, ה-fraud וה-audit נשענים על מדיניות
   ‏`is_admin()` הקיימות (כולן כבר עם `WITH CHECK`, ‏SEC-03), ועל
   בדיקות `is_admin()` בגוף ה-RPCs.
3. ‏support ‏(042) מקבל אך ורק מדיניות SELECT חדשות:
   ‏orders/order_items/profiles (עמודות בטוחות)/coupon_codes/
   ‏wallet_accounts/wallet_transactions/agent_escalations/
   ‏supplier_disputes/notifications_outbox (של הלקוח הנבדק), ושתי
   כתיבות: ‏INSERT ל-`cancellation_requests` (דרך ה-fn) ו-UPDATE
   סטטוס על `agent_escalations`. שום SELECT על `security_events`,
   ‏`audit_log`, ‏`payments.raw_response`, ‏`supplier_bank_accounts`
   או views כספיים.
4. ‏`payment_tokens.cardcom_token` נשאר REVOKED מכולם כולל admin
   ‏(029); מסך משתמש 360 מציג רק last_4/brand/expiry.

---

## 7. מפרט `042_admin_ops.sql` (הקובץ ייכתב על ידי בעלי `supabase/`, לא כאן)

‏idempotent, ‏expand-only, ‏prerequisites: ‏030 (קטלוג), ‏035 (אבטחה);
לא תלוי ב-036-041 (בדיקות existence-guarded כדפוס 035). תכולה:

### 7.1 תפקיד support

```sql
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'support';
CREATE OR REPLACE FUNCTION public.is_support() ... -- support/admin/super_admin
-- מדיניות SELECT לפי סעיף 6.4.3 (מפורשות, לא היררכיות)
```

### 7.2 תזמון תוכן

```sql
ALTER TABLE public.products    ADD COLUMN IF NOT EXISTS publish_at timestamptz,
                               ADD COLUMN IF NOT EXISTS unpublish_at timestamptz;
ALTER TABLE public.coupon_deals ADD COLUMN IF NOT EXISTS publish_at timestamptz,
                               ADD COLUMN IF NOT EXISTS unpublish_at timestamptz;
-- CHECK (unpublish_at IS NULL OR publish_at IS NULL OR unpublish_at > publish_at)
-- אינדקסים חלקיים: WHERE status='draft' AND publish_at IS NOT NULL (ל-cron)
```

### 7.3 ‏view תורי הטיפול

```sql
CREATE OR REPLACE VIEW public.v_admin_pending_queues
WITH (security_invoker = true) AS
SELECT 'cancellation_requests' AS queue, count(*) AS n, min(created_at) AS oldest_at,
       interval '2 days'  AS sla FROM cancellation_requests WHERE status='submitted'
UNION ALL SELECT 'payout_approvals',      count(*), min(created_at), interval '5 days'
  FROM payout_statements WHERE status='pending_approval'
UNION ALL SELECT 'supplier_applications', count(*), min(created_at), interval '3 days'
  FROM supplier_applications WHERE status='pending'
UNION ALL SELECT 'fraud_flags',           count(*), min(created_at), interval '2 days'
  FROM agent_flags WHERE status IN ('open','reviewing')
UNION ALL SELECT 'escalations',           count(*), min(created_at), interval '1 day'
  FROM agent_escalations WHERE status IN ('open','in_progress')
UNION ALL SELECT 'listing_drafts',        count(*), min(created_at), interval '3 days'
  FROM listing_drafts WHERE status='pending_admin'
UNION ALL SELECT 'disputes',              count(*), min(created_at), interval '7 days'
  FROM supplier_disputes WHERE status IN ('open','in_review')
UNION ALL SELECT 'settlement_mismatches', count(*), min(created_at), interval '7 days'
  FROM cardcom_settlement_txns WHERE match_status IN ('unmatched','amount_mismatch')
UNION ALL SELECT 'outbox_dead',           count(*), min(created_at), interval '1 day'
  FROM notifications_outbox WHERE status='dead';
```

(כל בלוק עטוף בבדיקת קיום הטבלה; טבלה שטרם קיימת = השורה נשמטת.
הרשאות: admin בלבד דרך ה-RLS של הטבלאות + ‏security_invoker.)

### 7.4 ייבוא CSV

```sql
CREATE TABLE IF NOT EXISTS public.catalog_import_batches (
  id uuid PK, kind text CHECK (kind IN ('products','coupon_deals')),
  file_name text, file_sha256 text, dry_run boolean DEFAULT true,
  status text CHECK (status IN ('validating','ready','projecting','done','failed')),
  stats jsonb DEFAULT '{}', created_by uuid, created_at, finished_at
);
CREATE TABLE IF NOT EXISTS public.catalog_import_rows (
  id uuid PK, batch_id uuid FK ON DELETE CASCADE, row_num int,
  natural_key text, payload jsonb, normalized jsonb,
  issues jsonb DEFAULT '[]',              -- [{severity, code, message_he}]
  row_status text CHECK (row_status IN ('pending','valid','error','projected','skipped')),
  projected_entity_id uuid, created_at
);
-- RLS: קריאה staff, כתיבה דרך server actions (מדיניות staff INSERT/UPDATE);
-- audit trigger על batches.
```

### 7.5 שונות

1. ‏audit trigger על `catalog_import_batches`.
2. ‏GRANTs: ‏views חדשים לאדמין בלבד.
3. **לא כלול בכוונה:** שום שינוי ב-fns כספיים, שום טבלת screens
   חדשה מעבר לאלה; ‏`cancellation_requests` ו-`invoices` נשארים
   ב-037; ‏`ad_spend_daily` נשאר ב-041. החלה רק דרך MCP
   ‏`apply_migration`.

קוד אפליקציה נלווה (לא במיגרציה): שני ‏cron routes חדשים
(‏`content-scheduler`, ‏`payout-statements`) + רישומם ב-vercel.json,
‏actions של ייבוא, ‏preview routes, ‏labels.ts, תיקוני F1-F6.

---

## 8. סדר בנייה ותלויות

| שלב | תכולה | תלות מיגרציה |
|---|---|---|
| ‏AD-0 | תיקוני F1-F6 (‏layout, ‏orders enum, ‏audit-log, ‏pagination, טיפוסים) + מחיקת יתומים | אין (סכימה חיה) |
| ‏AD-1 | קוקפיט (בלי תורים שטרם קיימים: ה-view מדלג) + ‏liability + ‏analytics (טאבים על views קיימים) | 033/034 |
| ‏AD-2 | תפעול תוכן: ‏CSV, תזמון, preview, ‏bulk, ‏hero, ‏collections, ‏attributes, ‏redirects, ‏search | 042 (7.2, 7.4) |
| ‏AD-3 | ספקים: בקשות, ספק 360, ‏payouts, ‏reconciliation, ‏disputes, ‏wallet | 027 (+036 לאיחוד vendors) |
| ‏AD-4 | קונסולת החזרים מלאה + חשבוניות בשרשרת | 037 |
| ‏AD-5 | ‏fraud, ‏escalations, ‏agents, ‏security viewer | 028 (+039 להעשרות) |
| ‏AD-6 | ‏notifications (תבניות, ‏outbox), משתמש 360 | 031 |
| ‏AD-7 | ‏ads + ‏ROAS + ‏CRM segments בטאבי האנליטיקה; תפקיד support מופעל בפועל | 041, ‏042 (7.1) |

כלל: מסך שנשען על מיגרציה שטרם הוחלה לא נבנה חלקית; הוא מופיע
בניווט מושבת עם tooltip "ממתין ל-03X".

---

## 9. טבלת החלטות

| # | החלטה |
|---|---|
| ADM-1 | האדמין הוא UI דק מעל RPCs/actions שהוכרעו; אף מסלול כסף חדש; שלוש שכבות הרשאה תמיד |
| ADM-2 | 8 העמודים הקיימים: ‏dashboard נכתב מחדש כקוקפיט; ‏orders/audit-log/suppliers נכתבים מחדש (G-1, סכימת audit_log, ‏suppliers של 036); ‏4 קומפוננטות יתומות נמחקות; מחיקה קשיחה מבוטלת |
| ADM-3 | ‏guard השכבה: ‏requireStaffSession + ‏gate פר-סקשן; ‏content_uploader מקבל סוף סוף גישה לקטלוג בלבד |
| ADM-4 | קוקפיט: ‏v_owner_dashboard + ‏v_money_alarms + ‏v_admin_pending_queues + פיד security_events/agent_flags; אפס חישובי כסף בצד לקוח; אין דשבורד שלישי |
| ADM-5 | קונסולת החזרים מעל cancellation_requests (037): זכאות אוטומטית לפי 14 יום/2 ימי עסקים/פטורים, דמי ביטול min(5%,100), כרטיס-לכרטיס תמיד, ארנק רק בהסכמה מתועדת, ‏goodwill רק דרך adjust |
| ADM-6 | אין refund בלי שורת cancellation_requests; קופון used מנותב ל-supplier_disputes ‏consumer_complaint |
| ADM-7 | ‏payout: הפקה אוטומטית ב-cron חודשי (3 לחודש) + ידנית; ‏mark-paid: ‏super_admin, ‏recentAuth, ‏payment_reference חובה, כלל ארבע עיניים אפליקטיבי (מדולג כשיש super_admin יחיד, עם רישום), חסימה על מחלוקות ועל mismatches פתוחים של התקופה |
| ADM-8 | ‏reconciliation: העלאת קובץ, ‏reconcile, תור unmatched/mismatch עם שיוך ידני; פריט פתוח 7+ ימים עולה לקוקפיט |
| ADM-9 | ייבוא CSV קבוע בדפוס staging->issues->אישור->הקרנה (042); מפתחות טבעיים sku/external_ref; ‏upsert idempotent; הקרנה דרך ה-actions הקיימים בלבד; ייצוא סימטרי |
| ADM-10 | צנרת תמונות אחת: ‏WebP 1600/80 + ‏OG 1200x630<300KB + דה-דופ sha256, גם לטפסים וגם ל-CSV |
| ADM-11 | תזמון תוכן: ‏publish_at/unpublish_at (042) + ‏cron כל 10 דקות; ‏draft עם publish_at = מתוזמן; ‏unpublish -> ‏paused |
| ADM-12 | שער preview מחייב: פרסום ל-active דורש תצוגה מקדימה שמרונדרת מקומפוננטות החנות האמיתיות (כרטיס + עמוד מלא ב-route ‏preview אדמיני); נאכף ב-actions |
| ADM-13 | תפקיד support: ערך enum חדש (042), מחוץ להיררכיית has_role, ‏is_support() + מדיניות SELECT מפורשות; החזר-לארנק עד 200 ש"ח ותקרה יומית 500 ש"ח; בלי security/audit/כסף |
| ADM-14 | דוח ההתחייבויות: ‏v_coupon_expiry_liability + ‏v_wallet_liability + ‏drift במסך אחד; ‏drift מקפיא זיכויים ידניים עד סגירה |
| ADM-15 | תורי אישור מאוחדים ב-v_admin_pending_queues (042) עם SLA פר תור; מזין קוקפיט ותגי sidebar |
| ADM-16 | כל תוויות ה-enum בעברית בקובץ labels.ts יחיד; ערך לא מוכר מוצג גולמי |
| ADM-17 | סדר בנייה AD-0..AD-7 צמוד לרצף המיגרציות; מסך בלי מיגרציה = מושבת בניווט, לא נבנה חלקית |
