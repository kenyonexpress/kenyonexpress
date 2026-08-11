# docs/INDEX.md: אינדקס שלמות מסמכים

אינדקס קנוני לשלמות `docs/` (וביקורת על `.claude/` + קבצי שורש). נפרד מ-`MASTER-INDEX.md` (שם: נושאים/סטטוס QA). כאן: סתירות מודל, WP/PHP stale, יתומים, ותור תיקונים.

Status: **BINDING (integrity index)** · עודכן: 2026-08-12
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

הערת tag: תור `arch/docs-batch-2` #1-#50 הושלם. כל מסמך = commit נפרד + push ל-`origin/arch/docs-batch-2`. מסמכים חדשים בחבילה: `ARCHITECTURE-CARDCOM-WEBHOOKS.md`, `ARCHITECTURE-CART-GUEST.md`.

## 0.2 חבילת docs-batch-2 (BINDING, 2026-08-12)

תור 50 מסמכי ארכיטקטורה על
`arch/docs-batch-2`
. כסף: No Escrow, `platform_percent` פר מוצר, אגורות. הרשימה המלאה ב-
`STATE.md`
תחת המשך מ: (ארכיון תור).

| # | מסמך חדש/מרכזי | תקציר |
|---|---|---|
| 1 | `ARCHITECTURE-CHECKOUT-FLOW.md` | cart→coupon_redeemed |
| 2 | `ARCHITECTURE-CARDCOM-WEBHOOKS.md` | `?s=`, GetLpResult, idempotency, DLQ |
| 3 | `ARCHITECTURE-COUPON-LIFECYCLE.md` | mint/QR/redeem/expiry/races |
| 4 | `ARCHITECTURE-CART-GUEST.md` | `ke_session_id`, merge, cookies |
| 5–50 | רענון ARCHITECTURE-* | commerce→wallet→supplier→ops→growth |

מקור מודל לעבירה (לא קיים קובץ בשם `BUSINESS-MODEL-RULES.md`):

```
docs/BUSINESS-MODEL.md          ← מקור אמת עסקי
docs/CONTRADICTIONS.md          ← C1/C2/C3/C11א
docs/ARCHITECTURE-PRICING-RULES.md
```

כללי עבירה שנבדקו:

1. אין Escrow / held לספק על קופון (מקדמה = הכנסת פלטפורמה; יתרה בעסק).
2. אין עמלה קבועה 5% (או כל default) כ-`platform_percent` מוצר. דמי ביטול 5%/100₪ הם LEGAL נפרד.
3. אחוזים פר מוצר בלבד; לא אחוז מחייב ברמת ספק.
4. Stack נוכחי = Next.js + Supabase; WordPress/PHP רק כמיגרציה/היסטוריה/rollback.

נקראו: כל `docs/*.md` (149), `.claude/skills/*/SKILL.md` (6), `CLAUDE.md`, `AGENTS.md`. תיקיית `claude/` (בלי נקודה) **לא קיימת**.

קישור הדדי:

```
docs/MASTER-INDEX.md
docs/ROADMAP-V2.md
docs/BUSINESS-MODEL.md
```

---

## 0. Prioritized fix table (ראשון)

