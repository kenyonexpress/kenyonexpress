# MASTER ARCHITECTURE: מסמך האב המאוחד (v3, מהדורת 2026-07-17 ערב)

<!-- v1-final-banner:2026-09-01 -->
> ⛔ **‏מיושן החל מ-01.09.2026. המסמך המחייב הוא `docs/ARCHITECTURE-OVERVIEW.md`.**
>
> ‏מעבר להערה מ-24.07 שכבר מופיעה למטה, הפרודקשן סותר את המסמך בשלוש נקודות:
>
> ‏1. **‏`supplier_payouts` ו-`payout_statements` אינם קיימים.** אין בבסיס הנתונים
>    הזה שום טבלת payout. ה-enums `payout_status` ו-`payout_line_type` חיים בלי
>    אף טבלה מאחוריהם.
> ‏2. **הענף אינו `phase5/homepage`.** ‏PR #6 מוזג, ו-`main` הוא הענף היחיד
>    שעובדים עליו ויעד כל push.
> ‏3. **אין Escrow בשום צורה,** גם לא כרישום פנימי ב-ledger. כל התשלום המקוון
>    הוא הכנסת פלטפורמה ברגע החיוב.

> **גובר עליו `docs/CONTRADICTIONS.md` (2026-07-24).** כל מספר עמלה, ברירת מחדל
> (10%/5%) או נוסח Escrow במסמך הזה הוא שריד. ההכרעה: `platform_percent`
> פר-מוצר, חובה, בלי ברירת מחדל בשום מקום; ה-held הוא רישום פנימי ב-ledger בלבד.

מסמך ההכרעות המחייב של KenyonExpress. מהדורה זו מחליפה במלואה את מהדורות
2026-07-09 ו-v2 (2026-07-17 בוקר). ענף: `phase5/homepage`. סדר הסמכות בסתירה:
בקרות אבטחה: `ARCHITECTURE-SECURITY.md` גובר; ענייני דין וציות:
`ARCHITECTURE-LEGAL-COMPLIANCE.md` גובר [1.51]; בכל השאר: **מסמך זה גובר** על
מסמכי הדומיין.

## 0. רישום המסמכים והמספור (אחרי האיחוד של 2026-07-17)

### 0.1 מסמכי הדומיין הקנוניים (קונבנציה: `ARCHITECTURE-<TOPIC>.md`)

| מסמך | דומיין | מיגרציה |
|---|---|---|
| `ARCHITECTURE-COMMERCE.md` | עגלה, checkout, Cardcom, ארנק double-entry | 026 |
| `ARCHITECTURE-SUPPLIER-REDEMPTION.md` | ספקים, מימוש קופונים, התחשבנות | 027 |
| `ARCHITECTURE-AI-AGENTS.md` | סכימת הבסיס ואינווריאנטים לסוכני AI | 028 |
| `ARCHITECTURE-AI-AGENTS-RUNTIME.md` | runtime, ‏evals והרחבת הקטלוג ל-6 סוכנים | 039 (מתוכננת) |
| `ARCHITECTURE-ACCOUNT-IDENTITY.md` | חשבון, זהות, מחיקה, payment_tokens | 029 |
| `ARCHITECTURE-CATALOG-SEARCH-SEO.md` | קטלוג, חיפוש עברי, SEO | 030 |
| `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` | התראות, הסכמה, מסעות שיווק | 031 |
| `ARCHITECTURE-WP-DATA-MIGRATION.md` | ייבוא הדאטה מ-WordPress (M1-M17) | 032 |
| `ARCHITECTURE-ANALYTICS-BI.md` | אנליטיקה (033) + הרחבת BI (034) | 033, 034 |
| `ARCHITECTURE-SECURITY.md` | מודל האיומים ורישום SEC-01..17 | 035 |
| `ARCHITECTURE-TESTING-CICD.md` | בדיקות ו-CI/CD (D1-D22) | אין |
| `ARCHITECTURE-PRODUCTION-OPS.md` | תשתית, cutover, עלויות | אין |
| `ARCHITECTURE-PERFORMANCE.md` | ‏Cache Components, תקציבי ביצועים, קיבולת ואינדקסים | 038 (מתוכננת) |
| `ARCHITECTURE-LEGAL-COMPLIANCE.md` | ציות ישראלי, ביטולים, חשבוניות, נגישות ושמירה | 037 (מתוכננת) |
| `ARCHITECTURE-OBSERVABILITY.md` | ניטור, לוגים, התראות, runbooks, ‏on-call ‏(OBS-01..22) | 040 (מתוכננת) |
| `ARCHITECTURE-GROWTH-SEO.md` | צמיחה: שימור SEO ב-cutover, ‏referrals/cashback, ‏CRM, ‏CAPI/ROAS ‏(G1-G18) | 041 (מתוכננת) |
| `ARCHITECTURE-MOBILE-SUPERAPP.md` | React Native + Expo, monorepo (M1-M14), חוזי הליבה שנבלעו מה-PWA | עתידיות (push) |
| `ARCHITECTURE-API-CONTRACTS.md` | משטח ה-API המלא: transports, ‏Zod, ‏idempotency, שגיאות (API-1..) | אין |
| `BUSINESS-MODEL.md` | כוונת מוצר (שלושה סוגי מוצרים) | אין |
| `docs/product-page/` | אפיון דף מוצר | אין |

הכפילויות אוחדו ונמחקו: `ANALYTICS-BI-ARCHITECTURE.md`, `TESTING-CICD-ARCHITECTURE.md`,
`WP-DATA-MIGRATION-ARCHITECTURE.md`, `COMMERCE-ARCHITECTURE.md` (התוכן המלא נבלע
בקבצים הקנוניים). שאר המסמכים שונו לשם הקונבנציה, וכל ההפניות עודכנו.
נוספו ב-2026-07-17: ‏`ARCHITECTURE-API-CONTRACTS.md` (חוזי ה-API, ‏R33) ו-
‏`ARCHITECTURE-MOBILE-SUPERAPP.md` (מובייל RN+Expo, מחליף את D1/D2 של מסמך
ה-PWA; ‏R27/R34). מסמך ה-PWA הישן נבלע בסעיף 11 של מסמך המובייל ונמחק.
שלושת מסמכי ה-lanes המשפטי, ביצועים וסוכני runtime הועברו מהתיקיות הזמניות
אל `docs/`, והתיקיות הזמניות נמחקו. **כלל מחייב מעתה: כל מסמך ארכיטקטורה חי
ב-`docs/` בלבד; אסור לפתוח תיקיות ארכיטקטורה צדדיות.**

### 0.2 מספור המיגרציות (שונה ב-2026-07-17, רצף רציף)

