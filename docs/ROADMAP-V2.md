# מפת דרכים V2

סיכום מסמכי הארכיטקטורה לתוכנית שלבים עם תלויות.

Status: **BINDING (תכנון)** · עודכן: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף לכל השלבים: **No Escrow** לקופון; `platform_percent` דינמי פר מוצר לפיזי; אגורות integer; ארנק פנימי בלי משיכה החוצה.

---

## 0. עקרונות

1. Web = SEO + רכישה. PWA = גשר. Expo = שימור/ספק בהמשך.  
2. מיגרציות ייצור **רק דרך MCP** (ראה RUNBOOK).  
3. `CHECKOUT_ENABLED=false` עד רכישת טסט ירוקה.  
4. pnpm בלבד. Docs לפני פיצ'ר כסף רגיש.

---

## 1. עשרת מסמכי הליבה (החבילה הנוכחית)

| # | מסמך | תפקיד |
|---:|---|---|
| 1 | `ARCHITECTURE-NOTIFICATIONS.md` | Resend + Edge; מחזור קופון כולל הוחזר; Wallet push |
| 2 | `ARCHITECTURE-ADMIN-DASHBOARD.md` | מוצרים, `platform_percent`, מחיר קופון, יתרה אצל ספק, דוחות |
| 3 | `ARCHITECTURE-FRAUD-PREVENTION.md` | מימוש כפול, QR, chargebacks, velocity, חסימה |
| 4 | `ARCHITECTURE-CASHBACK-WALLET.md` | ארנק פנימי, ledger, צבירה ומימוש בקנייה הבאה |
| 5 | `ARCHITECTURE-SUPPLIER-ONBOARDING.md` | מסמכים, בנק, אישור, סניפים, עובדים |
| 6 | `ARCHITECTURE-ANALYTICS.md` | משפך צפייה→מימוש; PostHog + GA4 |
| 7 | `ARCHITECTURE-LEGAL-COMPLIANCE.md` | 14 יום, דמי ביטול 5%/100 ₪, תוקף, נגישות |
| 8 | `ARCHITECTURE-SEARCH-UX.md` | Meilisearch, השלמות, סינונים, טעויות כתיב |
| 9 | `RUNBOOK-PRODUCTION.md` | Vercel, rollback, MCP migrations, חירום |
| 10 | `ROADMAP-V2.md` | מסמך זה |

---

## 2. מפת כל מסמכי הארכיטקטורה (קבוצות)

### כסף ומסחר

`BUSINESS-MODEL`, `COMMERCE`, `MASTER-CHECKOUT-REDEMPTION`, `COUPON-REDEMPTION`, `PRICING-RULES`, `INVENTORY`, `CASHBACK-WALLET`, `WALLET-LEDGER`, `ACCOUNT-WALLET`, `FRAUD-PREVENTION`, `CARDCOM-ARCHITECTURE` (אם קיים), `SUPPLIER-PORTAL`, `SUPPLIER-REDEMPTION`.

### קטלוג וצמיחה

`CATEGORIES-TAXONOMY`, `CATALOG-SEARCH-SEO`, `SEARCH`, `SEARCH-UX`, `SEO`, `SEO-PERFORMANCE`, `GROWTH-SEO`, `REFERRAL`, `WP-DATA-MIGRATION`.

### לקוח והתראות

`NOTIFICATIONS`, `EMAIL-TEMPLATES`, `NOTIFICATIONS-MARKETING`, `PERSONAL-AREA`, `ACCOUNT-IDENTITY`, `PWA`, `MOBILE-APP`, `MOBILE-SUPERAPP`, `CUSTOMER-SUPPORT`.

### אדמין ואמון

`ADMIN-DASHBOARD`, `ADMIN-ARCHITECTURE`, `SUPPLIER-ONBOARDING`, `SECURITY`, `SECURITY-RLS`, `LEGAL-COMPLIANCE`, `ANALYTICS`, `ANALYTICS-BI`.

### תפעול