| עדיפות | קובץ | סוג | ממצא / פעולה |
|---|---|---|---|
| P0 | `docs/ARCHITECTURE-TESTING-CICD.md` | 5% default commission | מתעד `DEFAULT_PLATFORM_COMMISSION_PERCENT = 5` ו-"5 percent default" כאילו עדיין פתוח. סותר BUSINESS-MODEL + C1 (אין default). ליישר ל-100% money gates ב-TESTING-STRATEGY / TESTING-QA. |
| P0 | `docs/DDL-FIXES.md` | Escrow model as current | מדבר על התאמה ל"מודל ה-Escrow" ו-073 Escrow. יתום + מודל ישן. באנר STALE/DEPRECATED או מחיקה/מיזוג ל-No Escrow. |
| P0 | `docs/DB-SCHEMA.md` | escrow_held_agorot column | עדיין מציג `escrow_held_agorot` בלי באנר No Escrow. לסמן DROP/legacy מול C11א. |
| P0 | `docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | internal held until redeem | R1 עדיין: on-site charge is held in ledger until redemption / escrow_holds. סותר BUSINESS-MODEL (כל מקדמת קופון לפלטפורמה, אין held לספק). |
| P0 | `.claude/skills/cardcom-payments/SKILL.md` | internal held for coupon | Skill עדיין: upfront recorded as INTERNAL held until redemption. סותר BUSINESS-MODEL / C11א. לא תחת docs/ אבל משפיע על סוכנים. |
| P1 | `docs/PHASE2-3-SPEC.md` | commission_percent DEFAULT 5 | מציע להשתמש ב-commission_percent DEFAULT 5. סותר per-product platform_percent בלי default. |
| P1 | `docs/PRODUCTION-CHANGES-2026-07-27.md` | escrow_held state machine | יומן היסטורי עם מצבי escrow_held/released. להוסיף באנר: ארכיון 27.07, דורס ב-No Escrow 06.08. |
| P1 | `docs/GAPS-CODE-VS-DOCS.md` | escrow_holds table | עדיין דן ב-escrow_holds כרשומת ledger פנימית מותרת. לעדכן מול C11א (אין held לספק על קופון). |
| P1 | `docs/ARCHITECTURE-SUPPLIER-PORTAL.md` | escrow_held_agorot always 0 | עמודת escrow_held_agorot כ-always 0 משמרת שפת Escrow. להסיר/לסמן legacy. |
| P1 | `docs/ARCHITECTURE-COMMERCE.md` | vendor commission_rate suggestion | vendors.commission_rate כהצעת default ליצירת מוצר. גבולי מול "אין אחוז ברמת ספק"; לוודא שלא הופך ל-binding default. |
| P1 | `docs/PRODUCT-PAGE-SPEC.md` | suppliers.commission_percent suggestion | אותו גבול: הצעת אחוז מספק. לא Binding percent. |
| P1 | `docs/ARCHITECTURE-API-CONTRACTS.md` | legacy vendors commission_rate default 90 | מתעד legacy default 90 על vendors. להשאיר רק כ-LEGACY freeze + מצביע ל-platform_percent פר מוצר. |
| P1 | `docs/ARCHITECTURE-WP-DATA-MIGRATION.md` | commission default per category | טבלת מיפוי: config default per category. סותר per-product only. |
| P2 | `docs/ARCHITECTURE-PRODUCTION-OPS.md` | WP as production peer | מתאר cutover מ-WordPress חי (נכון כהיסטוריית השקה). לוודא באנר: stack נוכחי = Next, WP = rollback window בלבד. |
| P2 | `docs/ARCHITECTURE-SEO.md` | live site is WordPress | מדבר על האתר החי כ-WordPress לדירוג. לעדכן אם הקאטאובר בוצע, או לסמן transitional. |
| P2 | `docs/ARCHITECTURE-PWA.md` | WordPress OneSignal | שורה על Keep WordPress OneSignal (נדחה). תקין כהכרעה; לא דורש rewrite. |
| P2 | `docs/SEED-SUPPLIERS-SPEC.md` | WP seed references | הפניות רבות ל-WP כמקור נתונים. OK למיגרציה; לסמן SOURCE=WP export לא stack. |
| P2 | `docs/MASTER-ARCHITECTURE.md` | WP/legacy commission notes | מסמך ענק עם שכבות ישנות; חלק מסומן בוטל. צריך באנר "לא קנוני; BUSINESS-MODEL + CONTRADICTIONS גוברים". |
| P3 | `docs/COMPONENT-INVENTORY.md` | orphan | לא מקושר מ-MASTER-INDEX / ROADMAP / docs אחרים. |
| P3 | `docs/DDL-FIXES.md` | orphan + bad model | יתום; ראה P0. |
| P3 | `docs/DEEP-LINKS-SPEC.md` | orphan | לא מקושר; תוכן חופף ל-MOBILE-APP / app deep-links. |
| P3 | `docs/hardcoded-audit.md` | orphan | פלט סריקה ל-CI; לשקול קישור מ-GITHUB-SETTINGS / TESTING-QA. |
| P3 | `docs/rtl-violations.md` | orphan | פלט rtl-lint; לקשר מ-CODE-REVIEW-CHECKLIST או TESTING-QA. |

### סיכום ספירות (אחרי סינון false-positive של "אין Escrow")

| קטגוריה | ספירה | הערה |
|---|---:|---|
| סתירות מודל כסף (P0+P1 מודל) | 13 | Escrow/held ישן, 5% default, אחוז ספק/legacy |
| WP/PHP כ-stack נוכחי או transitional לא מסומן | 5 | PRODUCTION-OPS, SEO, PWA שורה, SEED, MASTER-ARCHITECTURE |
| יתומים (אין קישור מ-MASTER/ROADMAP/docs אחר) | 5 | COMPONENT-INVENTORY, DDL-FIXES, DEEP-LINKS-SPEC, hardcoded-audit, rtl-violations |
| `BUSINESS-MODEL-RULES.md` | 0 | הקובץ לא קיים; האודיט מול BUSINESS-MODEL + CONTRADICTIONS + PRICING-RULES |

הערה: עשרות מסמכים מזכירים Escrow רק כדי **לאסור** אותו (QA-PASS). אלה לא נספרים כסתירה.

---

## 0.1 חבילת lifecycle / channels (BINDING, 2026-08-12)

תור docs שנסגר ב-
`arch/docs-lifecycle`
. כסף: No Escrow, `platform_percent` פר מוצר, אגורות integer.

| # | מסמך | תקציר |
|---|---|---|
| 1 | `ARCHITECTURE-CHECKOUT-FLOW.md` | מכונת הזמנה, snapshot %, Cardcom+QStash, guest merge, כשלים, ERD |
| 2 | `ARCHITECTURE-COUPON-LIFECYCLE.md` | mint, QR, redeem אטומי, races, expiry, audit, הרשאות ספק |
| 3 | `ARCHITECTURE-WALLET-CASHBACK.md` | קאשבק פנימי, ledger agorot, אין cash-out, כללי צבירה עתידיים |
| 4 | `ARCHITECTURE-WORDPRESS-IMPORT.md` | WXR מ-`data-import/wp-backup/`, dedup, R2, dry-run, rollback |
| 5 | `ARCHITECTURE-GEO-FEATURE.md` | תגיות עיר, מיון מרחק, אינדקסים, בורר UI |
| 6 | `ARCHITECTURE-RECURRING-SUBSCRIPTIONS.md` | מנוי חודשי product-facing; טכני ב-`ARCHITECTURE-SUBSCRIPTIONS.md` |
| 7 | `ARCHITECTURE-ADMIN-DASHBOARD.md` | סוג מוצר, `platform_percent`, WhatsApp toggle, ספקים |
| 8 | `ARCHITECTURE-NOTIFICATIONS.md` | Resend RTL, outbox/CF, QStash, ntfy ops, WhatsApp עתידי |
| 9 | `ARCHITECTURE-SEO-PERFORMANCE.md` | metadata עברית, JSON-LD, sitemap, ISR, CWV |
| 10 | `ARCHITECTURE-MOBILE-APP.md` | Expo + חזון אפ פנימית, API v1, Auth |

---

## 1. Orphans

| מסמך | הערה |
|---|---|
| `COMPONENT-INVENTORY.md` | Read-only scan of `src/components`. Every `.tsx` component is listed, grouped by subdirectory. |
| `DDL-FIXES.md` | תיקוני DDL קריטיים לנתיב קופון / settlement, וסדר החלה בטוח של 027+054. |
| `DEEP-LINKS-SPEC.md` | סכמת `kenyonexpress://` ו-universal links, ומה שייך לכל אחת. |
| `hardcoded-audit.md` | Read-only scan of `src/` (.ts, .tsx, .css) for hardcoded hex colors and px values. |
| `rtl-violations.md` | Auto-generated by `scripts/rtl-lint.mjs` (run: `node scripts/rtl-lint.mjs`). |

