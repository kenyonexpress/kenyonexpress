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

מסמכים ישנים עם באנר CONTRADICTIONS / עמלה קבועה 10%/5% נשארים **STALE** עד ריענון נפרד (לא חלק מחבילת 20).

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
| `ARCHITECTURE-ANALYTICS-BI.md` | גובר עליו CONTRADICTIONS.md (עמלות ישנות). | STALE |
| `ARCHITECTURE-ANALYTICS.md` | משפך מצפייה בדיל עד מימוש. PostHog + GA4. | QA-PASS (#2) |
| `ARCHITECTURE-API-CONTRACTS.md` | גובר עליו CONTRADICTIONS.md. | STALE |
| `ARCHITECTURE-APP-STORE-LAUNCH.md` | הכנה לפרסום ב-App Store ו-Google Play. | QA-PASS (#15) |
| `ARCHITECTURE-B2B-SALES.md` | מכירת קופונים בכמות לחברות וועדי עובדים. | QA-PASS (#17) |
| `ARCHITECTURE-BACKUP-DR.md` | גיבויים, PITR, ושחזור Supabase. | QA-PASS (#14) |
| `ARCHITECTURE-CASHBACK-WALLET.md` | ארנק פנימי בלבד; ledger כפול-רישום באגורות. | BINDING |
| `ARCHITECTURE-CATALOG-SEARCH-SEO.md` | גובר עליו CONTRADICTIONS.md. | STALE |
| `ARCHITECTURE-CATEGORIES-TAXONOMY.md` | עץ קטגוריות לשוק הישראלי. | QA-PASS (#11) |
| `ARCHITECTURE-COMMERCE.md` | גובר עליו CONTRADICTIONS.md. | STALE |
| `ARCHITECTURE-COUPON-REDEMPTION-UX.md` | מפרט UX מחייב למימוש קופון. | BINDING |
| `ARCHITECTURE-COUPON-REDEMPTION.md` | Supplier coupon / voucher redemption (scan). | BINDING |
| `ARCHITECTURE-CUSTOMER-SUPPORT.md` | פניות לקוח, מימוש, SLA. | QA-PASS (#13) |
| `ARCHITECTURE-DATA-EXPORT-GDPR.md` | ייצוא ומחיקת נתוני משתמש. | QA-PASS (#19) |
| `ARCHITECTURE-EMAIL-TEMPLATES.md` | תבניות RTL לכל אירוע קופון (Resend). | QA-PASS (#6) |
| `ARCHITECTURE-FRAUD-PREVENTION.md` | מימוש כפול, QR, chargebacks, velocity. | BINDING |
| `ARCHITECTURE-GIFT-COUPONS.md` | קופון מתנה: בעלות, ברכות, claim. | QA-PASS (#16) |
| `ARCHITECTURE-GROWTH-SEO.md` | הכרעות SEO/צמיחה (ייתכן cashback ישן). | REVIEW |
| `ARCHITECTURE-INVENTORY.md` | מלאי קופונים ומכסות פר דיל. | QA-PASS (#7) |
| `ARCHITECTURE-LEGAL-COMPLIANCE.md` | הגנת הצרכן, 14 יום, דמי ביטול, נגישות. | QA-PASS (#3) |
| `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | טיוטת checkout ישנה (10%/escrow). | STALE |
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
| `ARCHITECTURE-TESTING-CICD.md` | גובר עליו CONTRADICTIONS.md. | STALE |
| `ARCHITECTURE-WALLET-LEDGER.md` | ledger כפול-רישום באגורות. | BINDING |
| `ARCHITECTURE-WP-DATA-MIGRATION.md` | מיגרציית WordPress. | DESIGN |
| `BUSINESS-MODEL.md` | מודל עסקי: מחיר קופון באתר + יתרה בעסק. | BINDING |
| `CARDCOM-ARCHITECTURE.md` | ארכיטקטורת Cardcom. | BINDING |
| `CHANGELOG.md` | יומן שינויים. | LIVE |
| `MASTER-ARCHITECTURE.md` | גובר עליו CONTRADICTIONS.md. | STALE |
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
