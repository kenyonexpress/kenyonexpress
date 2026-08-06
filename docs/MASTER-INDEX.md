# אינדקס ראשי: מסמכי ארכיטקטורה

אינדקס כל מסמכי הארכיטקטורה ב-`docs/` עם שורת תקציר לכל אחד.

Status: **BINDING (index)** · עודכן: 2026-08-06 · QA: PASS
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף מחייב בכל המסמכים הרלוונטיים:

- **No Escrow** לקופון (מקדמה באתר לפלטפורמה; יתרה בבית העסק; אין נאמן/J5 של חברת אשראי; אין held לספק)
- **`platform_percent` דינמי פר מוצר** לפיזי (בלי default גלובלי; snapshot ב-`order_items`)
- ארנק פנימי בלי משיכה החוצה
- מיגרציות prod דרך MCP בלבד

מסמכים קשורים:

```
docs/ROADMAP-V2.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/RUNBOOK-PRODUCTION.md
```

---

## סטטוס QA לחבילת 20 (ROADMAP-V2)

| # | מסמך | סטטוס | כסף | קישורים | RTL |
|---:|---|---|---|---|---|
| 1 | `ARCHITECTURE-SUPPLIER-ONBOARDING.md` | **QA-PASS** | No Escrow + `platform_percent` (O8) | PASS | PASS |
| 2 | `ARCHITECTURE-ANALYTICS.md` | **QA-PASS** | ledger בלבד; לא GA4 | PASS | PASS |
| 3 | `ARCHITECTURE-LEGAL-COMPLIANCE.md` | **QA-PASS** | L8 No Escrow; 5%/100 = דמי ביטול בלבד | PASS | PASS |
| 4 | `ARCHITECTURE-SEARCH-UX.md` | **QA-PASS** | בלי boost עמלה קבועה | PASS | PASS |
| 5 | `RUNBOOK-PRODUCTION.md` | **QA-PASS** | smoke: No Escrow + percent | PASS | PASS |
| 6 | `ARCHITECTURE-EMAIL-TEMPLATES.md` | **QA-PASS** | אסור נוסח Escrow/נאמן | PASS | PASS |
| 7 | `ARCHITECTURE-INVENTORY.md` | **QA-PASS** | I6 No Escrow | PASS | PASS |
| 8 | `ARCHITECTURE-REFERRAL.md` | **QA-PASS** | ארנק פנימי בלבד | PASS | PASS |
| 9 | `ARCHITECTURE-OBSERVABILITY.md` | **QA-PASS** | N/A (תפעול) | PASS | PASS |
| 10 | `ROADMAP-V2.md` | **QA-PASS** | No Escrow מפורש | PASS | PASS |
| 11 | `ARCHITECTURE-CATEGORIES-TAXONOMY.md` | **QA-PASS** | N/A (קטלוג) | PASS | PASS |
| 12 | `ARCHITECTURE-PRICING-RULES.md` | **QA-PASS** | מקור האמת ל-percent | PASS | PASS |
| 13 | `ARCHITECTURE-CUSTOMER-SUPPORT.md` | **QA-PASS** | יישור LEGAL | PASS | PASS |
| 14 | `ARCHITECTURE-BACKUP-DR.md` | **QA-PASS** | N/A (DR) | PASS | PASS |
| 15 | `ARCHITECTURE-APP-STORE-LAUNCH.md` | **QA-PASS** | דחיית מסכי Escrow/held | PASS | PASS |
| 16 | `ARCHITECTURE-GIFT-COUPONS.md` | **QA-PASS** | G1 No Escrow | PASS | PASS |
| 17 | `ARCHITECTURE-B2B-SALES.md` | **QA-PASS** | B4/B7 percent + No Escrow | PASS | PASS |
| 18 | `ARCHITECTURE-SEASONAL-CAMPAIGNS.md` | **QA-PASS** | S7 percent + No Escrow | PASS | PASS |
| 19 | `ARCHITECTURE-DATA-EXPORT-GDPR.md` | **QA-PASS** | N/A (פרטיות) | PASS | PASS |
| 20 | `MASTER-INDEX.md` | **QA-PASS** | מודל מחייב למעלה | PASS | PASS |

