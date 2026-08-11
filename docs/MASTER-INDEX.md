# אינדקס ראשי: מסמכי ארכיטקטורה

אינדקס כל מסמכי הארכיטקטורה ב-`docs/` עם שורת תקציר לכל אחד.

Status: **BINDING (index)** · עודכן: 2026-08-11 (MOBILE-APP + TESTING-QA + OBSERVABILITY) · QA: PASS (final, topic-sorted + DEPRECATED)
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף מחייב בכל המסמכים הרלוונטיים:

- **No Escrow** לקופון (מקדמה באתר לפלטפורמה; יתרה בבית העסק; אין נאמן/J5 של חברת אשראי; אין held לספק)
- **`platform_percent` דינמי פר מוצר** לפיזי (בלי default גלובלי; snapshot ב-`order_items`)
- ארנק פנימי בלי משיכה החוצה
- מיגרציות prod דרך MCP בלבד

מקור הכרעות כסף: `docs/CONTRADICTIONS.md` (C11א / No Escrow מ-2026-08-06 דורס את C11ב מ-27.07).

מסמכים קשורים:

```
docs/ROADMAP-V2.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/RUNBOOK-PRODUCTION.md
docs/BUSINESS-MODEL.md
```

---

## סטטוס QA לחבילת 20 (ROADMAP-V2)

QA audit: **2026-08-07** (אחרי QA final). כל שורה = **QA-PASS**.
מודל מחייב: **No Escrow** (אין נאמן/J5 של חברת אשראי; אין held לספק) + `platform_percent` דינמי פר מוצר (בלי default) + קישורים הדדיים + RTL (בלי em/en-dash / minus יוניקוד).

| # | מסמך | סטטוס | כסף | קישורים | RTL |
|---:|---|---|---|---|---|
| 1 | `ARCHITECTURE-SUPPLIER-ONBOARDING.md` | **QA-PASS** | O8 No Escrow + percent | PASS (+ PRICING + CONTRADICTIONS) | PASS |
| 2 | `ARCHITECTURE-ANALYTICS.md` | **QA-PASS** | ledger + percent; לא GA4 | PASS (+ OBSERVABILITY + CONTRADICTIONS) | PASS |
| 3 | `ARCHITECTURE-LEGAL-COMPLIANCE.md` | **QA-PASS** | L8 No Escrow; 5%/100 = דמי ביטול בלבד | PASS (+ PRICING + GDPR + CONTRADICTIONS) | PASS |
| 4 | `ARCHITECTURE-SEARCH-UX.md` | **QA-PASS** | בלי boost עמלה קבועה | PASS (+ PRICING + CONTRADICTIONS) | PASS |
| 5 | `RUNBOOK-PRODUCTION.md` | **QA-PASS** | smoke: No Escrow + percent | PASS (+ PRICING + CONTRADICTIONS) | PASS |
| 6 | `ARCHITECTURE-EMAIL-TEMPLATES.md` | **QA-PASS** | אסור Escrow/נאמן/J5 | PASS (+ SEASONAL + PRICING + CONTRADICTIONS) | PASS |
| 7 | `ARCHITECTURE-INVENTORY.md` | **QA-PASS** | I6/I7 No Escrow + מכסת מתנה | PASS (+ GIFT + CONTRADICTIONS) | PASS |
| 8 | `ARCHITECTURE-REFERRAL.md` | **QA-PASS** | R7 ארנק פנימי; לא Escrow | PASS (+ PRICING + CONTRADICTIONS) | PASS |
| 9 | `ARCHITECTURE-OBSERVABILITY.md` | **QA-PASS** | OBS8: אסור מדדי Escrow | PASS (+ ANALYTICS + CONTRADICTIONS) | PASS |
| 10 | `ROADMAP-V2.md` | **QA-PASS** | No Escrow מפורש | PASS (+ MASTER-INDEX + CONTRADICTIONS) | PASS |
| 11 | `ARCHITECTURE-CATEGORIES-TAXONOMY.md` | **QA-PASS** | T7: קטגוריה בלי עמלה/Escrow | PASS (+ PRICING + CONTRADICTIONS) | PASS |
| 12 | `ARCHITECTURE-PRICING-RULES.md` | **QA-PASS** | מקור האמת ל-percent (P1-P3) | PASS (+ SUPPORT + REFERRAL + EMAIL + CONTRADICTIONS) | PASS |
| 13 | `ARCHITECTURE-CUSTOMER-SUPPORT.md` | **QA-PASS** | S7 No Escrow + יישור LEGAL | PASS (+ PRICING + CONTRADICTIONS) | PASS |
| 14 | `ARCHITECTURE-BACKUP-DR.md` | **QA-PASS** | B6: שחזור בלי Escrow | PASS (+ RUNBOOK + CONTRADICTIONS) | PASS |
| 15 | `ARCHITECTURE-APP-STORE-LAUNCH.md` | **QA-PASS** | AS7 No Escrow + percent | PASS (+ PRICING + CONTRADICTIONS) | PASS |
| 16 | `ARCHITECTURE-GIFT-COUPONS.md` | **QA-PASS** | G1/G8 No Escrow | PASS (+ INVENTORY + CONTRADICTIONS) | PASS |
| 17 | `ARCHITECTURE-B2B-SALES.md` | **QA-PASS** | B4/B7 percent + No Escrow | PASS (+ PRICING + CONTRADICTIONS) | PASS |
| 18 | `ARCHITECTURE-SEASONAL-CAMPAIGNS.md` | **QA-PASS** | S7 percent + No Escrow | PASS (+ EMAIL + CONTRADICTIONS) | PASS |
| 19 | `ARCHITECTURE-DATA-EXPORT-GDPR.md` | **QA-PASS** | D8 ייצוא snapshots בלי Escrow | PASS (+ PRICING + LEGAL + CONTRADICTIONS) | PASS |
| 20 | `MASTER-INDEX.md` | **QA-PASS** | מודל מחייב למעלה | PASS | PASS |