`RUNBOOK-PRODUCTION`, `PRODUCTION-OPS`, `BACKUP-DR`, `OBSERVABILITY`, `PERFORMANCE`, `TESTING-CICD`, `TEST-STRATEGY`, `API-CONTRACTS`, `AI-AGENTS*`.

---

## 3. שלבים ותלויות

### שלב A: Soft-open (חוסם הכנסה)

| סדר | עבודה | תלוי ב־ | Docs |
|---:|---|---|---|
| A0 | Supabase Pro + PITR + גיבוי | תקציב | BACKUP-DR, RUNBOOK |
| A1 | קטלוג + taxonomy + PDP מחירים | A0 | CATEGORIES, PRICING, SEO-PERFORMANCE |
| A2 | Checkout Cardcom + vouchers | A1, RLS | COMMERCE, SUPPLIER-PORTAL, SECURITY-RLS |
| A3 | Redeem אטומי + fraud בסיסי | A2 | FRAUD, COUPON-REDEMPTION |
| A4 | התראות Resend + תבניות RTL | A2 | NOTIFICATIONS, EMAIL-TEMPLATES |
| A5 | אדמין מוצרים/ספקים + onboarding | A1 | ADMIN, ONBOARDING |
| A6 | Legal copy + `/cancel` + נגישות | A2 | LEGAL |
| A7 | Observability + smoke | A0–A6 | OBSERVABILITY, RUNBOOK |
| A8 | רכישת טסט → `CHECKOUT_ENABLED=true` | A2–A7 | RUNBOOK |

**שער יציאה A:** paid + voucher + מייל + redeem טסט + Instant Rollback מובן.

### שלב B: צמיחה

| סדר | עבודה | תלוי ב־ | Docs |
|---:|---|---|---|
| B1 | Search UX + Meili/DLQ | A1 | SEARCH, SEARCH-UX |
| B2 | Cashback earn | A2, wallet RPC | CASHBACK-WALLET, WALLET-LEDGER |
| B3 | Cashback spend בקופה | B2 | CASHBACK-WALLET |
| B4 | Referral | B2 | REFERRAL |
| B5 | Analytics PostHog+GA4 | consent | ANALYTICS |
| B6 | Inventory quotas / flash | A5 | INVENTORY, PRICING |
| B7 | סניפים ועובדים מלאים | A5 | ONBOARDING, SUPPLIER-PORTAL |

### שלב C: מובייל ושימור

| סדר | עבודה | תלוי ב־ | Docs |
|---:|---|---|---|
| C1 | PWA (manifest/SW/push) | A יציב | PWA, MOBILE-APP |
| C2 | Expo לקוח + Wallet push | C1, A4 | MOBILE-APP, NOTIFICATIONS |
| C3 | סורק ספק מחוזק | A3 | SUPPLIER-PORTAL, FRAUD |
| C4 | Support macros + disputes | A3, LEGAL | CUSTOMER-SUPPORT |

---

## 4. גרף תלויות (תמצית)

```text
BACKUP/PITR ──► capture אמיתי
platform_percent על מוצרים ──► publish + checkout
redeem אטומי ──► soft-open ספקים
Resend domain ──► coupon_issued / refunded
MCP migrations ──► כל שינוי סכמה ב-prod
LEGAL /cancel ──► soft-open ציבורי
ארנק earn ──► לפני spend / referral
PWA ──► לפני Expo ציבורי
```

---

## 5. מדדי הצלחה

| מדד | יעד |
|---|---|
| CWV (home/PDP) | ירוק לפי SEO-PERFORMANCE |
| Redeem תקין | > 98% |
| מייל p95 | ≤ 60 שנ' |
| Double-redeem כספי | 0 |
| Restore drill | רבעוני PASS |
| ביטול 14 יום | מחושב בשרת; דמי ביטול = min(5%, 100 ₪) |

---

## 6. מחוץ ל-V2

- Escrow / held-until-redeem לקופון  
- משיכת ארנק החוצה  
- `supabase db push` לייצור  
- Make/Zapier בייצור  
- PSP שני במקום Cardcom  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | ROADMAP-V2: 10 ליבה + מפת docs + שלבים A/B/C עם תלויות |