| היה | נהיה | תוכן |
|---|---|---|
| `035_analytics_bi.sql` | `034_analytics_bi.sql` | הרחבת BI |
| `036_security_hardening.sql` | `035_security_hardening.sql` | הקשחת אבטחה |
| 034 (שמור, לא נכתב) | **036** (מתוכנן, טרם נכתב) | `036_vendors_unification.sql` |
| חדש | **037** (מתוכנן) | `037_legal_compliance.sql` |
| חדש | **038** (מתוכנן) | `038_performance_indexes.sql` |
| חדש | **039** (מתוכנן) | `039_agents_v2.sql` |
| חדש | **040** (מתוכנן) | `040_observability.sql` (guard לקוד השמור, ‏probe, ‏v_ops_alarms; ‏OBS-21) |
| חדש | **041** (מתוכנן) | `041_growth.sql` (‏referrals השלמה, ‏cashback CHECK, ‏v_crm_segments, ‏ad_spend_daily, ‏capi_events; ‏G18. המסמך נכתב עם "040" ותוקן: 040 נתפס ע"י observability) |

הרצף על הדיסק כעת רציף: 026-035, ללא חורים. 036-041 שמורים לפי הטבלה ואינם
כתובים עדיין. משמעת מספור: לפני קובץ חדש בודקים `ls supabase/migrations/`,
מאמתים את ההקצאה כאן ומעדכנים מסמך זה באותו commit.

---

## 1. ביקורת סתירות (Conflict Audit): הכרעה מחייבת לכל סתירה

### חלק א: הכרעות 1.1-1.38 (ממהדורת 2026-07-09, בתוקף מלא)

ההכרעות הבאות נשארות מחייבות. הרקע המלא במהדורה הקודמת (git) ובמסמכי הדומיין.

1. **1.1 enum בשם `payout_status` (026 מול 027):** הקנוני הוא של 027, חמשת הערכים
   `('draft','pending_approval','approved','paid','cancelled')`. ההגדרה נמחקת מ-026;
   הבעלים היחיד: 027. (בכך נעלמת מלכודת "מי רץ ראשון": בלי העריכה, 026 שרצה קודם
   מפוצצת את `generate_payout_statement` בזמן ריצה.)
2. **1.2 שני מנועי settlement:** מנוע `payout_statements` של 027 קנוני. סעיף 8 של 026
   (`supplier_payouts` + `supplier_payout_items` + RLS + trigger) נמחק כולו.
3. **1.3 כפילות snapshot כספי על `order_items`:** חמש עמודות 026 קנוניות
   (`platform_percent`, `platform_fee_ils`, `supplier_due_ils`, `charged_on_site_ils`,
   `balance_due_at_business_ils`); `commission_percent`/`supplier_payout_ils` (007)
   תאומים deprecated שנכתבים במקביל; `generate_payout_statement` קוראת COALESCE.
4. **1.4 `products.platform_percent`:** הצורה של 027 (nullable + fallback דרך
   `product_platform_percent()`) קנונית; הבעלים היחיד: 026 המתוקנת; הבלוקים נמחקים
   מ-027 ומ-030.
5. **1.5 `coupon_deals`:** `platform_price` ו-`discount_percentage` מומרות מ-GENERATED
   לעמודות רגילות; ראו גם 1.40 (מודל coupon_price).
6. **1.6 שתי פונקציות מימוש:** `redeem_coupon` (027) היא נקודת המימוש היחידה, בתוספת
   כתיבת שורת `coupon_redemptions` בהצלחה (מחסום replay שני). `fn_redeem_coupon`
   נמחקת מ-026 (וגם EXECUTE נשלל ב-035 עבור DB חי).
7. **1.7 rate limit סריקה:** 30 לדקה (027). המספר 20 בטל.
8. **1.8 הרשאת ספק:** `supplier_members` + `is_supplier_member`/`is_supplier_owner`
   הם המודל היחיד. policies בסגנון `profiles.supplier_id` משוכתבים.
   `is_supplier_member_compat` נמחקת מ-028 (027 קודמת ל-028 בסדר הקנוני).
9. **1.9 מימוש בידי אדמין:** אין עקיפה. אדמין שצריך לממש מצטרף כ-member.
10. **1.10 זהות עסקת Cardcom:** `payments.cardcom_transaction_id` (UNIQUE) היא הרשומה
    הקנונית; `reconcile_cardcom_settlement` משוכתבת להתאים דרכה; `orders.cardcom_payment_id`
    נשאר write-through בלבד.
11. **1.11 ברירת מחדל לעמלה:** `suppliers.commission_percent` בלבד. `vendors.commission_rate` מת.
12. **1.12 `vendors` מול `suppliers`:** `suppliers` קנונית. מיגרציית איחוד ייעודית:
    **`036_vendors_unification.sql`** (סעיף 2.9; המספר עודכן, ראו 0.2). `vendors`
    מוקפאת לקריאה עד מחיקה עתידית. האיחוד מוחל לפני בניית UI הפורטל.
13. **1.13 סימון דוח כשולם:** ב-DB נשאר `is_admin()` (027); ב-server action נאכף
    `super_admin` בלבד.
14. **1.14 הנפקת קופון וחתימת QR:** יצירת `coupon_codes` בטרנזקציית ה-webhook; חתימת
    Ed25519 באותו server action לפני ה-commit; כשל חתימה לא מפיל את הטרנזקציה
    (`qr_token` יושלם ב-job; הקוד הידני תקף תמיד).
15. **1.15 `handle_new_user`:** הגרסה של 026 היא היחידה שמחליפה; 029 מוסיפה trigger
    עצמאי בלבד. insert ל-`wallet_balances` נשאר עד cutover.
16. **1.16 שם `wallet_transactions`:** RENAME ל-legacy כמו 026, בתוספת הסרת policy
    הכתיבה של אדמין מה-legacy. ה-ledger החדש append-only ללא כל policy כתיבה.
17. **1.17 audit על `payment_tokens`:** לעולם לא ה-trigger הגנרי; רק ה-trigger
    הייעודי של 029 שמסתיר את הטוקן.
18. **1.18 ניקוי RLS מצטבר (005/012/014/001):** מבוצע פעמיים בכוונה: מיידית על ה-DB
    החי דרך 035 (SEC-06), וקנונית בקבצים דרך 036.
19. **1.19 משמעת מספור:** הקבצים הפיזיים גוברים תמיד; עודכן ב-0.2.
20. **1.20 `notification_status`:** נוצר שלם ב-029 עם ששת הערכים
    `('queued','sent','failed','cancelled','dead','skipped')`; שני ה-ADD VALUE נמחקים מ-031.
21. **1.21 ערוצי outbox:** ה-CHECK נוצר ב-029 עם חמשת הערוצים כולל `whatsapp`; בלוק
    ההחלפה נמחק מ-031.
22. **1.22 dedupe_key לתזכורת 48h:** הפורמט של קובץ 029 קנוני (עם channel).
23. **1.23 חיווט WhatsApp לתזכורות פקיעה:** נשאר פתוח עד עליית ספק; מיגרציית cutover
    עתידית תחליף את גוף הפונקציה של 029 (שלב 5C).
24. **1.24 `quiet_hours_override`:** נדחה. שעות שקט הן מדיניות גלובלית.
25. **1.25 מנגנון הסכמה:** מצב = העדפות (029/031); ראיה משפטית = `consent_events` (031).
    הצעת עמודות המובייל נדחתה. (מסמך האבטחה מאשרר.)
26. **1.26 push:** טבלת `push_subscriptions` במיגרציית push עתידית, בבעלות דומיין
    ההתראות; שדה "מזהה Push לספק" בדף המוצר בוטל.
27. **1.27 שמות אירועי התראה:** מפתחות שטוחים snake_case קנוניים; המוסכמה המנוקדת
    נדחית לוורטיקלים.
28. **1.28 כתובת דף מוצר:** רבים, `/products/[slug]`, עם 301 קבוע מהיחיד (שלב C1).
29. **1.29 rate limit כשל RPC:** fail-closed לכסף (`begin_checkout`, `coupon_scan`);
    fail-open לצ'אט והסכמה; הכל מדווח ל-Sentry. ראו טבלה מלאה ב-5.4 (כולל auth).
30. **1.30 kill switch:** אין feature flags גנרי; `agent_prompts.is_active` (028)
    ו-`verticals.status` (עתידי) נשארים בדומיין שלהם. נוסף: `CHECKOUT_ENABLED` (D22).
31. **1.31 retention:** לנצח: audit_log, consent_events, wallet_transactions, payments,
    payout_statements, coupon_redemptions, notification_conversions, analytics_daily.
    ‏90 יום: agent_run_steps, coupon_scan_events, notification_delivery_events, outbox סופי.
    ‏`search_queries`: 6 חודשים [1.37]. `notification_events`: שנה. `analytics_events` גולמי:
    13 חודשים (partitions).
32. **1.32 `set_updated_at()`:** מותר CREATE OR REPLACE בכל קובץ, בתנאי גוף זהה בייט-בייט.
33. **1.33 `sold_count`:** נגזרת, אין עמודה.
34. **1.34 `carts.items` מול `cart_items`:** הפונקציות של 029/031 נשארות על jsonb עד
    סיום ה-cutover של שלב 2; מיגרציית cutover עתידית תשכתב ותמחק.
35. **1.35 drift מול DB חי:** טבלת `coupons` חיה בפרודקשן (לא נוגעים); `service` ו-
    `sold_out` אולי חסרים ב-enums (בדיקות קדם 2.10); החלה רק דרך MCP `apply_migration`.
36. **1.36 יתרות ארנק מיובאות:** 026 יוצרת שורות פתיחה ב-ledger
    (‏debit ‏`platform:adjustments` → ‏credit משתמש, ‏reason ‏`manual_adjust`,
    ‏idempotency ‏`legacy_opening:<user_id>`), אחרת `v_wallet_ledger_drift` צועק מהיום הראשון.
37. **1.37 retention של `search_queries`:** 6 חודשים (הצרכן 033 קובע).
38. **1.38 סדר סביב איחוד ה-vendors:** אין תלות סכימתית של האנליטיקה באיחוד; ה-views
    קולטים אוטומטית אחרי ה-backfill. (המספר עודכן: האיחוד הוא 036.)

### חלק ב: הכרעות חדשות (2026-07-17)

#### 1.39 מספור מחדש לרצף רציף

035→034 (analytics_bi), 036→035 (security_hardening), איחוד vendors = 036 (טרם נכתב).
כל ההפניות בקבצי SQL ובמסמכים עודכנו. הסמנטיקה של 035 לא השתנתה: מגוננת-קיום,
בטוחה להחלה על DB חי ב-025, ונדרשת הרצה חוזרת אחרי החלת כל טיוטה.

#### 1.40 מודל הכסף של קופון: Gen A מול Gen B (הסתירה המרכזית של 07-17)

- Gen B (‏`BUSINESS-MODEL.md` + החלק העסקי של ‏`ARCHITECTURE-COMMERCE.md`): מחיר
  הקופון באתר הוא שדה חופשי `coupon_price` שנקבע פר מוצר (דיל 100 ש"ח → קופון 10 ש"ח),
  לא נגזרת של `platform_percent`. הציע גם טבלת `coupons_issued`, ‏`qr_payload` לא חתום,
  ו"role supplier".
- Gen A (‏027 + מסמך האבטחה): ‏`coupon_codes` + ‏Ed25519 ‏`qr_token` + ‏`supplier_members`
  ‏+ ‏`redeem_coupon`; והנחת "מחיר האתר = אחוז מהדיל".

**הכרעה (מיישרת את D13/D14 של מסמך הבדיקות ואת SEC-16):**
1. **התמחור העסקי של Gen B מתקבל:** מחיר הקופון באתר חופשי. ברמת הסכימה אין עמודה
   חדשה: ‏`coupon_deals.platform_price` (אחרי ההמרה מ-GENERATED ‏[1.5]) **היא**
   ‏`coupon_price`, ‏ו-`original_price` היא ‏`total_deal_price`. ‏COMMENT מעודכן ב-026.
2. **האינווריאנטים נשארים נכונים:** לשורת קופון ‏`charged_on_site_ils = coupon_price`,
   ‏`platform_fee_ils = charged_on_site_ils` (כל התשלום באתר הוא של הפלטפורמה),
   ‏`supplier_due_ils = 0`, ‏`balance_due_at_business_ils = total_deal_price - coupon_price`.
   ה-CHECK של 026 לא משתנה. ‏`platform_percent` על שורת קופון הוא תצוגה/דיווח בלבד.
   ‏snapshot על ‏`coupon_codes`: ‏`face_value_ils = total_deal_price`,
   ‏`platform_paid_ils = coupon_price`, ‏`collect_amount_ils = ההפרש`.
3. **המנגנונים של Gen A מחייבים:** אין ‏`coupons_issued` (ממומש על ‏`coupon_codes`);
   אין ‏`qr_payload` לא חתום; אין "role supplier" (חברות בלבד ‏[1.8]).
   ‏`active`/`redeemed` הם לייבלים של UI מעל ‏`issued`/`used` ‏(enum ‏008 קנוני, D14).
4. שאלת 027 סעיף 9.5 ("האם מחיר האתר הוא בדיוק האחוז?") סגורה: לא.

#### 1.41 מנויים (Subscription)

‏`BUSINESS-MODEL.md` מוסיף סוג מוצר שלישי בלי שום תכנון אבטחה (SEC-16). **הכרעה:**
מנויים מחוץ לרצף 026-039. יידרשו: מודל איומים ייעודי, מיגרציה ייעודית (טבלת
`subscriptions`, ‏Cardcom Recurring Token), ‏idempotency פר ‏`(subscription_id,
cycle_number)`, ‏3 ניסיונות חיוב ואז ‏`paused` ‏(D17). שום קובץ קיים לא נוגע בזה.

#### 1.42 SEC-01 (הטבעת כסף בארנק) ותבנית ה-REVOKE השבורה

‏`fn_wallet_transfer` ב-026 עושה רק ‏`REVOKE FROM anon`, ומשאירה ‏EXECUTE ל-`authenticated`
‏(SECURITY DEFINER בלי בדיקת בעלות; חשבונות פלטפורמה פטורים מ-CHECK אי-שליליות) →
כל מחובר יכול לזכות את עצמו בלי הגבלה. **הכרעה:** שלוש שכבות:
1. ‏035 נועלת ל-service_role (מגונן-קיום; פועל גם אם 026 כבר הוחלה).
2. עריכת 026 עצמה: ‏`REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT ... TO service_role`
   כך שהחלון לא נפתח לעולם (נוסף לרשימת 2.1).
3. משימת קוד עתידית: guard בתוך הפונקציה נגד re-grant עתידי.
אותה תבנית שבורה קיימת ב-‏`fn_log_agent_run` ‏(028:375, לא מכוסה ברישום SEC): **הכרעה:**
עריכת 028 מוסיפה ‏REVOKE מלא + ‏GRANT ל-service_role בלבד.

#### 1.43 ‏`wallet_credit` מול ‏`wallet_earn`

הדרישה העסקית מדברת על "wallet_credit". **הכרעה:** שם האירוע הקנוני ב-registry של
033 הוא **`wallet_earn`** (וכן `wallet_spend`); ‏`wallet_credit` הוא כינוי עסקי שממופה
אליו ואסור כשם אירוע (rename אסור ב-registry). ערכי ה-enum ‏`wallet_reason` ‏(026)
נשארים כמות שהם; ‏`wallet_tx_type` ‏(006) legacy מת.

#### 1.44 ספק WhatsApp

מסמך המובייל השאיר פתוח; 031 כבר הכריעה. **הכרעה:** ‏Meta Cloud API ישירות (בלי BSP
בתשלום). השאלה הפתוחה במסמך המובייל בטלה.

#### 1.45 מנגנון ה-redirects

מסמך התפעול הציע ‏`redirects()` ב-`next.config.ts`. **הכרעה (M8 של מסמך ה-WP גובר):**
כל ה-301 חיים ב-`seo_redirects` ונאכפים ב-`src/proxy.ts` עם 301 מדויק וספירת hits.
אין ‏`redirects()` ב-next.config (מחזיר 308 ומפצל את מקור האמת).

#### 1.46 bootstrap של פרודקשן

מסמך התפעול (מיושן) אמר "001-028". **הכרעה:** פרויקט פרודקשן חדש (eu-central-1)
מקבל את הרצף המלא הערוך 001→039 ככל שהקבצים נכתבים ומאושרים, בסדר של סעיף 2,
דרך MCP בלבד. אין checkout לפני 037.

#### 1.47 מלכודת הסדר של SEC-12 (audit חשבונות בנק)

‏027 מחברת ל-`supplier_bank_accounts` את ה-trigger הגנרי (שמדליף מספרי חשבון ל-audit),
בעוד 035 מתקינה trigger מסתיר. אם 027 מוחלת אחרי 035, הגנרי חוזר עד הרצה חוזרת.
**הכרעה:** עריכת 027: היא מתקינה בעצמה את ה-trigger המסתיר (הגוף של 035) במקום הגנרי;
כלל ההרצה החוזרת של 035 נשאר כרשת ביטחון.

#### 1.48 rate limit ל-auth

מסמך האבטחה מוסיף: נתיבי auth בכשל RPC הם fail-closed (בניגוד למצב הקיים). מאומץ;
טבלת 5.4 עודכנה, כולל ‏`check_my_rate_limit()` ‏(035) כנקודת הכניסה היחידה מצד לקוח
(‏`check_user_rate_limit` נשאר ל-service/definer בלבד, SEC-05).

#### 1.49 עקרונות הבדיקות המחייבים (מתוך D1-D22)

מחייבים לכל שלבי הבנייה: מודול כסף טהור ‏`src/lib/money/` לפני ‏`beginCheckout` ‏(D2);
‏harness מיגרציות apply-twice על stack נקי לפני כל החלה מרוחקת (D6); אין טבלאות בדיקה
במיגרציות, תמיכת בדיקות ב-`supabase/seed.sql` + ‏`tests/sql/90_test_support.sql` ‏(D18);
‏Node 22 ננעל (D19); קידום פרודקשן git-based בלבד + ‏DB ‏forward-only ‏(D20); מיגרציה
לפני קוד, ‏expand/contract ‏(D21); ‏kill switch ‏`CHECKOUT_ENABLED` ‏(D22); בדיקות מרוץ
חובה לכל פונקציית כסף (D9).

#### 1.50 יעד ה-PR הקבוע

ענף היעד הוא ‏`cursor/add-supabase-3c830` (ה-main בפועל); ‏branch protection עליו;
ההגנות יועברו כשיוקם ‏main אמיתי.

#### 1.51 סמכות הציות המשפטי

`ARCHITECTURE-LEGAL-COMPLIANCE.md` הוא המקור המחייב בענייני דין. נוסח משפטי
סופי עדיין דורש אישור עו"ד ישראלי. בבקרות אבטחה מסמך האבטחה ממשיך לגבור.
רישום LEG-01..14 הוא חלק משער השיגור, ו-LEG-01..03 קריטיים.

#### 1.52 תוקף קופון ופקיעה ללא מימוש

הכרעת ה-breakage הישנה מבוטלת. תוקף דיל מינימלי הוא 4 חודשים. קופון שפג
במצב `issued` מזכה אוטומטית את ארנק הלקוח במלוא `platform_paid_ils`
כ-`refund_credit`, עם תוקף 5 שנים. ‏cashback ו-referral bonus פגים אחרי
24 חודשים, פר שורת צבירה וב-FIFO. אין פקיעה גורפת של יתרה.

#### 1.53 ביטול והחזר לפי אמצעי התשלום

מנוע ביטול צרכני הוא חוסם checkout: בקשת ביטול, חישוב זכאות בשרת, דמי ביטול
עד 5% או 100 ש"ח לפי הנמוך ובכפוף לסיבה, ונתיב `/cancel`. החלק ששולם בכרטיס
חוזר לכרטיס; החלק ששולם מארנק חוזר לארנק. החזר כרטיס לארנק דורש הסכמה
אקטיבית ומתועדת. ‏`037_legal_compliance.sql` מחזיקה את הסכימה.

#### 1.54 חשבוניות, מסמכי גילוי ונגישות

לפני קבלת שקל ראשון נדרשים מנוע חשבוניות, מודל מס לפיצול ספק/פלטפורמה
ומסמך גילוי סטטוטורי עם snapshot ו-`wording_version`. לפני שיגור נדרשים
עמודי legal, הצהרת נגישות, קישור ביטול קבוע, ‏axe חוסם ב-CI ובדיקת עומק
לפי ת"י 5568.

#### 1.55 ארכיטקטורת ביצועים

`ARCHITECTURE-PERFORMANCE.md` מחייב: ‏Cache Components + PPR לפני checkout;
קטלוג ציבורי דרך client אנונימי ללא cookies בתוך `use cache`; אזורים תלויי
משתמש דינמיים בתוך Suspense; תמונות דרך `next/image`; תקציבי LCP/JS
ו-Lighthouse CI. אינדקסים ו-`related_products` מתוכננים ב-038.

#### 1.56 הרחבת סוכני AI

`ARCHITECTURE-AI-AGENTS-RUNTIME.md` מרחיב את הקטלוג מ-4 ל-6 ומחייב סדר:
‏catalog_enrichment, ‏support, ‏shopping, ‏supplier_ops, ‏fraud_watch,
‏pricing_analyst. 028 מתעדכנת לפני החלה עם שני ערכי enum חדשים; טבלאות
הייעוד נוצרות ב-039. אף סוכן אינו כותב כסף, מחיר או פרסום ללא אישור אנושי.

#### 1.57 הקצאת 037-039

שלושת המסמכים נכתבו במקביל וכל אחד הניח שהוא 037. ההקצאה הקנונית פותרת
את ההתנגשות: 037 משפטי (חוסם קבלת תשלום), 038 ביצועים, 039 סוכנים v2.
המספרים שמורים גם לפני כתיבת הקבצים.

---

## 2. תוכנית המיגרציות הסופית

### 2.0 חוק ההחלה

**החלה אך ורק דרך Supabase MCP בכלי ‏`apply_migration`, קובץ אחד = טרנזקציה אחת.
אין דרישת אישור לאף קובץ. לעולם לא ‏`supabase db push`.** לפני החלה מרוחקת:
‏harness ה-apply-twice רץ ירוק על stack מקומי נקי (D6). אחרי הרצף:
‏`generate_typescript_types` ועדכון ‏`src/types/database.ts` פעם אחת.

### 2.1 סדר ההחלה הקנוני ומצב כל קובץ

| # | קובץ | פעולה לפני החלה | תלות קשיחה | ניתן להחלה |
|---|---|---|---|---|
| 0 | `035_security_hardening.sql` | אין (מוכן) | אין (מגונן-קיום) | **מיידית**, גם על DB חי ב-025; מתקן מיד SEC-02/03/04/06/09/17 |
| 1 | `026_commerce.sql` | עריכה (2.2) | בסיס 001-025 | חסום עד עריכה |
| 2 | `027_suppliers.sql` | עריכה (2.3) | 026 | חסום עד עריכה |
| 3 | `028_agents.sql` | עריכה קטנה (2.4) | 027 | חסום עד עריכה |
| 4 | `029_accounts.sql` | עריכה (2.5) | בסיס בלבד | חסום עד עריכה |
| 5 | `030_catalog.sql` | עריכה קטנה (2.6) | בסיס (016, 025, pg_trgm) | חסום עד עריכה |
| 6 | `031_notifications.sql` | עריכה (2.7) | 029 (guard בקובץ) | חסום עד עריכה |
| 7 | `032_wp_import_staging.sql` | אין | אין (עצמאית) | מוכן (אפשר גם מוקדם) |
| 8 | `033_analytics.sql` | תיקון כותרת בלבד (2.8) | 026, 027 (guards) | חסום עד עריכות 026/027 |
| 9 | `034_analytics_bi.sql` | אין (מוכן) | 026, 027, 033 (guards) | חסום עד 033 |
| 10 | `035_security_hardening.sql` (הרצה חוזרת) | אין | אחרי כל הרצף | מפעיל את SEC-01/10/11/12 |
| 11 | `036_vendors_unification.sql` | **קובץ חדש** (2.9) | 027 | חסום עד כתיבה |
| 12 | `037_legal_compliance.sql` | **קובץ חדש** (2.11) | 026, 027, 029, 031, 036 | חסום עד כתיבה; חוסם checkout |
| 13 | `038_performance_indexes.sql` | **קובץ חדש** (2.12) | 030 | חסום עד כתיבה ומדידת query plans |
| 14 | `039_agents_v2.sql` | **קובץ חדש** (2.13) | 028, 034, 037 | חסום עד כתיבה; נדרש לסוכן הראשון |

הערות סדר: ‏035 מוחלת פעמיים בכוונה (מיידית + בסוף). ‏032 עצמאית לחלוטין וניתנת
להחלה בכל נקודה. ‏028/029/030 לא תלויות זו בזו; הסדר המספרי הוא ברירת המחדל.
037-039 הן expand-only מתוכננות ואינן משנות את סדר 026-036.

### 2.2 עריכות ל-`026_commerce.sql`

נמחק: (1) בלוק ‏`payout_status` ‏[1.1]; (2) סעיף 8 כולו: ‏`supplier_payouts`,
‏`supplier_payout_items`, ‏RLS, ‏trigger ‏[1.2]; (3) ‏`fn_redeem_coupon` + ‏REVOKE שלה
(הטבלה ‏`coupon_redemptions` נשארת) ‏[1.6]; (4) ‏policy ‏"redemptions: supplier read"
מבוסס ‏profiles ‏[1.8].

משתנה: (5) ‏`products.platform_percent` ‏nullable בנוסח 027 ‏[1.4]; (6)
‏`coupon_deals.platform_percent` ‏nullable + המרת ‏`platform_price`/`discount_percentage`
מ-GENERATED לרגילות + ‏COMMENT: ‏`platform_price` = מחיר הקופון באתר (חופשי),
‏`original_price` = שווי הדיל ‏[1.5, 1.40]; (7) נוספת ‏`product_platform_percent()` ‏[1.4];
(8) הסרת ‏policy כתיבת אדמין מה-ledger ה-legacy אחרי ה-RENAME ‏[1.16]; (9) שורות
פתיחה ב-ledger אחרי זריעת החשבונות ‏[1.36]; (10) **גרנטים מלאים ל-`fn_wallet_transfer`:
‏REVOKE מ-PUBLIC/anon/authenticated, ‏GRANT ל-service_role בלבד ‏[1.42, SEC-01]**.

נשאר: ‏enums ‏payment_kind/payment_status/wallet_reason; ‏cart_items; הרחבות
orders/order_items (חמש עמודות snapshot + backfill); ‏payments + ‏payment_webhook_events;
ארנק double-entry + ‏seed חשבונות פלטפורמה; ‏handle_new_user המורחבת; ‏coupon_redemptions;
‏audit על payments.

### 2.3 עריכות ל-`027_suppliers.sql`

נמחק: (1) בלוק ‏`platform_percent` על products ‏[1.4]; (2) ‏`product_platform_percent()`
(עברה ל-026) ‏[1.4].

משתנה: (3) ‏`redeem_coupon`: בהצלחה נוסף ‏INSERT ל-`coupon_redemptions` עם
‏`amount_collected_ils = collect_amount_ils` ‏[1.6, SEC-10]; (4) נוסף policy קריאת ספק
על ‏`coupon_redemptions` מבוסס חברות ‏[1.8]; (5) ‏`generate_payout_statement`: ‏COALESCE
לעמודות 026 עם fallback לתאומים הישנים ‏[1.3]; (6) ‏`reconcile_cardcom_settlement`:
התאמה דרך ‏`payments.cardcom_transaction_id` ‏[1.10]; (7) **ה-trigger על
‏`supplier_bank_accounts` מוחלף מהגנרי ל-trigger המסתיר (גוף SEC-12 של 035) ‏[1.47]**.

נשאר: ‏`payout_status` בגרסת 5 הערכים (הבעלים היחיד), ‏supplier_members + פונקציות
חברות, ‏applications, ‏bank_accounts, ‏snapshot + QR על coupon_codes, עמודות משלוח,
‏coupon_scan_events, ‏update_shipping_status, ‏onboarding, מנוע payout_statements,
‏cardcom_settlements, ‏disputes, ‏RLS, ‏bucket ‏supplier-docs.

### 2.4 עריכות ל-`028_agents.sql`

(1) מחיקת ‏`is_supplier_member_compat`; ‏policy של ‏listing_drafts עובר ל-`is_supplier_member`
‏[1.8]. (2) **‏`fn_log_agent_run`: ‏REVOKE מלא מ-PUBLIC/anon/authenticated + ‏GRANT
ל-service_role ‏[1.42]**. (3) **WO-1 ‏[1.56]: ‏CREATE TYPE ‏`agent_key` נוצר עם ששת
הערכים ‏`('shopping','supplier_ops','support','fraud_watch','catalog_enrichment','pricing_analyst')`
‏(R22 אוסר ADD VALUE בקובץ רגיל)**. כל השאר נשאר.

### 2.5 עריכות ל-`029_accounts.sql`

(1) ‏`notification_status` נוצר עם ששת הערכים ‏[1.20]. (2) ‏CHECK הערוצים נוצר עם חמשת
הערוצים כולל whatsapp ‏[1.21]. כל השאר נשאר (כולל הקשחת payment_tokens, ‏fn_merge_guest_cart,
פונקציות המחיקה, התזכורות).

### 2.6 עריכות ל-`030_catalog.sql`

(1) מחיקת בלוק ‏`platform_percent` ‏[1.4]. כל השאר נשאר.

### 2.7 עריכות ל-`031_notifications.sql`

(1) מחיקת שני ‏ALTER TYPE ... ADD VALUE ‏[1.20]. (2) מחיקת בלוק החלפת ה-CHECK ‏[1.21].
כל השאר נשאר.

### 2.8 `033_analytics.sql`

תיקון קוסמטי בכותרת בלבד (הפניית האיחוד ל-036). ‏guards קיימים בקובץ.

### 2.9 `036_vendors_unification.sql` (קובץ חדש, ייכתב לפני שלב 5א)

(1) שורת ‏supplier לכל ‏vendor פעיל חסר-מקבילה; (2) ‏`coupon_deals.supplier_id` + ‏backfill;
‏`vendor_id` ‏nullable-deprecated; (3) ‏fallback של ‏`coupon_deals.platform_percent` דרך
הספק; (4) ניקוי RLS קנוני בקבצים (מה ש-035 עשתה על ה-DB החי) ‏[1.18]; (5) הקפאת
‏vendors (כתיבה לאדמין בלבד).

### 2.10 בדיקות קדם (מול ה-DB החי, לפני 026)

```sql
SELECT unnest(enum_range(NULL::public.order_status));
SELECT unnest(enum_range(NULL::public.order_item_status));
SELECT unnest(enum_range(NULL::public.product_type));      -- האם service קיים
SELECT unnest(enum_range(NULL::public.product_status));    -- האם sold_out קיים
SELECT to_regclass('public.suppliers'), to_regclass('public.coupon_codes');
SELECT proname FROM pg_proc WHERE proname IN ('check_user_rate_limit','audit_log_trigger_fn','is_admin');
SELECT column_name FROM information_schema.columns
 WHERE table_name='products' AND column_name IN ('name_he','platform_percent');
SELECT name, installed_version FROM pg_available_extensions WHERE name = 'pg_trgm';
```

ערך enum חסר = מיגרציית ‏ADD VALUE ייעודית ונפרדת לפני הקובץ הצורך, לעולם לא בתוך קובץ.

### 2.11 `037_legal_compliance.sql` (קובץ חדש, לפני checkout)

טבלאות `cancellation_requests`, ‏`invoices` ו-`legal_document_versions`;
snapshot קבלת תנאים על orders; ח.פ/עוסק וחתימת הסכם על suppliers; פונקציות
בקשת/אישור ביטול; תשתית תוקף יתרות; הרחבות המחיקה וה-retention. הכל
expand-only, עם RLS, ‏audit והרשאות לפי מסמך האבטחה.

### 2.12 `038_performance_indexes.sql` (קובץ חדש)

שמונה האינדקסים ורכיב `related_products` המפורטים בסעיף 5.2 של
`ARCHITECTURE-PERFORMANCE.md`. כל אינדקס נכתב רק אחרי אימות שאין כפילות
מול האינדקסים הקיימים ועם query plan מתועד.

### 2.13 `039_agents_v2.sql` (קובץ חדש)

טבלאות `enrichment_suggestions` ו-`agent_reports`, פונקציית intake להחזר,
RLS, ‏audit ו-REVOKE מלא לכל definer. 028 מקבלת את ערכי
`catalog_enrichment` ו-`pricing_analyst` בתוך CREATE TYPE לפני החלה.

---

## 3. רישום הקריטיים: אבטחה (SEC-01..17) וציות (LEG-01..14)

### 3.1 אבטחה

המקור המחייב: ‏`ARCHITECTURE-SECURITY.md`. ‏"תוקן ב-035" = כתוב בטיוטה, **טרם הוחל**.

| ID | חומרה | ממצא | מקור | תיקון | סטטוס |
|---|---|---|---|---|---|
| SEC-01 | **קריטי** | ‏`fn_wallet_transfer` ניתנת להרצה ע"י כל מחובר → הטבעת כסף מ-`platform:cashback_reserve` | 026 | 035 (נעילה ל-service_role) + עריכת 026 ‏[1.42] | תוקן בטיוטה |
| SEC-02 | גבוה | ‏`affiliates_user_update` בלי הגבלת עמודות → אישור עצמי וניפוח יתרות | 010 | 035 (drop) | תוקן בטיוטה; פעיל מיד בהחלה |
| SEC-03 | גבוה | ‏"profiles: admin all" בלי ‏WITH CHECK → כל אדמין ממנה super_admin | 001/003 | 035 (‏WITH CHECK + ‏trigger ‏enforce_role_change_privilege) | תוקן בטיוטה; מיידי |
| SEC-04 | גבוה | ‏`coupons_supplier_mark_used` ‏UPDATE חופשי → ספק מזייף סטטוסים | 008 | 035 (drop; גם 027) | תוקן בטיוטה; מיידי |
| SEC-05 | גבוה | ‏`check_user_rate_limit` סומכת על ‏user_id מהקורא | 019 | 035 (‏`check_my_rate_limit` על ‏auth.uid; נעילת הישנה) | תוקן בטיוטה |
| SEC-06 | גבוה | ‏policies ‏FOR ALL ישנים (005/012/001) חיים לצד החדשים ומתרחבים ב-OR | 005/012/001 | 035 (drop) + ניקוי קנוני ב-036 | תוקן בטיוטה; מיידי |
| SEC-07 | בינוני | ‏`cleanup_*` ניתנות להרצה ע"י ‏PUBLIC | 002/019 | 035 (service_role) | תוקן בטיוטה |
| SEC-08 | בינוני | ‏rate-limit.ts ‏fail-open; ‏`checkUserRateLimit` בלי קוראים | קוד | **משימת קוד**: ‏fail-closed בנתיבי כסף + חיווט ל-checkout | פתוח |
| SEC-09 | בינוני | ‏WITH CHECK של ‏carts מאפשר ‏profile_id ‏NULL לכל אחד | 001 | 035 (הידוק) | תוקן בטיוטה; מיידי |
| SEC-10 | בינוני | שני מסלולי מימוש עם הרשאות שונות | 026/027 | 035 (‏revoke הישן) + עריכות 2.2/2.3; שורת ledger = משימת קוד/עריכה 2.3 | תוקן בטיוטה |
| SEC-11 | בינוני | ‏owner ב-`supplier_members` מוסיף כל ‏user כ-owner | 027 | 035 (‏trigger ‏enforce_supplier_member_role) | תוקן בטיוטה |
| SEC-12 | בינוני | מספרי חשבון בנק מלאים נשפכים ל-audit_log | 025/027 | 035 (trigger מסתיר) + עריכת 027 ‏[1.47] | תוקן בטיוטה |
| SEC-13 | בינוני | ‏audit trail מת עד 025 (הכותב היחיד הוסב רק שם); ‏`admin_audit_log` נמחקת ב-025 | 011/025 | החלת 025 (הוחלה) + ‏035 מוסיפה ‏`security_events` ומוודאת writer | מתועד; לוודא באימות |
| SEC-14 | נמוך | סיסמת demo קשיחה בגיט לשישה משתמשי vendors מאושרים (`DemoVendor!2026`) | 023 | 035 (‏`assert_seeds_allowed` נגד seed בפרודקשן); ה-seed בדב נשאר | guard בטיוטה; אסור בפרודקשן |
| SEC-15 | נמוך | ‏`cardcom_token` ‏plaintext וקריא לבעלים עד 029 (וכן bank_account, payout_details) | 001 | 029 (‏REVOKE עמודתי + ‏trigger מסתיר). **אינווריאנט מחייב: אין לכתוב טוקן אמיתי ל-DB לפני החלת 029** | תוקן בטיוטת 029; הצפנה נדחתה בהחלטה |
| SEC-16 | מידע | מודל Gen B לא חתום + משטח מנויים בלי תכנון אבטחה | docs | הוכרע ב-1.40/1.41 (מנגנוני Gen A; מנויים מחוץ להיקף עד threat model) | סגור ברמת הכרעה |
| SEC-17 | בינוני | ‏"profiles: owner update" לא מקבע ‏supplier_id → קריאת קופונים חוצת-ספקים **דליפה חיה היום** | 003/008 | 035 (קיבוע ‏supplier_id) | תוקן בטיוטה; מיידי |

### 3.2 ציות משפטי

המקור המחייב: ‏`ARCHITECTURE-LEGAL-COMPLIANCE.md` ‏[1.51]. "הוכרע" = ההכרעה עוגנה
במסמכים; המימוש לפי עמודת התיקון.

| ID | חומרה | ממצא | תיקון | בעלים | סטטוס |
|---|---|---|---|---|---|
| LEG-01 | **קריטי** | אין מנוע ביטול צרכני (14ג קוגנטי; קיים רק "admin refund") | ‏`cancellation_requests` + ‏fns + עמוד ‏`/cancel` ‏(037 + קוד שלבים 3-4) ‏[1.53] | COMMERCE | פתוח; חוסם checkout |
| LEG-02 | **קריטי** | אין מערכת חשבוניות (‏`orders.invoice_number` יתום) | טבלת ‏`invoices` ‏(037) + הפקה בטרנזקציית ה-webhook + חשבונית עמלה צמודת ‏payout_statements ‏[1.54] | COMMERCE + SUPPLIER | פתוח; חוסם שקל ראשון |
| LEG-03 | **קריטי** | אפס נגישות ת"י 5568 / ‏WCAG 2.0 AA בכל המסמכים והקוד | הצהרת ‏`/accessibility` + ‏axe-core חוסם ב-CI + בדיקת NVDA + תיקון רטרואקטיבי ‏[1.54] | UI + TESTING | פתוח; חוסם שיגור |
| LEG-04 | גבוה | קופון שפג בלי מימוש: שמירת הכסף = חשיפה לפי דיני שוברים | זיכוי ארנק אוטומטי מלא ‏refund_credit ל-5 שנים ‏[1.52]; ‏job על ‏expire_coupons; ‏credit_note | SUPPLIER | הוכרע; מימוש ב-037 + cron |
| LEG-05 | גבוה | אין רצפת תוקף לשובר | רצפה 4 חודשים מהרכישה, ולידציית שרת ‏[1.52]; סוגר את SUPPLIER ‏9.3 | SUPPLIER | הוכרע; ולידציה בקוד |
| LEG-06 | גבוה | אין מסמך גילוי 14ג(ב) בעסקה | תבנית ‏`order_disclosure` חובה בטרנזקציית paid, עם ‏snapshot ו-`wording_version` ‏[1.54] | NOTIFICATIONS | פתוח |
| LEG-07 | גבוה | אין עמודים משפטיים; ‏`accept_terms` בלי תקנון ובלי ‏terms_version | 4 עמודי ‏`/legal/*` + ‏`/accessibility` + ‏`/cancel`; ‏`orders.terms_version`/`terms_accepted_at` ‏(037) | UI + COMMERCE | פתוח; חוסם שיגור |
| LEG-08 | בינוני | חורי PII במחיקה: ‏`security_events` לא נכלל בניקוי; ‏applications דחויות נשמרות לנצח | הרחבת ‏`fn_execute_account_deletion` + ‏cron ניקוי (מיושם ב-037) | ACCOUNT + SECURITY | פתוח; מימוש ב-037 |
| LEG-09 | בינוני | חובות תיקון 13 לא ממופות (סיווג מאגר, ‏DPO, ‏runbook אירוע) | רמת אבטחה בינונית; ‏DPO בסף 100k נושאי מידע; מסמכים עם עו"ד לפני שיגור | OPS + בעלים | הוכרע; ביצוע לפני שיגור |
| LEG-10 | בינוני | "החזר לארנק, לא לכרטיס" (026) סותר 14ה | ניתוב לפי אמצעי התשלום ‏[1.53]; ‏COMMERCE ‏3.2 תוקן | COMMERCE | הוכרע ומיושם במסמכים |
| LEG-11 | בינוני | פקיעת cashback לא מוגדרת (‏`expire` בלי מדיניות) | ‏cashback/referral ‏24 חודשים; ‏refund_credit ‏5 שנים; פר-צבירה FIFO דרך ‏`wallet_transactions.expires_at` ‏(037) ‏[1.52] | COMMERCE | הוכרע; מימוש ב-037 |
| LEG-12 | בינוני | אישור ספק בלי בסיס חוזי (אין חתימת הסכם) | ‏`agreement_version`/`agreement_signed_at` כתנאי ל-`approve_supplier_application` ‏(037) | SUPPLIER | פתוח; מימוש ב-037 |
| LEG-13 | נמוך | אין הגבלת גיל או התייחסות לקטינים | סעיף 18+ בתקנון + הצהרת גיל משולבת ב-accept_terms ב-checkout | UI | פתוח |
| LEG-14 | נמוך | נוסחים סופיים ללא אישור עו"ד | סבב ייעוץ משפטי מאוחד אחד (תקנון, פרטיות, הסכם ספק, באנר, מסמך גילוי) לפני שיגור | בעלים | פתוח; חוסם שיגור |

### 3.3 חוסמי שיגור ומשימות פתוחות

**חוסמי שיגור:** ‏SEC-01..06 מוחלים לפני שכסף אמיתי או קופון אמיתי זזים; ‏CSP/security
headers + ‏env.ts (הפער היחיד ל-SAQ-A); אין טוקן Cardcom אמיתי לפני 029; ‏SEC-08
(fail-closed) לפני checkout חי; ‏037 חלה + ‏LEG-01/02 חיים לפני התשלום האמיתי
הראשון; ‏LEG-03/07/13 לפני שיגור; סבב עו"ד מאוחד ‏(LEG-14, כולל באנר ההסכמה).

**משימות קוד פתוחות מהרישום:** ‏SEC-08 (חיווט לימיטר + fail-closed); ‏CSP headers
ב-proxy; ‏env.ts ‏zod; ‏guard פנימי ב-`fn_wallet_transfer`; אימות writer של audit_log;
‏axe-core ב-CI ‏(LEG-03); תבנית ‏order_disclosure ‏(LEG-06); הצהרת גיל ‏(LEG-13).

---

## 4. מודל הנתונים המאוחד (ERD טקסטואלי)

סימון: ‏`-> B` = ‏FK אל ‏B. ‏(L) = ‏legacy. ‏(P) = מתוכנן, אין קובץ. המספר = המיגרציה
המגדירה/המרחיבה. הבעלים התיעודי בסוגריים בכותרת הדומיין.

```
DOMAIN: זהות וחשבון (ARCHITECTURE-ACCOUNT-IDENTITY)
  auth.users (Supabase)
  profiles (001/003, +anonymized_at 029)     -> auth.users; role: user_role; supplier_id (L, sync בלבד; מקובע ב-035)
  user_addresses (009)                       -> auth.users
  payment_tokens (001, מוקשח 029)            -> profiles; cardcom_token חסום לדפדפן; audit ייעודי
  account_deletion_requests (029)            -> auth.users; pending יחיד פר משתמש
  carts (001, unique חלקי 029, הידוק 035)    -> profiles | session_id; items jsonb עד cutover [1.34]
  cart_items (026)                           -> carts, products, product_variants
  rate_limits (002) [IP]; user_rate_limits (019) [user+action]; check_my_rate_limit (035)

DOMAIN: קטלוג, חיפוש ו-SEO (ARCHITECTURE-CATALOG-SEARCH-SEO)
  categories (005/012, +kind/rule/seo 030)   עץ עומק 2; taxonomy|collection
  suppliers (005, מורחבת 027)                <- כל הכסף מפנה לכאן
  vendors (001/013) (L)                      רק coupon_deals; מוקפאת ב-036
  products (005/014/016, +026 percent, +030) -> suppliers, categories; search_vector; וריאציות
  product_variants (005/014/016, +030)       -> products; option_values
  product_images (005, policies פר פקודה 035) -> products, variants
  product_categories, attribute_definitions, category_attributes (030)
  coupon_deals (015, +026, +030 slug/seo,    -> vendors (L) + supplier_id (036);
               +036 supplier)                   platform_price = מחיר הקופון באתר [1.40]
  hero_slides (017); search_synonyms (030); search_queries (030, 6 חודשים)
  seo_redirects (030)                        301/308/410; נאכף ב-proxy.ts [1.45]

DOMAIN: הזמנות ותשלומים (ARCHITECTURE-COMMERCE)
  orders (007, +026, +attribution 033)       -> auth.users, user_addresses; expires_at
  order_items (007, +026 snapshot, +027 shipping) snapshot: platform_percent, platform_fee_ils,
                                                supplier_due_ils, charged_on_site_ils,
                                                balance_due_at_business_ils (+תאומים L)
  payments (026)                             -> orders, payment_tokens; cardcom_transaction_id UNIQUE [1.10]
  payment_webhook_events (026)               UNIQUE(provider, external_event_id)

DOMAIN: ארנק double-entry (ARCHITECTURE-COMMERCE)
  wallet_accounts (026)                      -> auth.users | code פלטפורמה (cashback_reserve/revenue/adjustments)
  wallet_transactions (026)                  append-only; שורות פתיחה legacy_opening [1.36];
                                                fn_wallet_transfer = service_role בלבד [1.42]
  wallet_balances (006) (L); wallet_transactions_legacy (006) (L, read-only)

DOMAIN: קופונים ומימוש (ARCHITECTURE-SUPPLIER-REDEMPTION)
  coupon_codes (008, מורחבת 027)             snapshot: platform_percent, face_value_ils,
                                                platform_paid_ils, collect_amount_ils; qr_token (Ed25519), qr_key_id
  coupon_redemptions (026, policy ספק 027)   -> coupon_codes UNIQUE; רשומת אמת של מימוש
  coupon_scan_events (027)                   append-only; יומן ניסיונות; 90 יום

DOMAIN: ספקים והתחשבנות (ARCHITECTURE-SUPPLIER-REDEMPTION)
  supplier_applications, supplier_members (מקור ההרשאה [1.8]; trigger הגנה 035),
  supplier_bank_accounts (audit מסתיר [1.47]), payout_statements (PS-######; bank_snapshot),
  payout_statement_lines, supplier_disputes, cardcom_settlements(+txns) (כולן 027)

DOMAIN: הפניות ושותפים
  referrals (010); affiliates (010, self-update הוסר ב-035)

DOMAIN: AI Agents (ARCHITECTURE-AI-AGENTS, כולן 028)
  agent_prompts (kill switch), agent_runs, agent_run_steps (90 יום), agent_flags,
  listing_drafts, agent_escalations; fn_log_agent_run = service_role בלבד [1.42]

DOMAIN: התראות ושיווק (ARCHITECTURE-NOTIFICATIONS-MARKETING; 029+031)
  user_notification_preferences (029, +031 whatsapp)
  notifications_outbox (029, +031 worker)    dedupe_key UNIQUE
  notification_events (031, שנה); notification_templates (031)
  consent_events (031, לנצח, ראיה 30א); channel_suppressions (031)
  notification_delivery_events (031, 90 יום); notification_conversions (031)
  views: v_notification_kpis, v_journey_revenue

DOMAIN: אנליטיקה ו-BI (ARCHITECTURE-ANALYTICS-BI; 033+034)
  analytics_event_definitions (033, +034: coupon_redeemed, supplier_payout)
  analytics_events (033)                     PARTITION חודשי; 13 חודשים; default חייב להישאר ריק
  analytics_daily (033, לנצח)
  views 033: v_owner_dashboard, v_money_alarms, v_revenue_daily, v_refunds_daily,
             v_wallet_liability, v_wallet_ledger_drift, v_coupon_funnel_monthly,
             v_supplier_leaderboard_30d, v_cohort_ltv_monthly, v_channel_revenue_weekly,
             v_funnel_daily, v_search_quality_daily (מותנית 030)
  views 034 (ספקים, security_invoker על RLS של 027): v_supplier_sales_daily,
             v_supplier_redemptions_monthly, v_supplier_scans_daily, v_supplier_payouts
  views 034 (אדמין): v_take_rate_monthly, v_coupon_expiry_liability
  matviews 034 (service_role בלבד): mv_cohort_retention_monthly, mv_take_rate_monthly
  fn_agent_kpi_snapshot (034); v_agent_costs_daily (מותנית 028)

DOMAIN: אבטחה (ARCHITECTURE-SECURITY; 035)
  security_events (035)                      append-only; אדמין SELECT; fn_log_security_event
  triggers: enforce_role_change_privilege, enforce_supplier_member_role;
  check_my_rate_limit; assert_seeds_allowed

DOMAIN: ציות משפטי (ARCHITECTURE-LEGAL-COMPLIANCE; 037 מתוכננת)
  cancellation_requests                     -> orders, order_items, auth.users; 7 שנים
  invoices                                  snapshot חשבונאי; 7 שנים לפחות
  legal_document_versions                   תקנון/פרטיות/ביטול/הסכם ספק versioned
  orders.terms_version/terms_accepted_at; suppliers.registration/agreement snapshot

DOMAIN: ביצועים (ARCHITECTURE-PERFORMANCE; 038 מתוכננת)
  related_products(...)                     STABLE, SECURITY INVOKER
  אינדקסים תומכי קטלוג, הזמנות, קופונים והתראות לפי query plans

DOMAIN: AI Agents v2 (ARCHITECTURE-AI-AGENTS-RUNTIME; 039 מתוכננת)
  enrichment_suggestions                    -> products, agent_runs; תור אישור staff
  agent_reports                             -> agent_runs; אדמין בלבד
  fn_agent_open_refund_intake               intake בלבד, ללא שינוי כסף

SCHEMA: wp_import (032; ארכיון + staging, service_role בלבד, לא חשוף ל-PostgREST)
  import_batches, id_map, products, categories, customers, orders, order_items,
  coupons, vouchers, media, url_inventory, issues + v_reconciliation, v_open_issues

DOMAIN: תפעול
  audit_log (011/025)                        append-only; לנצח; ה-writer מאומת אחרי 025
  storage buckets: product-images, vendor-logos, category-icons (004), coupon-images (015),
                   products, coupons (021), supplier-docs (027, פרטי)
  drift: coupons (טבלה חיה בפרודקשן, מחוץ לתכנון)

PLANNED (אין קובץ)
  036_vendors_unification (2.9)
  037_legal_compliance (2.11); 038_performance_indexes (2.12); 039_agents_v2 (2.13);
  040_observability (OBS-21: guard לקוד `00000000`, ‏probe seed, ‏v_ops_alarms)
  041_growth (G18: referrals.qualifying_order_id + fn_complete_referrals;
              CHECK cashback <= 25% מה-fee; v_crm_segments; 6 journey fns;
              ad_spend_daily; capi_events; v_roas_weekly/v_referral_kpis/
              v_wallet_engagement; הרחבת v_money_alarms בגדר ה-12%)
  push_subscriptions (P) [1.26]; verticals + orders.vertical (P) [1.30]
  subscriptions (P) [1.41, אחרי threat model]
```

---

## 5. סדר הבנייה: מהמצב הנוכחי ועד שיגור ב-kenyonexpress.co.il

מצב פתיחה (2026-07-17): ‏Phase 5 (דף בית 1:1) סגור; דף המוצר אומת מול האתר
החי ב-24.72% (מתחת ליעד 30%); דף הבית 6.69%; 001-025 מוחלות על dev; כל
הטיוטות 026-035 כתובות; 036-041 מתוכננות וטרם נכתבו; אפס קוד checkout.

### שלב 0: סגירת החזית הנוכחית + אבטחה מיידית

| צעד | תוכן | מקור |
|---|---|---|
| 0.1 | **בוצע:** אימות דף המוצר מול האתר החי, 24.72% מול יעד 30% | product-page; TESTING ‏4.6 |
| 0.2 | **החלת `035_security_hardening.sql` על ה-DB החי**: סוגר מיד את SEC-02/03/04/06/09/17, כולל דליפת הקופונים החיה (SEC-17) | SECURITY ‏8 |
| 0.3 | בדיקות קדם 2.10 מול ה-DB החי | כאן |
| 0.4 | כתיבת 037 המשפטית ואישור עו"ד לנוסחים; אין checkout לפני LEG-01..03 | LEGAL ‏6 |
| 0.5 | תשתית ביצועים P0: ‏Cache Components/PPR, תמונות, budgets ו-Lighthouse | PERFORMANCE ‏7 |
| 0.6 | החלת ה-seed הממתין ‏`supabase/seed-fixes/PENDING-live-products.sql` על dev: 8 המוצרים החסרים בגריד דף הבית | STATE.md |

### שלב 1: תשתית סכימה (חד פעמי)

| צעד | תוכן | מקור |
|---|---|---|
| 1.1 | ביצוע עריכות סעיף 2 בטיוטות 026-031 + כתיבת 036-039 (‏040-041 בשלביהם: ‏OBS ‏7.4, ‏GROWTH ‏5ג) | כאן 2.2-2.13 |
| 1.2 | ‏harness מיגרציות ‏apply-twice ירוק על stack מקומי נקי (D6) | TESTING ‏3.4, 6 |
| 1.3 | החלת הרצף 026→034 בסדר, הרצה חוזרת של 035, ואז 036→039 לפי תנאי הכניסה; ‏`generate_typescript_types` | כאן 2.1 |

### שלב 2: עגלה

2.1 שכתוב ‏server actions של העגלה ל-`cart_items` (כתיבה כפולה בתקופת המעבר [1.34]).
2.2 החלפת ‏`mergeGuestCart` ב-`rpc('fn_merge_guest_cart')`.

### שלב 3: ‏checkout + Cardcom (הכסף)

3.0 **קדם:** 037 חלה; מנוע ביטול, חשבוניות, מסמך גילוי ועמודי legal קיימים;
מודול הכסף הטהור ‏`src/lib/money/` + כל מקרי ‏M/K/S/ביטול ירוקים (D2, D13);
‏env.ts ‏zod + ‏CSP/security headers ב-proxy (חוסם SAQ-A); חיווט rate limit ‏fail-closed
‏(SEC-08) דרך ‏`check_my_rate_limit`; חיווט observability בסיסי לפני קוד ה-checkout
הראשון: ‏Sentry ‏errors-only + ‏scrubber, ‏`src/lib/log.ts`, ‏`/api/health`, ‏uptime
‏(OBS ‏7.4 צעד 1: "שום קוד כסף לא נכתב בלי שהעצבים מחוברים").
3.1 ‏`requireUserSession()` + אכיפת login בלחיצת תשלום.
3.2 ‏`beginCheckout` (טרנזקציה: ולידציה, snapshot דרך ‏`product_platform_percent` ומחיר
קופון לפי [1.40], ‏orders+order_items+payments, ‏Low Profile) + ‏rate limit ‏fail-closed.
3.3 ‏webhook: חתימה + אימות server-to-server, ‏dedup, טרנזקציית paid (תשלום, ארנק,
הנפקת קופונים + חתימת QR ‏[1.14], ‏cashback, מלאי, audit).
3.4 ‏`chargeWithToken` + ‏`refundPayment`.
3.5 ‏crons: פקיעת pending ‏(30 דק'), ‏reconcile ‏redirected ‏(10 דק').
3.6 צנרת התראות טרנזקציוניות v1 (‏fanout + ‏worker ‏Resend + פעמון in-app).
במקביל מרגע תחילת שלב 3: ‏CI ‏ci.yml מלא + ‏branch protection (D8, D12); ‏kill switch
‏`CHECKOUT_ENABLED` ‏(D22); ‏Supabase Pro + פרויקט פרודקשן לפני התשלום האמיתי הראשון.

### שלב 4: אזור אישי

4.1 ‏`/account/orders` + פירוט; 4.2 ‏wallet (feature detection); 4.3 ‏payment-methods
(רק אחרי 029 חלה; אינווריאנט SEC-15); 4.4 ‏profile + התראות + הסכמה
(‏fn_set_marketing_consent); 4.5 ‏coupons v1 (קוד ידני); 4.6 ‏privacy (מחיקה, re-auth
‏15 דק') + ‏crons (מחיקות, תזכורות, הקשחת worker).

### שלב C: קטלוג/חיפוש/SEO (במקביל לשלבים 3-4)

C1 מעבר ‏`/products/[slug]` + ‏301 + ‏lookup של ‏seo_redirects ב-proxy ‏[1.28, 1.45];
C2 חיפוש (search_products/autocomplete + לוג); C3 דפי listing (facets, ‏pagination 24,
‏ISR); C4 ‏SEO (JSON-LD, ‏meta, ‏sitemaps, ‏robots, ‏OG ל-WhatsApp); C5 אדמין (מאפיינים,
מילים נרדפות, ‏redirects, אוספים).

### שלב A: אנליטיקה (אחרי שלב 3, במקביל)

A1 ‏SDK + ‏`/api/a` + באנר הסכמה + ‏attribution; A2 ‏crons (‏rollup ‏02:10, ‏matviews
‏02:40, ‏partitions, ‏v_money_alarms → התראת אדמין); A3 דשבורד הבעלים.

### שלב 5א: ספקים (דורש 036)

5.1 ‏onboarding; 5.2 פורטל (dashboard על ‏views של 034, משלוחים, הגדרות); 5.3 מסך
סריקה PWA ‏(redeem_coupon, ‏fail-closed) + ‏QR באזור האישי; 5.4 דוחות + מחלוקות
(super_admin לתשלום [1.13]); 5.5 ‏reconciliation ‏Cardcom + ‏cron ‏expire_coupons.

### שלב 5ב: ‏AI Agents

סדר מחייב לפי מסמך ה-runtime: ‏catalog_enrichment במקביל ל-W אחרי 028+039
וטעינת staging; אחריו ‏support; ‏shopping אחרי C2 וקטלוג מועשר; ‏supplier_ops
אחרי פורטל הספקים; ‏fraud_watch אחרי 4-6 שבועות דאטה; ‏pricing_analyst אחרי
8 שבועות דאטה ו-034. ‏seed prompts + eval harness קודמים להפעלת כל סוכן.

**מיפוי שש פקודות העבודה (WO-1..6) של מסמך ה-runtime לשלבי הבנייה:**

| WO | תוכן | שלב ביצוע |
|---|---|---|
| WO-1 | ‏enum ‏`agent_key` עם ששת הערכים בעריכת 028 | שלב 1.1 (עריכות 2.4) |
| WO-2 | כתיבת ‏`039_agents_v2.sql` (טבלאות ייעוד + ‏fn_agent_open_refund_intake) | תחילת 5ב / לפני enrichment בשלב W (2.13) |
| WO-3 | ‏`src/contracts/agents.ts`: סכימות Zod לכלים ולפלטים | עם חילוץ ‏`src/contracts/` ‏(G-5 של מסמך ה-API, שלב 3) |
| WO-4 | הפניה קדימה ממסמך V1 למסמך ה-runtime | **בוצע** (איחוד v3) |
| WO-5 | עדכון סדר 5ב + ‏enrichment בשלב W + רישום 039 במסמך האב | **בוצע** (מסמך זה) |
| WO-6 | שלושה ‏crons: ‏agents-enrichment (יומי 03:00), ‏agents-fraud (יומי 05:00), ‏agents-pricing (שבועי ראשון 06:00); כולם ‏CRON_SECRET | עם השקת כל סוכן בהתאמה (5ב) |

### שלב 5ג: אוטומציית שיווק

5.11 עגלה נטושה + ‏win-back; 5.12 ייחוס הכנסות (‏?ke_n=); 5.13 ‏WhatsApp (Meta Cloud
API ‏[1.44] + מיגרציית cutover לחיווט התזכורות [1.23]); 5.14 ‏cron ‏retention ‏[1.31];
5.15 צמיחה (מסמך GROWTH): ‏041 + מנוע referrals/cashback, ‏v_crm_segments ושש
המסעות (אחרי 026+031+033); לכידת click-IDs לתוך עוגיית ה-attribution נבנית כבר
עם A1 (אי אפשר להשלים בדיעבד); צנרת ‏CAPI/ROAS רק עם קמפיין ראשון בתשלום.
מסלול ה-SEO של המעבר (G1-G7: ‏baseline GSC ‏T-7, ‏CSV ה-redirects, ‏checklist יום
ה-flip, ניטור 30 יום) שייך לשלב W ולשער השיגור.

### שלב W: ייבוא WordPress ו-cutover (מסלול עצמאי; חוסם שיגור)

לפי ‏`ARCHITECTURE-WP-DATA-MIGRATION.md` ‏(M1-M17): שלב 0 גישה (SSH/DB + GSC, המשימה
הפותחת) → dump מלא + ‏uploads → ‏032 חלה → טעינת staging + ‏curation → הקרנה ב-dev
(קטלוג/לקוחות מיד; ‏redirects אחרי 030; שוברים חיים אחרי 026+027) → אימות (ספירות,
‏checksums, כיסוי ‏url_inventory מלא) → הקפאות (שוברים T-30, קטלוג T-48h) → ‏cutover
‏DNS לפי ‏`ARCHITECTURE-PRODUCTION-OPS.md` (‏TTL 300, ‏rollback = ‏DNS, ‏WP חי שבועיים).
כל המיובאים ‏marketing_*=false.
אחרי טעינת staging ו-028+039, ‏catalog_enrichment יכול להכין הצעות תוכן ו-SEO
לתור אישור staff לפני ההקרנה לקטלוג החי.

### שער השיגור (כולם חייבים ירוק)

1. ‏SEC-01..06 מוחלים; ‏CSP headers; אין טוקן אמיתי לפני 029; ‏SEC-08 סגור.
2. ‏Supabase Pro פעיל + גיבוי ‏pg_dump יומי + תרגיל restore אחד.
3. ‏CI ירוק כחוסם merge; ‏harness מיגרציות ירוק פעמיים.
4. ‏reconciliation ו-‏v_money_alarms מחוברים להתראת אדמין דרך מנוע ההתראות
   ‏(OBS-13, ‏cron כל 15 דק'); סעיף 7.4 של מסמך ה-observability ירוק, כולל
   ‏heartbeat ‏Cardcom, תרגיל אש ותרגיל restore ראשונים ‏(OBS-20).
5. עסקת אמת אחת ב-Cardcom פרודקשן (המסלול השלישי של אסטרטגיית Cardcom).
6. באנר הסכמה מאושר משפטית; ‏sitemap + ‏robots + ‏redirects חיים.
7. ‏LEG-01..03 סגורים: ביטול צרכני, חשבוניות/מסמכי גילוי ונגישות; כל עמודי
   legal והסכם הספק מאושרים בידי עו"ד.
8. תקציבי PERFORMANCE ירוקים ב-Lighthouse ובתרחיש k6 הרלוונטי.

### שלב 6 (עתידי, מחוץ להיקף הנוכחי; לפי ‏ARCHITECTURE-MOBILE-SUPERAPP)

מעבר ‏monorepo ‏(M1: ‏`apps/web`, ‏M2: חילוץ חבילות) → אפליקציית ‏React Native + Expo
‏(`apps/mobile`) עם מיגרציית push (סכימת ‏5.1.2 שם: ‏platform ‏web/expo ‏[1.26]),
‏EAS, ‏Cardcom ב-WebView, ארנק קופונים offline; ורטיקלים כמיני-אפים; מנויים אחרי
‏threat model ‏[1.41]. ה-PWA משמש גשר עד ההשקה.

---

## 6. רישום הכרעות חוצה-מערכת (טבלה אחת)

| # | נושא | הכרעה | עוגן |
|---|---|---|---|
| R1 | ‏settlement | מנוע ‏payout_statements ‏(027); ‏supplier_payouts נמחק מ-026 | 1.2 |
| R2 | ‏payout_status | 5 ערכים, בעלים 027 בלבד | 1.1 |
| R3 | ישות ספק | ‏suppliers קנונית; ‏vendors מוקפאת; איחוד ב-036 | 1.12 |
| R4 | הרשאת ספק | ‏supplier_members בלבד; ‏profiles.supplier_id ‏sync (ומקובע ב-035) | 1.8, SEC-17 |
| R5 | מימוש קופון | ‏redeem_coupon ‏(027) יחיד + שורת ‏coupon_redemptions | 1.6 |
| R6 | מחיר קופון | ‏coupon_price חופשי; ‏platform_price = המחיר באתר; אינווריאנטים של 026 נשמרים | 1.40 |
| R7 | ‏QR | ‏Ed25519 ‏qr_token, רוטציה ב-qr_key_id; חתימה = אותנטיות, חד-פעמיות = DB בלבד | 027 |
| R8 | ארנק | ‏double-entry; ‏fn_wallet_transfer ‏service_role בלבד; ‏append-only; שורות פתיחה ל-legacy | 1.16, 1.36, 1.42 |
| R9 | שמות אירועי ארנק | ‏wallet_earn/wallet_spend קנוניים; ‏wallet_credit = כינוי עסקי | 1.43 |
| R10 | עמלה | ‏platform_percent = חלק הפלטפורמה; ‏fallback מוצר→ספק→10; בעלים 026 | 1.4, 1.11 |
| R11 | זהות עסקה | ‏payments.cardcom_transaction_id ‏UNIQUE | 1.10 |
| R12 | ‏webhook | חתימה + אימות server-to-server; ‏browser redirect לעולם לא משנה state | COMMERCE T3 |
| R13 | ‏RBAC צוות | ‏super_admin בלבד מעניק admin+ (trigger ‏035); כסף יוצא = ‏super_admin | SEC-03, 1.13 |
| R14 | ‏rate limits | טבלת 5.4; ‏fail-closed לכסף ול-auth; ‏check_my_rate_limit ללקוח | 1.29, 1.48 |
| R15 | ‏retention | לפי הרישום ‏[1.31 + 1.37] והרחבת הטבלה המשפטית; refund_credit ‏5 שנים, הטבות 24 חודשים | 1.31, 1.52, LEGAL ‏5 |
| R16 | הסכמה | מצב = העדפות; ראיה = ‏consent_events; ‏opt-in בלבד (30א) | 1.25 |
| R17 | ‏WhatsApp | ‏Meta Cloud API ישיר | 1.44 |
| R18 | ‏redirects | ‏seo_redirects + ‏proxy.ts, ‏301 מדויק; אין ‏next.config redirects | 1.45 |
| R19 | ‏URL מוצר | ‏`/products/[slug]` רבים | 1.28 |
| R20 | ‏slugs | לטיניים; עבריים ישנים מקבלים 301 | CATALOG |
| R21 | חיפוש | ‏Postgres FTS ‏simple + ‏he_tsquery + ‏trigram; ‏Meilisearch רק בטריגרים מדודים | CATALOG |
| R22 | מיגרציות | ‏idempotent; ‏enum שלם ב-CREATE TYPE; אין ‏ADD VALUE בקובץ רגיל; החלה רק ‏MCP, בלי אישור | 2.0 |
| R23 | בדיקות | ‏D1-D22 מחייבים; מודול כסף לפני checkout; ‏apply-twice לפני החלה | 1.49 |
| R24 | ‏deploy | מיגרציה לפני קוד (expand/contract); ‏DB ‏forward-only; ‏rollback = ‏Vercel Instant | D20, D21 |
| R25 | פרודקשן | פרויקט Supabase חדש ‏eu-central-1 + ‏fra1; ‏Pro לפני תשלום ראשון; ‏bootstrap ‏001→039 ככל שנכתבו ואושרו | 1.46, OPS |
| R26 | ‏cutover | ‏DNS ‏TTL 300; ‏WP חי שבועיים כ-rollback; הקפאות ‏M15 | OPS, WP |
| R27 | מובייל | **React Native + Expo** ב-monorepo ‏Turborepo (‏`apps/web` + ‏`apps/mobile`, הכרעות M1-M14); ה-PWA הוא גשר עד ההשקה בלבד; חוזי הליבה שנבלעו בסעיף 11 נשארים | MOBILE-SUPERAPP ‏11 |
| R28 | סוכני AI | ‏grounding בלבד; ‏RLS כגבול; אף סוכן לא כותב כסף; ‏fn_log_agent_run ‏service בלבד | AGENTS, 1.42 |
| R29 | אנליטיקה | ‏first-party בלבד; שני מישורים (כסף מטבלאות אמת, התנהגות מ-events); 2 ‏matviews בלבד | ANALYTICS |
| R30 | מנויים | מחוץ להיקף עד ‏threat model ומיגרציה ייעודית | 1.41 |
| R31 | מספור | רצף רציף; 036-041 שמורים לפי 0.2; המספר החדש הבא הוא 042; עדכון מסמך זה באותו commit | 0.2, 1.19, 1.57 |
| R32 | שמות מסמכים | ‏`ARCHITECTURE-<TOPIC>.md`; מסמך זה ומסמך האבטחה = היררכיית הסמכות | 0.1 |
| R33 | חוזי API | שני transports בלבד (Server Actions לדפדפן, ‏Route Handlers ל-machine-to-machine); מעטפת ‏`ActionResult<T>` אחידה; טקסונומיית 16 שגיאות; כל מהלך כסף עם ‏idempotency key בעל שם | API-CONTRACTS |
| R34 | ‏monorepo | מעבר ‏Turborepo בשלב 6: ‏M1 (‏`apps/web`, ‏PR אטומי, עדכון ‏CLAUDE.md באותו commit) ואז חילוץ חבילות ‏M2; אפס שינוי התנהגות פר ‏PR | MOBILE-SUPERAPP ‏2 |
| R35 | ציות משפטי | מסמך LEGAL גובר בענייני דין; LEG-01..03 חוסמים checkout/שיגור; נוסחים דורשים עו"ד | 1.51-1.54 |
| R36 | קופון שפג | רצפה 4 חודשים; פקיעה ללא מימוש מזכה refund_credit ל-5 שנים | 1.52 |
| R37 | ביצועים | ‏Cache Components + PPR; דינמי בתוך Suspense; תקציבים חוסמים CI; אינדקסים ב-038 | 1.55 |
| R38 | סוכני AI v2 | 6 סוכנים; סדר enrichment-first; 039 לטבלאות הייעוד; אישור אנושי לכל תוצר כותב | 1.56 |
| R39 | ‏observability | ‏Sentry ‏errors-only + ‏scrubber יחיד; ‏Better Stack ל-uptime/on-call/סטטוס; מנוע התראות אחד על ‏v_money_alarms + ‏v_ops_alarms ‏(040); ראיות משפטיות רק ב-DB, לוגים = אבחון בלבד; אין קוד כסף בלי חיווט (שלב 3.0) | OBS-01..22 |
| R40 | צמיחה | ‏referrals: ‏20/10 ש"ח, סף 50 ש"ח, חלון 14 יום, תקרות 5/חודש 30/שנה, ‏clawback; ‏cashback: קופון 10% / פיזי 1% מ-charged_on_site, תקרה 25% מה-fee, פקיעה 24 חודשים; גדר תקציב הטבות 12% מהכנסת פלטפורמה ב-v_money_alarms; ‏CAPI/‏offline conversions רק בהסכמה ועם קמפיין ראשון, אין GA4; ‏retention: ‏ad_spend_daily לנצח, ‏capi_events ‏90 יום אחרי sent; ‏`?ke_n=` (התראות) ועוגיית ‏`ref` (הפניות /r/[code]) חיים זה לצד זה על ‏orders.attribution | GROWTH G1-G18, 041 |

### 5.4 טבלת ‏rate limits (מקור אמת יחיד)

| action | מכסה | חלון | כשל RPC | צרכן |
|---|---|---|---|---|
| ‏auth (login/otp) | 10 | שעה (IP) | **closed** ‏[1.48] | ‏routes של auth |
| `begin_checkout` | 10 | דקה | **closed** | ‏beginCheckout |
| `coupon_scan` | 30 | דקה | **closed** | ‏redeem_coupon |
| `account_deletion` | 3 | 24 שעות | **closed** | ‏fn_request_account_deletion |
| `cancellation_request` | 5 | 24 שעות | **closed** | ‏fn_request_cancellation (037) |
| ‏webhook ‏Cardcom | ~300 | דקה (IP) | open | ‏route |
| `consent_change` | 20 | שעה | open | ‏fn_set_marketing_consent |
| `agent_chat` | 20 | שעה | open | ‏shopping/support |
| `listing_draft` | 10 | 24 שעות | open | ‏supplier_ops |
| `referral_share` | 30 | 24 שעות | open | יצירת קישורי ‏/r/[code] ‏(041, ‏G-fraud) |
| ‏ingest ‏`/api/a` | 120 | דקה (IP) | open | ‏SDK |

תקרות מדיניות נלוות (ללא שינוי מהמהדורה הקודמת): כמות 1-99 לפריט; פקיעת pending
‏30 דק'; ‏reconcile אחרי 10 דק'; חלון החזרה 14 יום; ‏payout_terms 15 יום; מחיקה 30 יום
‏+ ‏re-auth ‏15 דק'; שעות שקט 09:00-21:00 ‏Asia/Jerusalem (שישי עד 15:00, שבת מ-20:30);
מכסת שיווק 1/יום ו-3/שבוע; ‏retry ‏5min×2^n עד 6 שעות, ‏dead אחרי 5; עגלה נטושה 1h/24h;
‏win-back רבעוני; ‏agents: ‏6/10 צעדים, ‏2048 טוקנים, ‏50 מועמדות fraud; קטלוג: עמוד 24,
‏autocomplete 8/2 תווים/150ms, ‏trigram 0.35; אנליטיקה: ‏batch 1-50, ‏props 4KB, חלון
‏[עכשיו-7d, עכשיו+5m], ‏IP ‏/24 (‏/48), ‏rollup ‏02:10, ‏matviews ‏02:40, ‏partitions 13 חודשים.