---

## 2. One-line summary per doc

| מסמך | סטטוס (מתוך הקובץ) | ב-MASTER? | refs נכנסים | תקציר |
|---|---|---|---:|---|
| `ADMIN-ARCHITECTURE.md` | DEPRECATED | yes | 2 | docs/ARCHITECTURE-ADMIN-DASHBOARD.md |
| `ADMIN-PRODUCT-EDITOR-SPEC.md` | SPEC | yes | 1 | מפרט ל- |
| `ADMIN-USER-GUIDE.md` | GUIDE | yes | 5 | מדריך תפעולי לאדמין: הוספת מוצרים, אחוזי פלטפורמה וקאשבק, ספקים, החזרים, דוחות. |
| `ANALYTICS-SPEC.md` | BINDING (measurement) | yes | 14 | אירועי משפך (`view_product`, `add_to_cart`, `purchase`, `redeem`), מיפוי ל-GA4 ול-Meta Pixel, ו-Consent Mode בהתאם לבאנר העוגיות. |
| `API-PUBLIC-SPEC.md` | DESIGN | yes | 1 | API מפתחים לספקי enterprise: קריאת מכירות ועדכון מלאי, עם API keys ו-rate limits. |
| `ARCHITECTURE-ACCOUNT-IDENTITY.md` | ? | yes | 17 | מסמך תכנון. מיגרציה נלווית (טיוטה, לא הוחלה): |
| `ARCHITECTURE-ACCOUNT-WALLET.md` | DEPRECATED | yes | 4 | סטטוס: DESIGN + IMPLEMENTATION. ענף `feat/account-wallet`, worktree `ke-account`. |
| `ARCHITECTURE-ADMIN-DASHBOARD.md` | BINDING | yes | 17 | ניהול מוצרים: בורר סוג, platform_percent דינמי, WhatsApp toggle, ספקים, דוחות על snapshots. |
| `ARCHITECTURE-AI-AGENTS-RUNTIME.md` | ? | yes | 3 | סטטוס: טיוטה מחייבת v2.0 (2026-07-17). בעלים: ארכיטקט פלטפורמת ה-AI. |
| `ARCHITECTURE-AI-AGENTS.md` | design specification. No agent code exis | yes | 8 | five planned AI agents, the shared infrastructure they run on, and the |
| `ARCHITECTURE-ANALYTICS-BI.md` | authoritative spec. Scope: event taxonom | yes | 11 | The marketplace runs on Supabase Postgres. Products have a `product_type` of `coupon` or `physical`. Commission works by the platform keeping `platform_percent` per produ |
| `ARCHITECTURE-ANALYTICS.md` | BINDING | yes | 8 | סכימת אירועים, KPIs ללוח ספק, ודוחות הכנסות אדמין לפי `platform_percent` פר מוצר. |
| `ARCHITECTURE-API-CONTRACTS.md` | BINDING draft v1.0 (2026-07-17) | yes | 11 | Owner: API contracts architect |
| `ARCHITECTURE-APP-STORE-LAUNCH.md` | BINDING | yes | 5 | הכנה לפרסום אפליקציית KenyonExpress ב-App Store ו-Google Play. |
| `ARCHITECTURE-B2B-SALES.md` | BINDING | yes | 8 | מכירת קופונים בכמות לחברות וועדי עובדים. |
| `ARCHITECTURE-BACKUP-DR.md` | BINDING | yes | 11 | גיבויים, PITR, ושחזור לפרויקט Supabase של KenyonExpress. |
| `ARCHITECTURE-CASHBACK-WALLET.md` | BINDING | yes | 12 | ארנק פנימי בלבד שלא יוצא מהמערכת: ledger כפול-רישום, צבירה, ומימוש בקנייה הבאה. |
| `ARCHITECTURE-CATALOG-SEARCH-SEO.md` | ? | yes | 11 | מסמך תכנון מלא. מיגרציה נלווית (טיוטה, לא הוחלה): |
| `ARCHITECTURE-CATEGORIES-TAXONOMY.md` | BINDING | yes | batch #43/50 | עץ קטגוריות לשוק הישראלי (עומק 2); בלי עמלה לפי קטגוריה. |
| `ARCHITECTURE-CHECKOUT-FLOW.md` | BINDING | yes | 1 | מכונת מצבי הזמנה, snapshot של platform_percent, קופון/פיזי No Escrow, Cardcom+QStash, guest merge, כשלים, ERD. |
| `ARCHITECTURE-COMMERCE.md` | DESIGN, QA-PASS 2026-08-06 | yes | 22 | Date: 2026-07-08. Supersedes the fixed-10% commission model documented in |
| `ARCHITECTURE-COUPON-LIFECYCLE.md` | BINDING | yes | 1 | יצירה אחרי paid, QR חתום, redeem אטומי, races, expiry, audit, הרשאות ספק; No Escrow. |
| `ARCHITECTURE-COUPON-REDEMPTION-UX.md` | BINDING for `feat/coupon-redemption` (20 | yes | 4 | מפרט UX מחייב למימוש קופון (ספק + לקוח). |
| `ARCHITECTURE-COUPON-REDEMPTION.md` | BINDING | yes | 10 | KenyonExpress supplier coupon / voucher redemption architecture (binding scan spec). |
| `ARCHITECTURE-CUSTOMER-SUPPORT.md` | BINDING | yes | 15 | פניות לקוח, בעיות מימוש קופון, ו-SLA. |
| `ARCHITECTURE-DATA-EXPORT-GDPR.md` | BINDING | yes | batch #45/50 | ייצוא/מחיקת נתוני משתמש; snapshots בלי Escrow; דמי ביטול LEGAL בייצוא. |
| `ARCHITECTURE-EMAIL-TEMPLATES.md` | BINDING | yes | 12 | תבניות RTL לכל אירוע במחזור חיי קופון (Resend). |
| `ARCHITECTURE-FRAUD-PREVENTION.md` | BINDING | yes | 23 | מימוש כפול, צילומי מסך QR, chargebacks, בדיקות velocity, וחסימת קופון. |
| `ARCHITECTURE-GEO-FEATURE.md` | BINDING | yes | batch #49/50 | תגיות עיר, מיון מרחק, אינדקסים, ובורר UI מחוץ ל-header. |
| `ARCHITECTURE-GIFT-COUPONS.md` | BINDING | yes | 8 | קופון מתנה: רכישה, העברת בעלות, וברכות. |
| `ARCHITECTURE-GROWTH-SEO.md` | ? | yes | 9 | מסמך הכרעות. תאריך: 2026-07-17. ענף: `phase5/homepage`. |
| `ARCHITECTURE-INTEGRATIONS.md` | DESIGN → BINDING על העקרונות | yes | 3 | ורטיקלים של משלוחי אוכל והסעות: בנייה פנימית בתוך KenyonExpress, webhooks נכנסים, ומיפוי הזמנות לליבת `orders` / תשלומים. |
| `ARCHITECTURE-INVENTORY.md` | BINDING | yes | 11 | מלאי קופונים ומכסות פר דיל (ומלאי פיזי בסיסי). |
| `ARCHITECTURE-LAUNCH-CHECKLIST.md` | ACTIONABLE / BINDING gates | yes | 2 | שערי Go-Live מחייבים: Resend מאומת, Cardcom production, התראות Sentry, דומיינים ב-Vercel, מדיניות גיבוי, ו-10 קופוני השקה חיים. |
| `ARCHITECTURE-LEGAL-COMPLIANCE.md` | BINDING | yes | batch #44/50 | צרכן: 14 יום; דמי ביטול 5%/100₪ = LEGAL לא commission; נגישות. |
| `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` | REFRESHED 2026-08-06 | yes | 6 | Money rule: agorot integers only, zero floats past the ILS/agorot boundary. |
| `ARCHITECTURE-MOBILE-APP.md` | BINDING | yes | batch #46/50 | Expo על אותו backend: Auth, Push, סריקת ספק + PIN, QR אופליין לתצוגה. |
| `ARCHITECTURE-MOBILE-SUPERAPP.md` | ? | yes | 10 | מסמך תכנון מחייב. תאריך: 2026-07-17. ענף: `phase5/homepage`. |
| `ARCHITECTURE-NOTIFICATIONS-MARKETING.md` | ? | yes | 10 | מסמך תכנון. מיגרציה נלווית (טיוטה, לא הוחלה): |
| `ARCHITECTURE-NOTIFICATIONS.md` | BINDING | yes | 21 | Outbox + Resend RTL + Push/in-app; QStash תזמון; ntfy ops; WhatsApp עתידי; No Escrow בנוסח. |
| `ARCHITECTURE-OBSERVABILITY.md` | BINDING | yes | 19 | Sentry (כולל error boundaries לפי route group), לוגים מובנים, התראות webhook של Cardcom, דשבורד התאמה על `settlement_events`, ובדיקות uptime. |
| `ARCHITECTURE-PAYOUT-MECHANISM.md` | BINDING | yes | 10 | תשלום יתרת ספק על מוצר פיזי בלבד: מתי נצבר, איך יוצא כסף, סכימה באגורות, מסך אישור אדמין, וחריגים. |
| `ARCHITECTURE-PERFORMANCE.md` | ? | yes | 10 | Owner: Performance Architect |
| `ARCHITECTURE-PERSONAL-AREA.md` | BINDING | yes | 3 | ארכיטקטורת האזור האישי של KenyonExpress. |
| `ARCHITECTURE-PRICING-RULES.md` | BINDING | yes | 36 | `platform_percent` דינמי פר מוצר, מבצעי בזק, והנחות תצוגה. |
| `ARCHITECTURE-PRODUCTION-OPS.md` | ? | yes | 5 | מסמך תכנון תשתית. סטטוס: DESIGN. אין בו מיגרציות ואין בו קוד להחלה. |
| `ARCHITECTURE-PWA.md` | BINDING | yes | batch #47/50 | PWA: Serwist, manifest `#fed700`, offline, A2HS; גשר עד Expo; סורק נשאר PWA. |
| `ARCHITECTURE-REFERRAL.md` | BINDING | yes | 8 | תוכנית הפניות עם קאשבק פנימי (בלי משיכה החוצה). |
| `ARCHITECTURE-RECURRING-SUBSCRIPTIONS.md` | BINDING (product-facing) | yes | 1 | מנוי חודשי ללקוח; מקור טכני = ARCHITECTURE-SUBSCRIPTIONS (SU*). |
| `ARCHITECTURE-REFUNDS-DISPUTES.md` | BINDING | yes | 3 | החזר קופון לפני/אחרי מימוש, החזרות פיזי לפי דיני צרכן בישראל (14 יום), היפוך ledger (אין Escrow), Cardcom Refund API, ומכונת מצבי dispute. |
| `ARCHITECTURE-SEARCH-UX.md` | BINDING | yes | 8 | Meilisearch, השלמות בעברית, ותיקון טעויות כתיב. |
| `ARCHITECTURE-SEARCH.md` | BINDING | yes | 3 | ארכיטקטורת חיפוש קטלוג בעברית: שאילתות, פילטרים, אינדוקס, ו-DLQ. |
| `ARCHITECTURE-SEASONAL-CAMPAIGNS.md` | BINDING | yes | 11 | חגים ישראליים, מבצעי בזק, וראש השנה / פסח. |
| `ARCHITECTURE-SECURITY-RLS.md` | BINDING | yes | 10 | מטריצת RLS מחייבת ל-44 טבלאות ב-`public` (ליבה פרודקשן + קטלוג/כסף/ספק/ארנק). |
| `ARCHITECTURE-SECURITY.md` | ? | yes | 20 | KenyonExpress security architecture. This document is the binding security decision record: where it conflicts with any other doc, this one wins for security controls. |
| `ARCHITECTURE-SEO-PERFORMANCE.md` | BINDING | yes | 11 | Metadata עברית, hreflang he-IL, JSON-LD Product/Offer, sitemap, ISR, CWV @ 380/768. |
| `ARCHITECTURE-SEO.md` | ? | yes | 1 | מסמך תכנון מלא, מוכן ליישום. תאריך: 2026-07-23. ענף: `phase5/homepage`. |
| `ARCHITECTURE-SUBSCRIPTIONS.md` | BINDING (design) | yes | batch #48/50 | מנוי חודשי טכני: Token, cron, retry, ledger; מקור אמת מול RECURRING. |
| `ARCHITECTURE-SUPPLIER-ONBOARDING.md` | BINDING | yes | 12 | בקשת ספק, אישור אדמין, צ'קליסט פתיחת חשבון/מסוף Cardcom (כשנדרש), הסכם פיצול פר מוצר (אין תעריף ברמת ספק), ומודל נתונים לחוזה. |
| `ARCHITECTURE-SUPPLIER-PORTAL.md` | BINDING | yes | 17 | KenyonExpress supplier-facing portal architecture. |
| `ARCHITECTURE-SUPPLIER-REDEMPTION.md` | ? | yes | 17 | מסמך תכנון מלא. מיגרציה נלווית (טיוטה, לא הוחלה): |
| `ARCHITECTURE-TESTING-CICD.md` | FINAL DESIGN. Branch: `phase5/homepage`. | yes | 10 | This document is the single source of truth for the testing strategy and the CI/CD pipeline. It is written for a marketplace that moves real money: Cardcom charges, a cas |
| `ARCHITECTURE-TESTING-QA.md` | BINDING | yes | 1 | פירמידת בדיקות למונורפו KenyonExpress: Vitest unit, integration מול Supabase branch DB, Playwright e2e לזרימות קריטיות, מטריצת GitHub Actions, ושערי coverage על קבצים ששו |
| `ARCHITECTURE-TRUST-SAFETY.md` | BINDING | yes | 2 | Rate limiting לפי endpoint, אנטרופיה של קודי שובר ומניעת ניחוש, abuse בסורק (`wrong_supplier`, `rate_limited`), כיסוי audit לאדמין, וצ'קליסט סקירת RLS. |
| `ARCHITECTURE-WALLET-CASHBACK.md` | BINDING | yes | 1 | קאשבק פנימי באגורות, אין cash-out, earn/spend idempotent, כללי צבירה עתידיים. |
| `ARCHITECTURE-WALLET-INTEGER.md` | BINDING (plan) | yes | 2 | מעבר מלא לכסף ב-integer agorot, יישור חתימת `fn_wallet_transfer`, וסגירת SEC-WALLET. |
| `ARCHITECTURE-WALLET-LEDGER.md` | BINDING | yes | 7 | ארנק קאשבק פנימי: ledger כפול-רישום באגורות integer, בלי משיכה החוצה. |
| `ARCHITECTURE-WORDPRESS-IMPORT.md` | BINDING | yes | batch #50/50 | ייבוא WXR; WP = מקור מיגרציה בלבד (לא stack חי); R2 + dry-run + rollback. |
| `ARCHITECTURE-WP-DATA-MIGRATION.md` | binding operational spec for the WP impo | yes | 9 | Source of truth for extraction, field mapping, image pipeline, SEO |
| `BACKUP-RECOVERY.md` | RUNBOOK | yes | 3 | Supabase Pro, תרגול שחזור, ו-RPO/RTO מעשיים. |
| `BACKUP-RESTORE-RUNBOOK.md` | RUNBOOK | yes | 8 | צעדים לתרגול ולאירוע אמיתי. מדיניות מספרים: |
| `BUSINESS-MODEL.md` | ? | yes | 28 | - אני מגדיר בדף המוצר את סכום הקופון שהלקוח משלם באתר (למשל: דיל 100 שח → קופון 10 שח באתר) |
| `CARDCOM-ARCHITECTURE.md` | ? | yes | 17 | CARDCOM-ARCHITECTURE.md |
| `CASHBACK-WALLET-SPEC.md` | SPEC | yes | 2 | מפרט מוצר/זרימה לארנק פנימי באגורות. ההכרעות המחייבות ב- |
| `CATEGORY-1TO1-FINDINGS.md` | ? | no | 1 | מדידות מהאתר החי ומ-localhost ב-1440x2600, דרך `scripts/_cat-probe.mjs`, |
| `CATEGORY-TAXONOMY.md` | CONTENT / PLAN | yes | 3 | Slugs באנגלית, שמות בעברית, 3 רמות עומק. מיושר ל-slugs שקיימים בפרוד/סיד. |
| `CHANGELOG.md` | ? | yes | 1 | כל השינויים המתועדים למוצר ול-docs מנקודה זו והלאה. |
| `CHECKOUT-OPTIMIZATION.md` | PLAN | yes | 12 | זרימת תשלום מלאה, מצבי כשל, retry, ומשפך נטישה. |
| `CITY-LANDING-CONTENT.md` | CONTENT | yes | 3 | פסקת פתיחה ייחודית (~100 מילים) + `title` + `meta description` לכל עיר. |
| `CODE-REVIEW-CHECKLIST.md` | BINDING (process) | yes | 5 | רשימת חובה לסוקר ולמחבר לפני אישור merge. קצר בכוונה. |
| `COMPONENT-INVENTORY.md` | ? ORPHAN | no | 0 | Read-only scan of `src/components`. Every `.tsx` component is listed, grouped by subdirectory. |
| `CONTENT-PLAYBOOK.md` | PLAYBOOK | yes | 6 | איך כותבים דיל שנמכר, בעברית, בשדות שקיימים בפועל באדמין. |
| `CONTRADICTIONS.md` | ? | yes | 71 | סטטוס: RESOLVED (עודכן 2026-08-06, יישור לחבילת docs No Escrow). |
| `COUPON-LIFECYCLE-SPEC.md` | SPEC | yes | 7 | סטטוסים, מעברים מותרים, וצדדים (מייל / ledger / UI). |
| `CUSTOMER-SUPPORT-PLAYBOOK.md` | PLAYBOOK | yes | 8 | תסריטים מוכנים לנציג/בעלים. לא מחליף את הארכיטקטורה או את מדיניות ה-SLA. |
| `DATA-RETENTION-POLICY.md` | DRAFT POLICY | yes | 3 | כמה זמן שומרים מה, ומה קורה במחיקת חשבון. מסמך הנדסי/תפעולי. |
| `DB-SCHEMA.md` | ? | no | 2 | Generated from live Supabase project `ixvwfbuvfxxsjiywhbbb` on 2026-07-23 by read-only introspection of information_schema and pg_catalog. |
| `DDL-FIXES.md` | ops runbook ORPHAN | no | 0 | תיקוני DDL קריטיים לנתיב קופון / settlement, וסדר החלה בטוח של 027+054. |
| `DEEP-LINKS-SPEC.md` | BINDING ORPHAN | no | 0 | סכמת `kenyonexpress://` ו-universal links, ומה שייך לכל אחת. |
| `DEPLOY.md` | ? | no | 3 | מדריך פריסה מלא ל-Kenyon Express. כל הפקודות רצות משורש הפרויקט: |
| `DESIGN-CHECKLIST-FINAL.md` | BINDING (QA gate) | yes | 4 | KE_LIVE_SPEC.md |
| `DISPUTE-RESOLUTION.md` | BINDING | yes | 8 | מי מכריע, על סמך מה, ותוך כמה זמן. |
| `EMAIL-TEMPLATES-COPY.md` | CONTENT | yes | 5 | נושא + גוף + CTA לכל תבנית. טון חברותי ישראלי, בלי שפת שיווק אמריקאית כבדה. |
| `EMAIL-TEMPLATES-SPEC.md` | SPEC | yes | 5 | מיפוי `kind` → מבנה טכני + חובות RTL. נוסחים מלאים: |
| `FAQ-CONTENT.md` | CONTENT | yes | 5 | טקסטים מוכנים לעמוד `/faq` (או עזרה). עברית בלבד ללקוח. |
| `FEATURED-DEALS-PRICING.md` | PLAN (future) | yes | 3 | מודל עתידי להכנסת פרסום/חשיפה. לא חלק מ-soft-open. |
| `FRAUD-PREVENTION-SPEC.md` | SPEC | yes | 4 | שכבת מוצר מעל ההכרעות המחייבות ב- |
| `GAPS-CODE-VS-DOCS.md` | AUDIT | yes | 9 | פערים בין הארכיטקטורה המתועדת לקוד בפועל, בתחומי payments, coupons, refund. |
| `GEO-FEATURES-SPEC.md` | SPEC | yes | 3 | סינון לפי עיר / "קרוב אליי", מיון מרחק, ושדות ספק גאוגרפיים. |
| `GITHUB-SETTINGS.md` | ACTIONABLE | yes | 7 | הגדרות GitHub שאי אפשר לבצע מהקוד, ושאתה מבצע ידנית ב-UI. |
| `GO-LIVE-CHECKLIST.md` | ACTIONABLE | yes | 6 | שערי Go-Live לכסף אמיתי וקופונים אמיתיים. מסודר לפי בעלות + עדיפות. |
| `GUEST-VS-MEMBER-STRATEGY.md` | PLAN | yes | 4 | מתי דוחפים הרשמה ומתי נותנים לקנות בשקט. |
| `INCIDENT-PLAYBOOKS.md` | RUNBOOK | yes | 7 | צעדים מדויקים למפעיל יחיד. אין NOC. סדר קבוע בכל תרחיש: זיהוי → עצירת דימום → תקשורת ללקוחות → שחזור. |
| `INCIDENT-RESPONSE-RUNBOOK.md` | RUNBOOK | yes | 8 | מסגרת כללית לניהול תקריות: דירוג, תפקידים, תקשורת, וסגירה. |
| `INTEGRATIONS-ROADMAP.md` | ROADMAP | yes | 2 | בנייה פנימית של משלוחי אוכל ונסיעות בתוך KenyonExpress. |
| `LAUNCH-CHECKLIST.md` | ACTIONABLE | yes | 8 | כל מה שנדרש לפני עלייה לאוויר של `kenyonexpress.co.il`, מחולק לפי מי מבצע. |
| `LAUNCH-VALIDATION.md` | ACTIONABLE | yes | 11 | אימות 10 דילי ההשקה מול טבלת `suppliers` במאגר, סטטוס לכל דיל, פערים, ופעולות אדמין. |
| `LAUNCH-WEEK-RUNBOOK.md` | RUNBOOK | yes | 6 | תפעול יומי סביב soft-open: מי עושה מה, שערי עצירה, ותלויות במסמכים האחרים. |
| `LEGAL-TERMS-SUPPLIERS.md` | DRAFT | yes | 4 | נוסח עברי לספקים, מיושר למודל No Escrow ולמנגנון הכסף בקוד/במסמכים. |
| `MARKETING-LAUNCH-PLAN.md` | PLAN | yes | 6 | תוכנית פעולה להשקה מסחרית: קהל, מסרים, תקציב כיוון, לוח שבועי, ומדדי עצירה/המשך. |
| `MARKETING-LAUNCH.md` | PLAN | yes | 5 | 10 דילי ההשקה, לוח פרסום לשבוע הראשון, טקסטים לרשתות בעברית, ו-UTM tracking. |
| `MASTER-ARCHITECTURE.md` | ? | yes | 16 | מסמך ההכרעות המחייב של KenyonExpress. מהדורה זו מחליפה במלואה את מהדורות |
| `MASTER-INDEX.md` | BINDING (index) | yes | 9 | אינדקס כל מסמכי הארכיטקטורה ב-`docs/` עם שורת תקציר לכל אחד. |
| `ONBOARDING-DEVELOPER.md` | GUIDE | yes | 2 | איך נכנסים לקוד בלי לשבור כסף, מיגרציות, או עיצוב. |
| `OPS-DAILY-ROUTINE.md` | RUNBOOK | yes | 2 | שגרת בוקר של 15 דקות. מה בודקים, איפה, ובאיזה סדר. |
| `PAYOUT-ARCHITECTURE.md` | BINDING | yes | 11 | מסמך קנוני מחייב ל-payout run על מוצר פיזי: חישוב זכאות, טבלאות |
| `PERFORMANCE-BUDGET.md` | BINDING (budgets) | yes | 4 | מספרים ששינוי לא רשאי לשבור בלי אישור מפורש. משלים את |
| `PHASE2-3-SPEC.md` | BINDING (spec) | yes | 1 | docs/PRODUCT-FIELDS-RESEARCH.md |
| `PORT-FROM-DUP-REPO.md` | ? | no | 1 | מקור: העותק שנבנה בטעות בלילה ב- |
| `PRODUCT-FIELDS-RESEARCH.md` | BINDING (research → target) | yes | 4 | docs/CONTRADICTIONS.md |
| `PRODUCT-PAGE-SPEC.md` | ? | no | 2 | תאריך: 2026-07-24. ענף: `phase5/homepage`. |
| `PRODUCTION-CHANGES-2026-07-27.md` | ? | no | 2 | Two changes were made directly to the hosted Supabase project |
| `PROGRESS-REPORT-AUG.md` | REPORT | yes | 4 | סיכום מה נבנה ב-docs, מה חסר להשקה, סיכונים, ולוח לשבוע הקרוב. |
| `QA-CHECKLIST.md` | ? | no | 2 | רשימת בדיקה ידנית לכל דפי האתר, מסודרת לפי עדיפות. נבנתה מסקירת קוד בלבד (read-only). |
| `REFERRAL-PROGRAM.md` | PLAN | yes | 2 | הפניות עם קאשבק פנימי, ומגני fraud תפעוליים. |
| `REFUNDS-CANCELLATION-POLICY.md` | DRAFT POLICY | yes | 8 | מדיניות מוצר לפי דיני הגנת הצרכן בישראל (מכר מרחוק), מיושרת ל- |
| `ROADMAP-V2.md` | BINDING (תכנון) | yes | 6 | סיכום מסמכי הארכיטקטורה לתוכנית שלבים עם תלויות. |
| `RUNBOOK-LAUNCH-DAY.md` | ACTIONABLE | yes | 9 | צ'קליסט ליום ה-cutover מ-WordPress ל-Next על `kenyonexpress.co.il`. |
| `RUNBOOK-PRODUCTION.md` | BINDING | yes | 19 | Deploy ל-Vercel, rollback, ומיגרציות דרך MCP בלבד. |
| `SEASONAL-CAMPAIGNS.md` | PLAN | yes | 2 | באנרים מתוזמנים, קולקציות זמניות, ו-countdown לחגים ישראליים ול-Black Friday. |
| `SECURITY-AUDIT-CHECKLIST.md` | CHECKLIST | yes | 9 | רשימת בדיקות חוזרת מול `ARCHITECTURE-SECURITY.md` ו-`ARCHITECTURE-SECURITY-RLS.md`. |
| `SEED-SUPPLIERS-SPEC.md` | SPEC | yes | 2 | מיפוי שדות ספק מ-WP (REST / meta) ל-`public.suppliers`, ולידציה לפני publish דילים, geo, שעות פתיחה, ו-WhatsApp. |
| `SEO-CONTENT-STRATEGY.md` | STRATEGY | yes | 4 | איך בונים תוכן אורגני לקניון Express בלי לשבור את מודל הקופון ובלי דפי זבל. |
| `SLA-MONITORING.md` | RUNBOOK | yes | 7 | יעדי זמינות, alerting ב-Sentry וב-Vercel, ומי מקבל התראה מתי. |
| `SUBSCRIPTIONS-BILLING-SPEC.md` | SPEC (future) | yes | 3 | סיכום קצר. מקור מחייב: |
| `SUPPLIER-AGREEMENT-DRAFT.md` | DRAFT, NOT LEGAL ADVICE | yes | 3 | טיוטת הסכם ספק. |
| `SUPPLIER-ONBOARDING.md` | GUIDE | yes | 7 | תהליך מקצה לקצה: מסמכים, הסכם, הגדרה במערכת, הדרכת סריקת קופונים. |
| `SUPPLIER-QUALITY-PROGRAM.md` | PLAN | yes | 6 | מדדים פנימיים, סף השעיה, שימוע, ותמריצים לספקים מצטיינים. |
| `SUPPORT-SLA-POLICY.md` | POLICY | yes | 7 | מדרג פניות, זמני מענה, אסקלציה, שעות פעילות, ונוסח מחוץ לשעות. |
| `TEST-STRATEGY.md` | DEPRECATED | yes | 2 | docs/TESTING-STRATEGY.md |
| `TESTING-STRATEGY.md` | BINDING (policy) | yes | 5 | תקציר מחייב לקוד ול-PR. פירוט CI/תרחישים: המסמך הארוך למטה. |
| `V2-VISION.md` | VISION / PLAN | yes | 4 | מה בא אחרי soft-open יציב: המלצות ML, מכרזים לספקים, live deals, גיימיפיקציה. עלות/תועלת ותלויות. |
| `VENDOR-PAYOUT-SPEC.md` | SPEC | yes | 8 | נתיב הכסף: הלקוח משלם ב-Cardcom → ledger/`settlement_events` → `payout_statements` → ביצוע קנוני |
| `WHATSAPP-BUSINESS-SETUP.md` | SETUP GUIDE | yes | 3 | צעדים מול ספק/ערוץ ישראלי, עלויות כיוון, ותבניות להגשה לאישור. |
| `WHATSAPP-COMMERCE-SPEC.md` | SPEC | yes | 2 | מתי שולחים הודעות, תבניות, opt-in, וגבולות מול קניות באתר. |
| `coupon-page-measured.md` | ? | no | 1 | Source URL: https://kenyonexpress.co.il/product/%D7%A7%D7%95%D7%A4%D7%95%D7%9F-%D7%98%D7%A1%D7%98/ |
| `hardcoded-audit.md` | ? ORPHAN | no | 0 | Read-only scan of `src/` (.ts, .tsx, .css) for hardcoded hex colors and px values. |
| `launch-week-plan.md` | PLAN | yes | 6 | עשרת דילי ההשקה והספקים המיועדים. מקור נתונים: קטלוג seed (אין דוח מחקר סוכן נפרד בעץ). |
| `rtl-violations.md` | ? ORPHAN | no | 0 | Auto-generated by `scripts/rtl-lint.mjs` (run: `node scripts/rtl-lint.mjs`). |

---

## 3. Claude / agents inventory

| נתיב | הערה |
|---|---|
| `.claude/skills/` | 6 skills: cardcom-payments, communication-rules, no-em-dash, rtl-hebrew-ui, state-md-protocol, supabase-migrations |
| `.claude/skills/cardcom-payments/SKILL.md` | **P0:** עדיין INTERNAL held על מקדמת קופון |
| `claude/` | לא קיים |
| `CLAUDE.md` | מפנה ל-AGENTS + חוקי נתיב/commit (מכוון לתיקייה הראשית; ב-worktree זה ke-arch) |
| `AGENTS.md` | כללי Next.js agent |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | יצירה: fix table + orphans + סיכום לכל docs + ביקורת .claude |
| 2026-08-12 | הוספת `ARCHITECTURE-CHECKOUT-FLOW.md` (BINDING); ספירת docs=144 |
| 2026-08-12 | חבילת 10 lifecycle/channels (§0.1); docs=149; רענון תקצירים |
| 2026-08-12 | batch-2 #43-#50: רענון 8 מסמכים + הערת tag תור 50/50 הושלם |
