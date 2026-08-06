# אינדקס ראשי: מסמכי ארכיטקטורה

אינדקס כל מסמכי הארכיטקטורה ב-`docs/` עם שורת תקציר לכל אחד.

Status: **BINDING (index)** · עודכן: 2026-08-06
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף מחייב בכל המסמכים הרלוונטיים: No Escrow לקופון; platform_percent דינמי פר מוצר לפיזי; ארנק פנימי בלי משיכה; מיגרציות prod דרך MCP בלבד.

---

## טבלת אינדקס

| מסמך | תקציר |
|---|---|
| `ADMIN-ARCHITECTURE.md` | KenyonExpress production admin dashboard architecture. |
| `ARCHITECTURE-ACCOUNT-IDENTITY.md` | מסמך תכנון. מיגרציה נלווית (טיוטה, לא הוחלה): |
| `ARCHITECTURE-ACCOUNT-WALLET.md` | סטטוס: DESIGN + IMPLEMENTATION. ענף feat/account-wallet, worktree ke-account. |
| `ARCHITECTURE-ADMIN-DASHBOARD.md` | ניהול מוצרים עם platform_percent דינמי פר מוצר, מחיר קופון, יתרה אצל הספק (בבית העסק), ניהול ספקים, ודוחות מכירות. |
| `ARCHITECTURE-AI-AGENTS-RUNTIME.md` | סטטוס: טיוטה מחייבת v2.0 (2026-07-17). בעלים: ארכיטקט פלטפורמת ה-AI. |
| `ARCHITECTURE-AI-AGENTS.md` | five planned AI agents, the shared infrastructure they run on, and the |
| `ARCHITECTURE-ANALYTICS-BI.md` | > גובר עליו docs/CONTRADICTIONS.md (2026-07-24). כל מספר עמלה, ברירת מחדל |
| `ARCHITECTURE-ANALYTICS.md` | משפך מצפייה בדיל עד מימוש. המלצה: PostHog (מוצר) + GA4 (מרקטינג). |
| `ARCHITECTURE-API-CONTRACTS.md` | > גובר עליו docs/CONTRADICTIONS.md (2026-07-24). כל מספר עמלה, ברירת מחדל |
| `ARCHITECTURE-APP-STORE-LAUNCH.md` | הכנה לפרסום אפליקציית KenyonExpress ב-App Store ו-Google Play. |
| `ARCHITECTURE-B2B-SALES.md` | מכירת קופונים בכמות לחברות וועדי עובדים. |
| `ARCHITECTURE-BACKUP-DR.md` | גיבויים, PITR, ושחזור לפרויקט Supabase של KenyonExpress. |
| `ARCHITECTURE-CASHBACK-WALLET.md` | ארנק פנימי בלבד שלא יוצא מהמערכת: ledger כפול-רישום, צבירה, ומימוש בקנייה הבאה. |
| `ARCHITECTURE-CATALOG-SEARCH-SEO.md` | > גובר עליו docs/CONTRADICTIONS.md (2026-07-24). כל מספר עמלה, ברירת מחדל |
| `ARCHITECTURE-CATEGORIES-TAXONOMY.md` | עץ קטגוריות לשוק הישראלי (קופונים ומוצרים פיזיים). |
| `ARCHITECTURE-COMMERCE.md` | > גובר עליו docs/CONTRADICTIONS.md (2026-07-24). כל מספר עמלה, ברירת מחדל |
| `ARCHITECTURE-COUPON-REDEMPTION-UX.md` | מפרט UX מחייב למימוש קופון (ספק + לקוח). |
| `ARCHITECTURE-COUPON-REDEMPTION.md` | KenyonExpress supplier coupon / voucher redemption architecture (binding scan spec). |
| `ARCHITECTURE-CUSTOMER-SUPPORT.md` | פניות לקוח, בעיות מימוש קופון, ו-SLA. |
| `ARCHITECTURE-DATA-EXPORT-GDPR.md` | ייצוא ומחיקת נתוני משתמש (זכויות נושא מידע; יישור לדין הישראלי + עקרונות GDPR כשיחולו). |
| `ARCHITECTURE-EMAIL-TEMPLATES.md` | תבניות RTL לכל אירוע במחזור חיי קופון (Resend). |
| `ARCHITECTURE-FRAUD-PREVENTION.md` | מימוש כפול, צילומי מסך QR, chargebacks, בדיקות velocity, וחסימת קופון. |
| `ARCHITECTURE-GIFT-COUPONS.md` | קופון מתנה: רכישה, העברת בעלות, וברכות. |
| `ARCHITECTURE-GROWTH-SEO.md` | מסמך הכרעות. תאריך: 2026-07-17. ענף: phase5/homepage. |
| `ARCHITECTURE-INVENTORY.md` | מלאי קופונים ומכסות פר דיל (ומלאי פיזי בסיסי). |
| `ARCHITECTURE-LEGAL-COMPLIANCE.md` | הגנת הצרכן, ביטול 14 יום, דמי ביטול 5% או 100 ₪, תוקף שוברים, נגישות ישראלית. |
| `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | Money rule: agorot integers only, zero floats past the ILS/agorot boundary. |
| `ARCHITECTURE-MOBILE-APP.md` | ארכיטקטורת אפליקציית מובייל ל-KenyonExpress: Expo + React Native על אותו backend Supabase כמו ה-web. |
| `ARCHITECTURE-MOBILE-SUPERAPP.md` | מסמך תכנון מחייב. תאריך: 2026-07-17. ענף: phase5/homepage. |
| `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` | מסמך תכנון. מיגרציה נלווית (טיוטה, לא הוחלה): |
| `ARCHITECTURE-NOTIFICATIONS.md` | התראות טרנזקציוניות למחזור חיי קופון: Resend + Supabase Edge Functions, מייל / וואטסאפ / SMS, ו-Wallet push. |
| `ARCHITECTURE-OBSERVABILITY.md` | Sentry, לוגים מובנים, והתראות תפעוליות. |
| `ARCHITECTURE-PERFORMANCE.md` | Owner: Performance Architect |
| `ARCHITECTURE-PERSONAL-AREA.md` | ארכיטקטורת האזור האישי של KenyonExpress. |
| `ARCHITECTURE-PRICING-RULES.md` | platform_percent דינמי פר מוצר, מבצעי בזק, והנחות תצוגה. |
| `ARCHITECTURE-PRODUCTION-OPS.md` | מסמך תכנון תשתית. סטטוס: DESIGN. אין בו מיגרציות ואין בו קוד להחלה. |
| `ARCHITECTURE-PWA.md` | ארכיטקטורת Progressive Web App: manifest, Service Worker, push. |
| `ARCHITECTURE-REFERRAL.md` | תוכנית הפניות עם קאשבק פנימי (בלי משיכה החוצה). |
| `ARCHITECTURE-SEARCH-UX.md` | Meilisearch, השלמות בעברית, ותיקון טעויות כתיב. |
| `ARCHITECTURE-SEARCH.md` | ארכיטקטורת חיפוש קטלוג בעברית: שאילתות, פילטרים, אינדוקס, ו-DLQ. |
| `ARCHITECTURE-SEASONAL-CAMPAIGNS.md` | חגים ישראליים, מבצעי בזק, וראש השנה / פסח. |
| `ARCHITECTURE-SECURITY-RLS.md` | מטריצת RLS מחייבת ל-44 טבלאות ב-public (ליבה פרודקשן + קטלוג/כסף/ספק/ארנק). |
| `ARCHITECTURE-SECURITY.md` | KenyonExpress security architecture. This document is the binding security decision record: where it conflicts with a… |
| `ARCHITECTURE-SEO-PERFORMANCE.md` | ארכיטקטורת SEO וביצועים לחנות KenyonExpress (Next.js App Router). |
| `ARCHITECTURE-SEO.md` | מסמך תכנון מלא, מוכן ליישום. תאריך: 2026-07-23. ענף: phase5/homepage. |
| `ARCHITECTURE-SUPPLIER-ONBOARDING.md` | הצטרפות ספק: מסמכים, פרטי בנק ל-payout, אישור אדמין, סניפים ועובדים. |
| `ARCHITECTURE-SUPPLIER-PORTAL.md` | KenyonExpress supplier-facing portal architecture. |
| `ARCHITECTURE-SUPPLIER-REDEMPTION.md` | מסמך תכנון מלא. מיגרציה נלווית (טיוטה, לא הוחלה): |
| `ARCHITECTURE-TESTING-CICD.md` | > גובר עליו docs/CONTRADICTIONS.md (2026-07-24). כל מספר עמלה, ברירת מחדל |
| `ARCHITECTURE-WALLET-LEDGER.md` | ארנק קאשבק פנימי: ledger כפול-רישום באגורות integer, בלי משיכה החוצה. |
| `ARCHITECTURE-WP-DATA-MIGRATION.md` | Source of truth for extraction, field mapping, image pipeline, SEO |
| `BUSINESS-MODEL.md` | - אני מגדיר בדף המוצר את סכום הקופון שהלקוח משלם באתר (למשל: דיל 100 שח → קופון 10 שח באתר) |
| `CARDCOM-ARCHITECTURE.md` | > מסמך ארכיטקטורה מלא. מבוסס על מחקר תיעוד רשמי: Swagger v11 של Cardcom |
| `CHANGELOG.md` | כל השינויים המתועדים למוצר ול-docs מנקודה זו והלאה. |
| `MASTER-ARCHITECTURE.md` | > גובר עליו docs/CONTRADICTIONS.md (2026-07-24). כל מספר עמלה, ברירת מחדל |
| `ROADMAP-V2.md` | סיכום מסמכי הארכיטקטורה לתוכנית שלבים עם תלויות. |
| `RUNBOOK-PRODUCTION.md` | Deploy ל-Vercel, rollback, ומיגרציות דרך MCP בלבד. |
| `TEST-STRATEGY.md` | פירמידת טסטים מלאה ל-KenyonExpress: כסף קודם, UI אחר כך. |
| `MASTER-INDEX.md` | אינדקס כל מסמכי הארכיטקטורה עם שורת תקציר לכל אחד. |

---

## חבילות אחרונות (לניווט מהיר)

| # | מסמך |
|---:|---|
| 16 | `ARCHITECTURE-GIFT-COUPONS.md` |
| 17 | `ARCHITECTURE-B2B-SALES.md` |
| 18 | `ARCHITECTURE-SEASONAL-CAMPAIGNS.md` |
| 19 | `ARCHITECTURE-DATA-EXPORT-GDPR.md` |
| 20 | `MASTER-INDEX.md` |

ראה גם: `ROADMAP-V2.md` לשלבי ביצוע ותלויות.

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | יצירת MASTER-INDEX לכל מסמכי הארכיטקטורה |