תיקון סתירה מחוץ לחבילה (באותו QA): `ARCHITECTURE-PERSONAL-AREA.md` P7 עודכן מ-Escrow/held ל-No Escrow.

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
| `ARCHITECTURE-MOBILE-APP.md` | Expo + React Native על אותו backend. | BINDING |
| `ARCHITECTURE-MOBILE-SUPERAPP.md` | תכנון מחייב 2026-07-17. | DESIGN |
| `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` | מסמך תכנון שיווק. | DESIGN |
| `ARCHITECTURE-NOTIFICATIONS.md` | התראות טרנזקציוניות (Resend/Edge/WA/SMS). | BINDING |
| `ARCHITECTURE-OBSERVABILITY.md` | Sentry, לוגים, התראות תפעול. | QA-PASS (#9) |
| `ARCHITECTURE-PERFORMANCE.md` | Owner: Performance Architect | DESIGN |
| `ARCHITECTURE-PERSONAL-AREA.md` | אזור אישי (P7 מיושר ל-No Escrow ב-QA). | BINDING |
| `ARCHITECTURE-PRICING-RULES.md` | platform_percent דינמי פר מוצר, בזק, הנחות. | QA-PASS (#12) |
| `ARCHITECTURE-PRODUCTION-OPS.md` | תכנון תשתית. | DESIGN |
| `ARCHITECTURE-PWA.md` | PWA: manifest, SW, push. | BINDING |
| `ARCHITECTURE-REFERRAL.md` | חבר מביא חבר + קאשבק פנימי. | QA-PASS (#8) |
| `ARCHITECTURE-SEARCH-UX.md` | Meilisearch, השלמות, טעויות כתיב. | QA-PASS (#4) |
| `ARCHITECTURE-SEARCH.md` | חיפוש קטלוג בעברית + DLQ. | BINDING |
| `ARCHITECTURE-SEASONAL-CAMPAIGNS.md` | חגים ישראליים, בזק, ראש השנה/פסח. | QA-PASS (#18) |
| `ARCHITECTURE-SECURITY-RLS.md` | מטריצת RLS ל-44 טבלאות. | BINDING |
| `ARCHITECTURE-SECURITY.md` | Security decision record. | BINDING |
| `ARCHITECTURE-SEO-PERFORMANCE.md` | SEO וביצועים (App Router). | BINDING |
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
| `MASTER-ARCHITECTURE.md` | מסמך ההכרעות; 1.4 ו-1.11 מסומנות כבוטלות. | QA-PASS (06.08) |
| `GAPS-CODE-VS-DOCS.md` | ביקורת קוד מול מסמכים: payments/coupons/refund. | AUDIT (07.08) |
| `GITHUB-SETTINGS.md` | הגדרות GitHub ידניות: required checks, הסרת bypass. | ACTIONABLE (07.08) |
| `CONTENT-PLAYBOOK.md` | איך כותבים דיל בעברית; 5 דוגמאות מלאות. | PLAYBOOK (07.08) |
| `SUPPLIER-AGREEMENT-DRAFT.md` | טיוטת הסכם ספק. **לא ייעוץ משפטי.** | DRAFT (07.08) |
| `OPS-DAILY-ROUTINE.md` | שגרת בוקר 15 דקות, לפי סדר עלות. | RUNBOOK (07.08) |
| `LAUNCH-CHECKLIST.md` | עלייה לאוויר לפי בעלות: הקוד מול אופיר. | ACTIONABLE (07.08) |
| `ROADMAP-V2.md` | שלבים ותלויות לחבילת docs. | QA-PASS (#10) |
| `RUNBOOK-PRODUCTION.md` | Deploy Vercel, rollback, MCP migrations. | QA-PASS (#5) |
| `TEST-STRATEGY.md` | פירמידת טסטים (כסף קודם). | BINDING |
| `MASTER-INDEX.md` | אינדקס זה. | QA-PASS (#20) |

---

## חבילות אחרונות (לניווט מהיר)

| # | מסמך |
|---:|---|
| 1–10 | onboarding → ROADMAP-V2 |
| 11–15 | taxonomy → app-store |
| 16–20 | gift → MASTER-INDEX |

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
