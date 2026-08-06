# מפת דרכים V2

סיכום מסמכי הארכיטקטורה לתוכנית שלבים עם תלויות.

Status: **BINDING (תכנון)** · עודכן: 2026-08-06  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow** לקופון; `platform_percent` דינמי פר מוצר לפיזי; ארנק פנימי בלי משיכה; מיגרציות prod **רק MCP**.

---

## 0. עקרונות

1. Web = SEO + רכישה. PWA = גשר. Expo = שימור בהמשך.  
2. Docs לפני פיצ'ר כסף רגיש.  
3. `CHECKOUT_ENABLED=false` עד רכישת טסט.  
4. pnpm בלבד.

---

## 1. עשרת מסמכי החבילה הנוכחית

| # | מסמך | תפקיד |
|---:|---|---|
| 1 | `ARCHITECTURE-SUPPLIER-ONBOARDING.md` | הצטרפות, בנק, סניפים, עובדים |
| 2 | `ARCHITECTURE-ANALYTICS.md` | משפך צפייה→מימוש; PostHog+GA4 |
| 3 | `ARCHITECTURE-LEGAL-COMPLIANCE.md` | 14 יום, 5%/100 ₪, תוקף, נגישות |
| 4 | `ARCHITECTURE-SEARCH-UX.md` | Meilisearch, השלמות, טעויות כתיב |
| 5 | `RUNBOOK-PRODUCTION.md` | Deploy, rollback, MCP migrations |
| 6 | `ARCHITECTURE-EMAIL-TEMPLATES.md` | תבניות RTL לכל אירוע קופון |
| 7 | `ARCHITECTURE-INVENTORY.md` | מכסות קופון פר דיל |
| 8 | `ARCHITECTURE-REFERRAL.md` | חבר מביא חבר + קאשבק |
| 9 | `ARCHITECTURE-OBSERVABILITY.md` | Sentry, לוגים, התראות |
| 10 | `ROADMAP-V2.md` | מסמך זה |

---

## 2. קבוצות מסמכים נוספים

| קבוצה | דוגמאות |
|---|---|
| כסף | NOTIFICATIONS, ADMIN-DASHBOARD, FRAUD, CASHBACK-WALLET, SUPPLIER-PORTAL, PRICING-RULES |
| קטלוג | CATEGORIES-TAXONOMY, SEARCH, SEO-PERFORMANCE |
| מובייל | PWA, MOBILE-APP |
| אמון | SECURITY-RLS, BACKUP-DR, TEST-STRATEGY |

---

## 3. שלבים ותלויות

### שלב A: Soft-open

| סדר | עבודה | תלוי ב־ | Docs |
|---:|---|---|---|
| A0 | Pro/PITR + גיבוי | תקציב | BACKUP-DR, RUNBOOK |
| A1 | קטלוג + מחירים | A0 | PRICING, CATEGORIES, SEO |
| A2 | Checkout + vouchers | A1 | COMMERCE, SUPPLIER-PORTAL |
| A3 | Redeem + fraud | A2 | FRAUD |
| A4 | מיילים RTL | A2 | NOTIFICATIONS, EMAIL-TEMPLATES |
| A5 | אדמין + onboarding | A1 | ADMIN, ONBOARDING |
| A6 | Legal `/cancel` + נגישות | A2 | LEGAL |
| A7 | Observability | A0–A6 | OBSERVABILITY |
| A8 | רכישת טסט → soft-open | A2–A7 | RUNBOOK |

### שלב B: צמיחה

| סדר | עבודה | תלוי ב־ | Docs |
|---:|---|---|---|
| B1 | Search UX / Meili | A1 | SEARCH-UX |
| B2 | Cashback earn/spend | A2 | CASHBACK-WALLET |
| B3 | Referral | B2 | REFERRAL |
| B4 | Analytics SDKs | consent | ANALYTICS |
| B5 | Inventory quotas | A5 | INVENTORY |

### שלב C: מובייל

| סדר | עבודה | תלוי ב־ | Docs |
|---:|---|---|---|
| C1 | PWA | A יציב | PWA |
| C2 | Expo + Wallet push | C1, A4 | MOBILE-APP, NOTIFICATIONS |

---

## 4. גרף תלויות

```text
PITR ──► capture אמיתי
platform_percent ──► publish + checkout
redeem אטומי ──► soft-open ספקים
Resend ──► coupon_* emails
MCP migrations ──► כל שינוי סכמה ב-prod
LEGAL /cancel ──► soft-open ציבורי
ארנק earn ──► spend / referral
```

---

## 5. מחוץ ל-V2

Escrow לקופון · משיכת ארנק החוצה · `supabase db push` לייצור · Make/Zapier.

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | ROADMAP-V2 עם 10 מסמכי החבילה + שלבים A/B/C |
