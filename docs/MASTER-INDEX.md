# אינדקס ראשי: מסמכי ארכיטקטורה

אינדקס כל מסמכי הארכיטקטורה ב-`docs/` עם שורת תקציר לכל אחד.

Status: **BINDING (index)** · עודכן: 2026-08-10 · QA: PASS (final)
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

## טבלת אינדקס מלאה

| מסמך | תקציר | סטטוס |
|---|---|---|
| `ADMIN-ARCHITECTURE.md` | KenyonExpress production admin dashboard architecture. | LEGACY |
| `ARCHITECTURE-ACCOUNT-IDENTITY.md` | מסמך תכנון. מיגרציה נלווית (טיוטה, לא הוחלה). | DESIGN |
| `ARCHITECTURE-ACCOUNT-WALLET.md` | סטטוס: DESIGN + IMPLEMENTATION. ענף feat/account-wallet. | DESIGN |
| `ARCHITECTURE-ADMIN-DASHBOARD.md` | ניהול מוצרים עם platform_percent דינמי פר מוצר, מחיר קופון, יתרה אצל הספק (בבית העסק). | BINDING |
| `ARCHITECTURE-AI-AGENTS-RUNTIME.md` | טיוטה מחייבת v2.0 (2026-07-17). | DESIGN |
| `ARCHITECTURE-AI-AGENTS.md` | five planned AI agents and shared infrastructure. | DESIGN |
| `ARCHITECTURE-ANALYTICS-BI.md` | משפך ואחסון אירועים; הכנסת פלטפורמה נקראת מהשורה. | QA-PASS (06.08) |
| `ARCHITECTURE-ANALYTICS.md` | משפך מצפייה בדיל עד מימוש. PostHog + GA4. | QA-PASS (#2) |
| `ARCHITECTURE-API-CONTRACTS.md` | חוזי API; בלי ברירת מחדל לעמלה בשום סכמה. | QA-PASS (06.08) |
| `ARCHITECTURE-APP-STORE-LAUNCH.md` | הכנה לפרסום ב-App Store ו-Google Play. | QA-PASS (#15) |
| `ARCHITECTURE-B2B-SALES.md` | מכירת קופונים בכמות לחברות וועדי עובדים. | QA-PASS (#17) |
| `ARCHITECTURE-BACKUP-DR.md` | גיבויים, PITR, ושחזור Supabase. | QA-PASS (#14) |
| `ARCHITECTURE-CASHBACK-WALLET.md` | ארנק פנימי בלבד; ledger כפול-רישום באגורות. | BINDING |
| `ARCHITECTURE-CATALOG-SEARCH-SEO.md` | קטלוג וחיפוש; דירוג בלי מרג'ין (יושר ל-SEARCH-UX). | QA-PASS (06.08) |
| `ARCHITECTURE-CATEGORIES-TAXONOMY.md` | עץ קטגוריות לשוק הישראלי. | QA-PASS (#11) |
| `ARCHITECTURE-COMMERCE.md` | כללי מסחר; C1-C10 משולבים. DDL עדיין בשקלים. | QA-PASS (06.08) |
| `ARCHITECTURE-COUPON-REDEMPTION-UX.md` | מפרט UX מחייב למימוש קופון. | BINDING |
| `ARCHITECTURE-COUPON-REDEMPTION.md` | Supplier coupon / voucher redemption (scan). | BINDING |
| `ARCHITECTURE-CUSTOMER-SUPPORT.md` | פניות לקוח, מימוש, SLA. | QA-PASS (#13) |
| `ARCHITECTURE-DATA-EXPORT-GDPR.md` | ייצוא ומחיקת נתוני משתמש. | QA-PASS (#19) |
| `ARCHITECTURE-EMAIL-TEMPLATES.md` | תבניות RTL לכל אירוע קופון (Resend). | QA-PASS (#6) |
| `ARCHITECTURE-FRAUD-PREVENTION.md` | מימוש כפול, QR, chargebacks, velocity. | BINDING |
| `ARCHITECTURE-GIFT-COUPONS.md` | קופון מתנה: בעלות, ברכות, claim. | QA-PASS (#16) |
| `ARCHITECTURE-GROWTH-SEO.md` | הכרעות SEO/צמיחה; נימוק הקאשבק תוקן. | QA-PASS (06.08) |
| `ARCHITECTURE-INVENTORY.md` | מלאי קופונים ומכסות פר דיל. | QA-PASS (#7) |
| `ARCHITECTURE-LEGAL-COMPLIANCE.md` | הגנת הצרכן, 14 יום, דמי ביטול, נגישות. | QA-PASS (#3) |
| `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | checkout/מימוש; יומן הכרעות D1-D6. | QA-PASS (06.08) |
| `ARCHITECTURE-MOBILE-APP.md` | Expo RN: shared packages, deep links, push, סריקת ספק. | BINDING (10.08) |
| `ARCHITECTURE-MOBILE-SUPERAPP.md` | תכנון מחייב 2026-07-17. | DESIGN |
| `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` | מסמך תכנון שיווק. | DESIGN |
| `ARCHITECTURE-NOTIFICATIONS.md` | התראות: paid/redeem/supplier/cashback/abandon + QStash DLQ. | BINDING (10.08) |
| `ARCHITECTURE-OBSERVABILITY.md` | Sentry, לוגים, התראות תפעול. | QA-PASS (#9) |
| `ARCHITECTURE-PERFORMANCE.md` | Owner: Performance Architect | DESIGN |
| `ARCHITECTURE-PERSONAL-AREA.md` | אזור אישי (P7 מיושר ל-No Escrow ב-QA). | BINDING |
| `ARCHITECTURE-PAYOUT-MECHANISM.md` | תשלום ספק פיזי: T+N + שער משלוח, באצ', העברה ידנית+CSV. | BINDING (10.08) |
| `ARCHITECTURE-PRICING-RULES.md` | platform_percent דינמי פר מוצר, בזק, הנחות. | QA-PASS (#12) |
| `ARCHITECTURE-PRODUCTION-OPS.md` | תכנון תשתית. | DESIGN |
| `ARCHITECTURE-PWA.md` | PWA: manifest, SW, push. | BINDING |
| `ARCHITECTURE-REFERRAL.md` | חבר מביא חבר + קאשבק פנימי. | QA-PASS (#8) |
| `ARCHITECTURE-SEARCH-UX.md` | Meilisearch, השלמות, טעויות כתיב. | QA-PASS (#4) |
| `ARCHITECTURE-SEARCH.md` | חיפוש קטלוג בעברית + DLQ. | BINDING |
| `ARCHITECTURE-SEASONAL-CAMPAIGNS.md` | חגים ישראליים, בזק, ראש השנה/פסח. | QA-PASS (#18) |
| `ARCHITECTURE-SECURITY-RLS.md` | מטריצת RLS ל-44 טבלאות. | BINDING |
| `ARCHITECTURE-SECURITY.md` | Security decision record. | BINDING |
| `ARCHITECTURE-SEO-PERFORMANCE.md` | SEO+ביצועים: metadata, JSON-LD, sitemap, CWV, ISR. | BINDING (10.08) |
| `ARCHITECTURE-SEO.md` | תכנון SEO מלא 2026-07-23. | DESIGN |
| `ARCHITECTURE-SUPPLIER-ONBOARDING.md` | הצטרפות ספק, בנק, סניפים, עובדים. | QA-PASS (#1) |
| `ARCHITECTURE-SUPPLIER-PORTAL.md` | פורטל ספק (No Escrow). | BINDING |
| `ARCHITECTURE-SUPPLIER-REDEMPTION.md` | תכנון מימוש ספק. | DESIGN |
| `ARCHITECTURE-TESTING-CICD.md` | פירמידת טסטים ו-CI; בלי webhook חתום ובלי escrow. | QA-PASS (06.08) |
| `ARCHITECTURE-WALLET-LEDGER.md` | ledger כפול-רישום באגורות. | BINDING |
| `ARCHITECTURE-WP-DATA-MIGRATION.md` | מיגרציית WordPress. | DESIGN |
| `BUSINESS-MODEL.md` | מודל עסקי: מחיר קופון באתר + יתרה בעסק. | BINDING |
| `CARDCOM-ARCHITECTURE.md` | ארכיטקטורת Cardcom. מחקר v11; הקוד legacy. | BINDING + QA (07.08) |
| `CHANGELOG.md` | יומן שינויים. | LIVE |
| `CONTRADICTIONS.md` | הכרעות כסף סופיות: No Escrow (C11א), `platform_percent` פר מוצר. | BINDING (07.08) |
| `MASTER-ARCHITECTURE.md` | מסמך ההכרעות; 1.4 ו-1.11 מסומנות כבוטלות. | QA-PASS (06.08) |
| `GAPS-CODE-VS-DOCS.md` | ביקורת קוד מול מסמכים: payments/coupons/refund. | AUDIT (07.08) |
| `GITHUB-SETTINGS.md` | הגדרות GitHub ידניות: required checks, הסרת bypass. | ACTIONABLE (07.08) |
| `CONTENT-PLAYBOOK.md` | איך כותבים דיל בעברית; 5 דוגמאות מלאות. | PLAYBOOK (07.08) |
| `SUPPLIER-AGREEMENT-DRAFT.md` | טיוטת הסכם ספק. **לא ייעוץ משפטי.** | DRAFT (07.08) |
| `OPS-DAILY-ROUTINE.md` | שגרת בוקר 15 דקות, לפי סדר עלות. | RUNBOOK (07.08) |
| `OPS-RUNBOOK.md` | תפעול יומי אחרי השקה: reconcile, החזר, ספק, קופון תקוע. | RUNBOOK (10.08) |
| `LEGAL-CONTENT.md` | טיוטת תקנון/ביטולים/נגישות/עוגיות בעברית. **דורש עו"ד.** | DRAFT (10.08) |
| `PAYOUT-ARCHITECTURE.md` | תכנון ראשוני ל-G1; מחייב עכשיו: `ARCHITECTURE-PAYOUT-MECHANISM.md`. | DESIGN → superseded by BINDING (10.08) |
| `PRODUCT-FIELDS-RESEARCH.md` | מחקר שדות מוצר: דינמי פר מוצר, No Escrow, סכמה באגורות. | BINDING (10.08, v2) |
| `DESIGN-CHECKLIST-FINAL.md` | צ'קליסט עיצוב סופי מול electro home-v7 (6 דפים + tokens). | BINDING (10.08) |
| `PHASE2-3-SPEC.md` | וריאנטים + SEO + תגיות; agorot; No Escrow. | BINDING (10.08) |
| `LAUNCH-CHECKLIST.md` | עלייה לאוויר לפי בעלות: הקוד מול אופיר. | ACTIONABLE (07.08) |
| `LAUNCH-VALIDATION.md` | אימות 10 דילי השקה: 10× missing מול suppliers. | ACTIONABLE (10.08) |
| `launch-week-plan.md` | 10 דילי השקה + ספקים (מ-seed). | PLAN (10.08) |
| `ROADMAP-V2.md` | שלבים ותלויות לחבילת docs. | QA-PASS (#10) |
| `RUNBOOK-LAUNCH-DAY.md` | יום השקה: env, Cardcom, DNS, Sentry, rollback. | ACTIONABLE (10.08) |
| `RUNBOOK-PRODUCTION.md` | Deploy Vercel, rollback, MCP migrations. | QA-PASS (#5) |
| `TEST-STRATEGY.md` | פירמידת טסטים (כסף קודם). | BINDING |
| `MASTER-INDEX.md` | אינדקס זה. | QA-PASS (#20) |

---

## חבילות אחרונות (לניווט מהיר)

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
| 2026-08-10 | `LEGAL-CONTENT.md` + `OPS-RUNBOOK.md` + אינדקס |
| 2026-08-10 | `LAUNCH-VALIDATION.md` + `launch-week-plan.md`: אימות 10 דילי השקה מול פרוד |
| 2026-08-10 | ריענון NOTIFICATIONS + SEO-PERFORMANCE (BINDING) |
| 2026-08-10 | MOBILE-APP + LAUNCH-VALIDATION re-verify + RUNBOOK-LAUNCH-DAY; אינדקס |