תיקוני audit (07.08): P3 ASCII; AS7; OBS8; B6; T7; D8; EMAIL↔PRICING.

תיקון סתירה מחוץ לחבילה (QA 06.08): `ARCHITECTURE-PERSONAL-AREA.md` P7 מ-Escrow/held ל-No Escrow.

תיקון סתירה קריטי (QA 07.08): `CONTRADICTIONS.md` עודכן מ-C11ב (Escrow) ל-**C11א / No Escrow**, כדי שלא ידרוס את חבילת ה-20.

Verify (QA 07.08): סריקה חוזרת על כל ה-20; S7 ב-CUSTOMER-SUPPORT + קישור הדדי ל-PRICING.

QA final (07.08): קישורים הדדיים GIFT↔INVENTORY, EMAIL↔SEASONAL, ANALYTICS↔OBSERVABILITY, REFERRAL↔PRICING; בוטל working-tree שגוי שמחק O8/L8/S7.

~~מסמכים ישנים עם באנר CONTRADICTIONS / עמלה קבועה 10%/5% נשארים **STALE** עד ריענון נפרד~~
**הריענון הזה בוצע 2026-08-06. אין יותר מסמך STALE.**

## סבב STALE, 2026-08-06

שבעת המסמכים שנשארו מחוץ לחבילת 20. הבאנר האחיד שלהם ("גובר עליו
CONTRADICTIONS, כל מספר עמלה כאן הוא שריד") הוסר מכולם, כי הוא ביקש מהקורא
לנחש איזו שורה מתה במקום לומר. מה שנמצא בפועל:

| מסמך | מה היה | מה נעשה |
|---|---|---|
| `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | הנוסחה נכונה, ההערות שלצידה קראו לה "the 10%" / "the 90%"; סעיף 14 החזיק שש שאלות פתוחות שכולן הוכרעו, שתיים מהן **הפוך** | ההערות תוקנו; סעיף 14 נכתב מחדש כיומן הכרעות, עם D3 וזנב D6 כפתוחים היחידים |
| `ARCHITECTURE-COMMERCE.md` | **לא היה STALE.** C1-C10 כבר משולבים בגוף, O1 מסומן CLOSED | הבאנר השגוי הוסר; נרשם הפער האמיתי היחיד: כל ה-DDL ב-`numeric(12,2)` שקלים מול כלל האגורות |
| `ARCHITECTURE-ANALYTICS-BI.md` | "הלקוח משלם 10 אחוז באתר ו-90 בעסק" | תוקן ל-`coupon_price` פר מוצר; נוסף שהכנסת פלטפורמה נקראת מהשורה ולא נגזרת |
| `ARCHITECTURE-TESTING-CICD.md` | ‏10/90; תרחיש E2E שדורש **גוף webhook חתום** (אין חתימה ל-Cardcom); "escrow is held" בסיום; רצפת כיסוי 95% על `escrow.ts` **שאינו קיים** | ארבעתם תוקנו |
| `ARCHITECTURE-API-CONTRACTS.md` | ‏API-11 שולל מספרים קבועים ואז מנסח שרשרת נפילה ל-10; שתי סכמות zod עם `.default(10)` | השרשרת הוסרה; ה-default הוחלף בשדה הצעה nullable |
| `MASTER-ARCHITECTURE.md` | ‏1.4 (`platform_percent` nullable + fallback) ו-1.11 ("ברירת מחדל: `suppliers.commission_percent`") כתובות כהכרעות תקפות | שתיהן סומנו כבוטלות במקום, עם ההכרעה והמיגרציה שנשאה אותה |
| `ARCHITECTURE-CATALOG-SEARCH-SEO.md` | דירוג לפי `0.10 * margin` עם `coalesce(platform_percent, 10)` | **סתירה חזיתית מול `ARCHITECTURE-SEARCH-UX.md` (QA-PASS #4)**; הוכרעה לטובת ה-UX, איבר המרג'ין הוסר |

בנוסף, מחוץ לשבעה: `ARCHITECTURE-GROWTH-SEO.md` (היה REVIEW) - נימוק הקאשבק
לפיזי נשען על פיצול 10/90 שאינו קיים; תוקן, והתקרה של 25% מהעמלה נרשמה כמגן
היחיד בפועל.

**שני ממצאים שהם קוד ולא תיעוד**, נרשמים כאן ושייכים לסוכן שעל main:
‏`vitest.config.ts` מחזיק רצפת כיסוי על `src/server/domain/orders/escrow.ts`
שאינו קיים, ו-`payout_statements` + ה-RPC `generate_payout_statement` אינם
קיימים בפרודקשן בזמן ש-`admin/payouts.ts` קורא לשניהם.

---

## אינדקס לפי נושא (סופי)

ניווט מומלץ למפתח חדש:

```
docs/ONBOARDING-DEVELOPER.md
```

### 0. כניסה והכרעות

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ONBOARDING-DEVELOPER.md` | מדריך מפתח: מבנה, ברזל, הרצה, PR. | GUIDE (10.08) |
| `PROGRESS-REPORT-AUG.md` | דוח מנהלים אוגוסט: סבב 20 מסמכים, חסמים, שבוע קרוב. | REPORT (11.08) |
| `MASTER-INDEX.md` | אינדקס זה. | QA-PASS (#20) |
| `CONTRADICTIONS.md` | No Escrow (C11א), `platform_percent` פר מוצר. | BINDING (07.08) |
| `BUSINESS-MODEL.md` | מחיר קופון באתר + יתרה בעסק. | BINDING |
| `MASTER-ARCHITECTURE.md` | מסמך הכרעות; 1.4/1.11 בוטלות. | QA-PASS (06.08) |
| `ROADMAP-V2.md` | שלבים ותלויות לחבילת docs. | QA-PASS (#10) |
| `V2-VISION.md` | חזון אסטרטגי: ML, מכרזים, live, גיימיפיקציה. | VISION (10.08) |
| `CHANGELOG.md` | יומן שינויים. | LIVE |
| `GAPS-CODE-VS-DOCS.md` | ביקורת קוד מול מסמכים. | AUDIT (07.08) |

### 1. כסף, checkout, תשלומים, ארנק

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ARCHITECTURE-PRICING-RULES.md` | מקור האמת ל-percent / בזק / הנחות. | QA-PASS (#12) |
| `ARCHITECTURE-COMMERCE.md` | כללי מסחר C1-C10. | QA-PASS (06.08) |
| `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | checkout/מימוש; יומן D1-D6. | QA-PASS (06.08) |
| `CHECKOUT-OPTIMIZATION.md` | זרימת Cardcom, כשלים, retry + משפך/A/B. | PLAN (11.08) |
| `ARCHITECTURE-SUBSCRIPTIONS.md` | מנוי חודשי: Token, מחזור, retry, ביטול, ledger. | BINDING (11.08) |
| `SUBSCRIPTIONS-BILLING-SPEC.md` | סיכום מוצר מנויים (מפנה לארכיטקטורה). | SPEC (11.08) |
| `GUEST-VS-MEMBER-STRATEGY.md` | מתי דוחפים הרשמה ומתי לא. | PLAN (10.08) |
| `CARDCOM-ARCHITECTURE.md` | Cardcom (מחקר v11; קוד legacy). | BINDING + QA (07.08) |
| `PAYOUT-ARCHITECTURE.md` | מסמך קנוני: TransferFromDigitalBank, statements, T+3, reconcile. | BINDING (11.08) |
| `ARCHITECTURE-PAYOUT-MECHANISM.md` | באצ'/סכימה מפורטת; ביצוע קנוני ב-PAYOUT-ARCHITECTURE. | BINDING (10.08) |
| `VENDOR-PAYOUT-SPEC.md` | Payout פיזי אחרי Cardcom: באצ'+העברה בנקאית. | SPEC (11.08) |
| `ARCHITECTURE-CASHBACK-WALLET.md` | ארנק פנימי באגורות. | BINDING |
| `CASHBACK-WALLET-SPEC.md` | מפרט מוצר לארנק קאשבק (earn/spend UI). | SPEC (11.08) |
| `ARCHITECTURE-WALLET-LEDGER.md` | ledger כפול-רישום. | BINDING |
| `ARCHITECTURE-WALLET-INTEGER.md` | תכנית money-integer + SEC-WALLET. | BINDING (11.08) |
| `ARCHITECTURE-ACCOUNT-WALLET.md` | תכנון/יישום ארנק חשבון. | DESIGN |
| `PRODUCT-FIELDS-RESEARCH.md` | שדות מוצר, agorot, No Escrow. | BINDING (10.08) |

### 2. קופונים, מימוש, מלאי, ספקים

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ARCHITECTURE-COUPON-REDEMPTION.md` | מימוש אצל ספק (scan). | BINDING |
| `COUPON-LIFECYCLE-SPEC.md` | מכונת מצבים issued/redeemed/expired/refunded. | SPEC (11.08) |
| `ARCHITECTURE-COUPON-REDEMPTION-UX.md` | UX מימוש. | BINDING |
| `ARCHITECTURE-SUPPLIER-REDEMPTION.md` | תכנון מימוש ספק. | DESIGN |
| `ARCHITECTURE-INVENTORY.md` | מכסות ומלאי קופונים. | QA-PASS (#7) |
| `ARCHITECTURE-GIFT-COUPONS.md` | קופון מתנה. | QA-PASS (#16) |
| `ARCHITECTURE-SUPPLIER-ONBOARDING.md` | בקשת ספק, אישור אדמין, Cardcom checklist, הסכם פיצול **פר מוצר בלבד** (אין תעריף ספק), מודל חוזה. | QA-PASS (#1) · רענון 11.08 |
| `SUPPLIER-ONBOARDING.md` | מדריך צירוף ספק. | GUIDE (10.08) |
| `SEED-SUPPLIERS-SPEC.md` | מיפוי ספקים מ-WP: geo, שעות, WhatsApp, ולידציה. | SPEC (11.08) |
| `SUPPLIER-QUALITY-PROGRAM.md` | איכות ספקים: NPS פנימי, השעיה, boost חינם. | PLAN (10.08) |
| `FEATURED-DEALS-PRICING.md` | תמחור קידום דילים (מודל עתידי). | PLAN (10.08) |
| `ARCHITECTURE-SUPPLIER-PORTAL.md` | פורטל ספק. | BINDING |
| `SUPPLIER-AGREEMENT-DRAFT.md` | טיוטת הסכם. לא ייעוץ משפטי. | DRAFT |
| `LEGAL-TERMS-SUPPLIERS.md` | הסכם ספקים בעברית (טיוטה; דורש עו״ד). | DRAFT (11.08) |
| `ARCHITECTURE-FRAUD-PREVENTION.md` | כפילות, QR, chargeback, velocity. | BINDING |
| `FRAUD-PREVENTION-SPEC.md` | מפרט הונאה: משטחים, velocity, review. | SPEC (11.08) |
| `ARCHITECTURE-B2B-SALES.md` | מכירה בכמות לוועדים. | QA-PASS (#17) |

### 3. קטלוג, חיפוש, SEO, עיצוב חנות

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ARCHITECTURE-CATEGORIES-TAXONOMY.md` | עץ קטגוריות ישראלי (הכרעות; עומק 2 ב-DB). | QA-PASS (#11) |
| `CATEGORY-TAXONOMY.md` | עץ מלא 3 רמות + מיפוי slugs קיימים ב-DB. | CONTENT (10.08) |
| `ARCHITECTURE-SEARCH.md` | חיפוש + DLQ. | BINDING |
| `ARCHITECTURE-SEARCH-UX.md` | Meilisearch, השלמות, כתיב. | QA-PASS (#4) |
| `ARCHITECTURE-CATALOG-SEARCH-SEO.md` | קטלוג/דירוג בלי מרג'ין. | QA-PASS (06.08) |
| `ARCHITECTURE-SEO-PERFORMANCE.md` | metadata Next 15+, hreflang he-IL, JSON-LD Product/Offer/LocalBusiness, sitemap לפי קטגוריה, CWV+layout @ 380/768 refs, seo_redirects (030). | BINDING (11.08) |
| `ARCHITECTURE-SEO.md` | תכנון SEO. | DESIGN |
| `ARCHITECTURE-GROWTH-SEO.md` | צמיחה + SEO. | QA-PASS (06.08) |
| `ARCHITECTURE-PERFORMANCE.md` | ביצועים. | DESIGN |
| `PERFORMANCE-BUDGET.md` | תקציבי CWV ומשקל עמוד לחנות. | BINDING (11.08) |
| `DESIGN-CHECKLIST-FINAL.md` | צ'קליסט מול electro home-v7. | BINDING (10.08) |
| (root) `DESIGN-MEASURED.md` | מדידות צבע/טיפוגרפיה/ריווח (בעיקר desktop/LIVE). | BINDING measured |
| (refs) `electro-measurements-380.md` | box model pixel-exact home-v7 @ 380×667 (JSON). | REF (11.08) |
| (refs) `electro-measurements-768.md` | box model pixel-exact home-v7 @ 768×1024 (JSON). | REF (11.08) |
| (refs) `electro-components-map.md` | מיפוי → Header/HeroSlider/ProductCard/DealsRow/CategoryStrip/BrandsCarousel/Footer + 20 px discrepancies. | REF (11.08) |
| (refs) `electro-design-discrepancies.md` | 20 פערים מול DESIGN-MEASURED / ELECTRO_HERO; הקובץ `electro.madrasthemes.com-DESIGN.md` חסר. | REF (11.08) |
| `PHASE2-3-SPEC.md` | וריאנטים + SEO + תגיות. | BINDING (10.08) |
| `CITY-LANDING-CONTENT.md` | SEO ל-15 ערי ישראל: title/meta/פתיחה. | CONTENT (10.08) |
| `GEO-FEATURES-SPEC.md` | מיקום, עיר, near/radius, פרטיות. | SPEC (11.08) |
| `SEO-CONTENT-STRATEGY.md` | אסטרטגיית תוכן SEO בעברית. | STRATEGY (11.08) |

### 4. חשבון לקוח, תמיכה, תוכן

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ARCHITECTURE-PERSONAL-AREA.md` | אזור אישי (No Escrow). | BINDING |
| `ARCHITECTURE-ACCOUNT-IDENTITY.md` | זהות חשבון. | DESIGN |
| `ARCHITECTURE-CUSTOMER-SUPPORT.md` | פניות ו-SLA. | QA-PASS (#13) |
| `CUSTOMER-SUPPORT-PLAYBOOK.md` | תסריטי מענה בעברית (כולל תשלום/אורח). | PLAYBOOK (11.08) |
| `SUPPORT-SLA-POLICY.md` | מדרג פניות, שעות, אסקלציה, נוסח מחוץ לשעות. | POLICY (10.08) |
| `DISPUTE-RESOLUTION.md` | מחלוקות מימוש; נטל ראיה אצל ספק. | RUNBOOK (10.08) |
| `FAQ-CONTENT.md` | 20 שאלות לעמוד FAQ. | CONTENT (10.08) |
| `CONTENT-PLAYBOOK.md` | כתיבת דיל בעברית. | PLAYBOOK |
| `ARCHITECTURE-EMAIL-TEMPLATES.md` | תבניות Resend RTL. | QA-PASS (#6) |
| `EMAIL-TEMPLATES-COPY.md` | נוסח מלא בעברית (נושא+גוף+CTA) ל-8 מיילים. | CONTENT (10.08) |
| `EMAIL-TEMPLATES-SPEC.md` | מפרט Resend: kind, RTL, acceptance. | SPEC (11.08) |

### 5. אדמין

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ARCHITECTURE-ADMIN-DASHBOARD.md` | דשבורד אדמין + percent. | BINDING |
| `ADMIN-USER-GUIDE.md` | מדריך אדמין בעברית. | GUIDE (10.08) |
| `ADMIN-PRODUCT-EDITOR-SPEC.md` | עורך מוצר: 3 מצבים, ולידציות, RTL. | SPEC (11.08) |

### 6. אנליטיקה, צמיחה, שיווק, קמפיינים

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ARCHITECTURE-ANALYTICS.md` | סכימת אירועים + envelope, KPIs ספק, דוחות הכנסה אדמין לפי platform_percent snapshot (+ SQL). | QA-PASS (#2) · רענון 11.08 |
| `ARCHITECTURE-ANALYTICS-BI.md` | אחסון אירועים / BI. | QA-PASS (06.08) |
| `ANALYTICS-SPEC.md` | אירועים, GA4/Meta, Consent, KPI מוצר. | BINDING (11.08) |
| `ARCHITECTURE-REFERRAL.md` | חבר מביא חבר (מחייב). | QA-PASS (#8) |
| `REFERRAL-PROGRAM.md` | אנטי-fraud מעל referral. | PLAN (10.08) |
| `ARCHITECTURE-SEASONAL-CAMPAIGNS.md` | חגים / בזק (מחייב). | QA-PASS (#18) |
| `SEASONAL-CAMPAIGNS.md` | באנרים, קולקציות, countdown. | PLAN (10.08) |
| `MARKETING-LAUNCH.md` | שיווק השקה + UTM. | PLAN (10.08) |
| `MARKETING-LAUNCH-PLAN.md` | תוכנית השקה שיווקית: קהל, תקציב, שערי עצירה. | PLAN (11.08) |
| `ARCHITECTURE-NOTIFICATIONS.md` | outbox 095 + fn_enqueue_notification; Resend RTL / push_tokens / in-app; retry+DLQ; No Escrow+agorot. | BINDING (11.08) |
| `WHATSAPP-BUSINESS-SETUP.md` | הקמת WhatsApp Business API + תבניות. | GUIDE (10.08) |
| `WHATSAPP-COMMERCE-SPEC.md` | מסחר/תמיכה ב-WA: opt-in, תבניות, בלי סליקה בצ׳אט. | SPEC (11.08) |
| `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` | שיווק התראות. | DESIGN |

### 7. אבטחה, פרטיות, משפט

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ARCHITECTURE-SECURITY.md` | Security ADR. | BINDING |
| `ARCHITECTURE-SECURITY-RLS.md` | מטריצת RLS. | BINDING |
| `ARCHITECTURE-TRUST-SAFETY.md` | RL לפי endpoint, אנטרופיית שובר, abuse סורק, audit אדמין, צ'קליסט RLS. | BINDING (11.08) |
| `ARCHITECTURE-LEGAL-COMPLIANCE.md` | צרכן, 14 יום, נגישות. | QA-PASS (#3) |
| `REFUNDS-CANCELLATION-POLICY.md` | מדיניות ביטולים/החזרים (הגנת הצרכן). | DRAFT (11.08) |
| `ARCHITECTURE-REFUNDS-DISPUTES.md` | החזר קופון לפני/אחרי redeem, פיזי 14 יום, ledger reversal (אין Escrow), Cardcom refund, dispute SM. | BINDING (11.08) |
| `ARCHITECTURE-DATA-EXPORT-GDPR.md` | ייצוא/מחיקה. | QA-PASS (#19) |
| `DATA-RETENTION-POLICY.md` | משכי שמירה; **דורש עו״ד**. | DRAFT (11.08) |
| `SECURITY-AUDIT-CHECKLIST.md` | צ׳קליסט ביקורת אבטחה לפני/אחרי השקה. | CHECKLIST (11.08) |

### 8. תשתית, תפעול, תצפית, גיבוי

| מסמך | תקציר | סטטוס |
|---|---|---|
| `RUNBOOK-PRODUCTION.md` | Deploy, rollback, **MCP migrations**. | QA-PASS (#5) |
| `RUNBOOK-LAUNCH-DAY.md` | יום השקה. | ACTIONABLE (10.08) |
| `LAUNCH-WEEK-RUNBOOK.md` | שבוע השקה D-2 עד D+7: שערי עצירה ותפעול. | RUNBOOK (11.08) |
| `ARCHITECTURE-OBSERVABILITY.md` | Sentry boundaries לפי route group, לוגים מובנים, התראות webhook Cardcom, דשבורד reconciliation על `settlement_events`, uptime. | BINDING + QA-PASS (#9) (11.08) |
| `SLA-MONITORING.md` | זמינות + מי מקבל התראה. | RUNBOOK (10.08) |
| `INCIDENT-PLAYBOOKS.md` | 6 תקריות תפעול. | RUNBOOK (10.08) |
| `INCIDENT-RESPONSE-RUNBOOK.md` | מסגרת IR: SEV, kill switch, postmortem. | RUNBOOK (11.08) |
| `ARCHITECTURE-BACKUP-DR.md` | גיבוי/PITR (מחייב). | QA-PASS (#14) |
| `BACKUP-RECOVERY.md` | RPO/RTO + תרגול. | RUNBOOK (10.08) |
| `BACKUP-RESTORE-RUNBOOK.md` | PITR Supabase + dump offsite + scratch. | RUNBOOK (11.08) |
| `ARCHITECTURE-PRODUCTION-OPS.md` | תכנון תשתית. | DESIGN |
| `OPS-DAILY-ROUTINE.md` | שגרת בוקר. | RUNBOOK |
| `GITHUB-SETTINGS.md` | required checks. | ACTIONABLE |

### 9. השקה ואימות דילים

| מסמך | תקציר | סטטוס |
|---|---|---|
| `LAUNCH-CHECKLIST.md` | עלייה לאוויר לפי בעלות. | ACTIONABLE |
| `ARCHITECTURE-LAUNCH-CHECKLIST.md` | שערי ארכיטקטורה: Resend, Cardcom prod, Sentry, Vercel, backup, 10 קופונים. | ACTIONABLE (11.08) |
| `GO-LIVE-CHECKLIST.md` | שערי Go-Live: DNS/Vercel/Cardcom/PITR/דילים/Transfer payout. | ACTIONABLE (11.08) |
| `LAUNCH-VALIDATION.md` | אימות 10 דילי השקה מול פרוד. | ACTIONABLE (10.08) |
| `launch-week-plan.md` | 10 דילים + ספקים (seed). | PLAN (10.08) |

### 10. מובייל, PWA, אינטגרציות, API

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ARCHITECTURE-MOBILE-APP.md` | Expo super-app על backend Next משותף: Auth deep links, `push_tokens`, סריקת ספק+PIN (`115`), מטמון קופונים אופליין, RTL. | BINDING (11.08) |
| `ARCHITECTURE-MOBILE-SUPERAPP.md` | תכנון סופר-אפ. | DESIGN |
| `ARCHITECTURE-PWA.md` | manifest / SW / push. | BINDING |
| `ARCHITECTURE-APP-STORE-LAUNCH.md` | חנויות אפ. | QA-PASS (#15) |
| `ARCHITECTURE-INTEGRATIONS.md` | ורטיקלים פנימיים. | DESIGN (10.08) |
| `INTEGRATIONS-ROADMAP.md` | מפת דרכים לורטיקלים פנימיים (Wolt/Gett style). | ROADMAP (11.08) |
| `ARCHITECTURE-API-CONTRACTS.md` | חוזי API פנימיים. | QA-PASS (06.08) |
| `API-PUBLIC-SPEC.md` | API ציבורי עתידי לספקים. | DESIGN (10.08) |

### 11. בדיקות ואיכות קוד

| מסמך | תקציר | סטטוס |
|---|---|---|
| `TESTING-STRATEGY.md` | פירמידה + שערי merge (100% money/redeem). | BINDING (10.08) |
| `ARCHITECTURE-TESTING-QA.md` | פירמידה מונורפו: Vitest, integration על Supabase branch, Playwright E1–E4, CI matrix, coverage על קבצים ששונו. | BINDING (11.08) |
| `ARCHITECTURE-TESTING-CICD.md` | פירוט CI/CD וטסטים. | QA-PASS (06.08) |
| `CODE-REVIEW-CHECKLIST.md` | צ'קליסט PR: agorot, RLS, RTL, compare.mjs. | BINDING (10.08) |

### 12. AI, מיגרציית WP, שונות

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ARCHITECTURE-AI-AGENTS.md` | סוכני AI מתוכננים. | DESIGN |
| `ARCHITECTURE-AI-AGENTS-RUNTIME.md` | runtime לסוכנים. | DESIGN |
| `ARCHITECTURE-WP-DATA-MIGRATION.md` | מיגרציית WordPress. | DESIGN |

### 13. DEPRECATED / ארכיון (אל תממשו)

| מסמך | הוחלף ע״י | סטטוס |
|---|---|---|
| `ADMIN-ARCHITECTURE.md` | `ARCHITECTURE-ADMIN-DASHBOARD.md` + `ADMIN-USER-GUIDE.md` | DEPRECATED (10.08) |
| `TEST-STRATEGY.md` | `TESTING-STRATEGY.md` + `ARCHITECTURE-TESTING-CICD.md` | DEPRECATED (10.08) |

קבצי ארכיטקטורה ישנים **מחוץ** ל-`docs/` בשורש הריפו (למשל `CHECKOUT-ARCHITECTURE.md`, `LEDGER-DESIGN.md`) אינם חלק מהאינדקס המחייב; אל תסמכו עליהם מול CONTRADICTIONS.

## חבילת ROADMAP 1-20 (תזכורת)

| # | מסמך |
|---:|---|
| 1 עד 10 | onboarding → ROADMAP-V2 |
| 11 עד 15 | taxonomy → app-store |
| 16 עד 20 | gift → MASTER-INDEX |

ראה גם:

```
docs/ROADMAP-V2.md
```

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | יצירת MASTER-INDEX לכל מסמכי הארכיטקטורה |
| 2026-08-06 | QA pass: סטטוס לכל 20; מודל No Escrow + platform_percent; קישורים הדדיים |
| 2026-08-06 | סבב STALE: שבעה מסמכים + GROWTH-SEO. אין יותר STALE ב-`docs/` |
| 2026-08-07 | `GAPS-CODE-VS-DOCS.md`: ביקורת קוד מול מסמכים, שמונה פערים |
| 2026-08-07 | `GITHUB-SETTINGS.md` ו-`LAUNCH-CHECKLIST.md`: מה שאינו קוד |
| 2026-08-07 | QA למסלול הכסף: Cardcom (v11 מול legacy), ו-`voucher_redemptions` בשלושה מסמכים |
| 2026-08-07 | תפעול ותוכן: playbook, טיוטת הסכם, שגרה יומית. **G3 בוטל כממצא שגוי** |
| 2026-08-07 | `PAYOUT-ARCHITECTURE.md`: המנגנון החסר של G1, על `settlement_events` ולא על המנוע המת |
| 2026-08-07 | QA re-pass חבילת 20: CONTRADICTIONS→No Escrow; קישורים הדדיים; en-dash; סטטוס מעודכן |
| 2026-08-07 | QA verify: S7 SUPPORT; קישור הדדי PRICING↔SUPPORT; סטטוס #12/#13 מעודכן |
| 2026-08-07 | QA final חבילת 20: קישורים הדדיים + סטטוס מעודכן לכל #1 עד 20 |
| 2026-08-07 | QA audit: P3/AS7/OBS8/B6/T7/D8 + EMAIL↔PRICING; סטטוס לכל #1 עד 20 |
| 2026-08-10 | `ARCHITECTURE-PAYOUT-MECHANISM.md`: מנגנון payout פיזי מחייב (באצ' + העברה ידנית) |
| 2026-08-10 | `DESIGN-CHECKLIST-FINAL.md` + `PHASE2-3-SPEC.md` + אינדקס |
| 2026-08-10 | `LAUNCH-VALIDATION.md` + `launch-week-plan.md`: אימות 10 דילי השקה מול פרוד |
| 2026-08-10 | ריענון NOTIFICATIONS + SEO-PERFORMANCE (BINDING) |
| 2026-08-10 | MOBILE-APP + LAUNCH-VALIDATION re-verify + RUNBOOK-LAUNCH-DAY; אינדקס |
| 2026-08-10 | `ARCHITECTURE-INTEGRATIONS.md` + ריענון MOBILE-APP; אינדקס |
| `INTEGRATIONS-ROADMAP.md` | מפת דרכים לורטיקלים פנימיים (Wolt/Gett style). | ROADMAP (11.08) |
| 2026-08-10 | `ADMIN-USER-GUIDE.md` + `SUPPLIER-ONBOARDING.md`; אינדקס |
| 2026-08-10 | `MARKETING-LAUNCH.md` + `ANALYTICS-SPEC.md`; אינדקס |
| 2026-08-10 | `API-PUBLIC-SPEC.md`; אינדקס + ניקוי כפילויות companion |
| 2026-08-10 | `SEASONAL-CAMPAIGNS.md` + `REFERRAL-PROGRAM.md`; אינדקס |
| 2026-08-10 | `SLA-MONITORING.md` + `BACKUP-RECOVERY.md`; אינדקס |
| 2026-08-10 | `CUSTOMER-SUPPORT-PLAYBOOK.md` + `FAQ-CONTENT.md`; אינדקס |
| 2026-08-10 | `TESTING-STRATEGY.md` + `CODE-REVIEW-CHECKLIST.md`; אינדקס |
| 2026-08-10 | `INCIDENT-PLAYBOOKS.md`; אינדקס |
| 2026-08-10 | `DATA-RETENTION-POLICY.md`; אינדקס (דורש עו״ד) |
| 2026-08-10 | `ONBOARDING-DEVELOPER.md`; אינדקס סופי ממוין לפי נושא |
| 2026-08-10 | `CATEGORY-TAXONOMY.md`; אינדקס (עץ 3 רמות + DB) |
| 2026-08-10 | `EMAIL-TEMPLATES-COPY.md`; אינדקס |
| 2026-08-10 | `CITY-LANDING-CONTENT.md`; אינדקס |
| 2026-08-10 | `V2-VISION.md`; ניקוי DEPRECATED באינדקס + באנרים |
| 2026-08-10 | `SUPPLIER-QUALITY-PROGRAM.md` + `FEATURED-DEALS-PRICING.md`; אינדקס |
| 2026-08-10 | `PROGRESS-REPORT-AUG.md`; אינדקס |
| 2026-08-10 | `CHECKOUT-OPTIMIZATION.md` + `GUEST-VS-MEMBER-STRATEGY.md`; אינדקס |
| 2026-08-10 | `SUPPORT-SLA-POLICY.md` + `WHATSAPP-BUSINESS-SETUP.md`; אינדקס |
| 2026-08-11 | `CHECKOUT-OPTIMIZATION.md`: Cardcom flow + failures + retry |
| 2026-08-11 | `PAYOUT-ARCHITECTURE.md` BINDING מחדש (TransferFromDigitalBank) |
| 2026-08-11 | `ARCHITECTURE-SUBSCRIPTIONS.md`: מנוי חודשי Cardcom Recurring |
| 2026-08-11 | תור 35-38: subscriptions ledger, seed suppliers, product editor, wallet-integer |
| 2026-08-11 | תור notifications/seo/mobile/analytics: חיזוק CF Queue, JSON-LD, SecureStore, SQL revenue; תקצירי אינדקס |
| 2026-08-11 | תור onboarding/refunds/trust/launch: הסכם פר מוצר, disputes, trust&safety, שערי השקה; אינדקס |
| 2026-08-11 | refs electro 380/768 + components-map + design-discrepancies; אינדקס |
| 2026-08-11 | NOTIFICATIONS (outbox/push/in-app) + SEO-PERFORMANCE (hreflang/CWV 380/768/seo_redirects); אינדקס |
| 2026-08-11 | MOBILE-APP + TESTING-QA + OBSERVABILITY (audit→target→migration); תקצירי אינדקס |
