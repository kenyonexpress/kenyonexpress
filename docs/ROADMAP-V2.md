# ROADMAP V2

סיכום מסמכי הארכיטקטורה ב-`ke-arch` לתוכנית ביצוע.

Status: **BINDING (planning)** · Updated: 2026-08-03 (pack-20)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

מודל כסף מחייב לכל השלבים: **No Escrow** לקופון (תשלום אתר נשאר בפלטפורמה; יתרה בבית העסק); `platform_percent` דינמי פר מוצר לפיזי; כסף באגורות integer.

---

## 0. עקרונות תוכנית

1. Web Next.js = SEO + רכישה. Expo = שימור/ספק בהמשך. PWA = גשר.  
2. Docs לפני פיצ'ר כסף רגיש; מיגרציות forward-only.  
3. Checkout כבוי (`CHECKOUT_ENABLED=false`) עד רכישת טסט ירוקה.  
4. pnpm בלבד. עבודה ב-worktree ייעודי; לא בתיקייה הראשית לניסויים מקבילים.

---

## 1. מפת מסמכים (pack-20)

| # | מסמך | תפקיד |
|---:|---|---|
| 1 | `ARCHITECTURE-NOTIFICATIONS.md` | Resend, Edge, email/WA/SMS, Wallet push |
| 2 | `ARCHITECTURE-SEO-PERFORMANCE.md` | ISR, sitemap, schema.org RTL, CWV |
| 3 | `ARCHITECTURE-MOBILE-APP.md` | Expo מול PWA (המלצה: PWA גשר → Expo יעד) |
| 4 | `ARCHITECTURE-ADMIN-DASHBOARD.md` | מוצרים + `platform_percent`, ספקים, דוחות |
| 5 | `ARCHITECTURE-FRAUD-PREVENTION.md` | מימוש כפול, chargebacks, צילומי QR |
| 6 | `RUNBOOK-PRODUCTION.md` | deploy, rollback, migrations |
| 7 | `ARCHITECTURE-ANALYTICS.md` | אירועים, משפכים, GA4 + PostHog |
| 8 | `ARCHITECTURE-CASHBACK-WALLET.md` | ארנק פנימי + ledger |
| 9 | `ARCHITECTURE-SEARCH-UX.md` | Meilisearch, השלמות עברית |
| 10 | `ARCHITECTURE-REFERRAL.md` | חבר מביא חבר + קאשבק |
| 11 | `ARCHITECTURE-CATEGORIES-TAXONOMY.md` | עץ קטגוריות ישראלי |
| 12 | `ARCHITECTURE-EMAIL-TEMPLATES.md` | תבניות RTL |
| 13 | `ARCHITECTURE-SUPPLIER-ONBOARDING.md` | הצטרפות ספק |
| 14 | `ARCHITECTURE-INVENTORY.md` | מכסות קופון / מלאי |
| 15 | `ARCHITECTURE-PRICING-RULES.md` | עמלה, הנחות, בזק |
| 16 | `ARCHITECTURE-CUSTOMER-SUPPORT.md` | פניות ומימוש |
| 17 | `ARCHITECTURE-LEGAL-COMPLIANCE.md` | צרכן, תוקף, נגישות |
| 18 | `ARCHITECTURE-BACKUP-DR.md` | גיבוי ושחזור |
| 19 | `ARCHITECTURE-OBSERVABILITY.md` | Sentry, לוגים, התראות |
| 20 | `ROADMAP-V2.md` | מסמך זה |

Companions חשובים מחוץ לרשימה: `ARCHITECTURE-SUPPLIER-PORTAL.md`, `ARCHITECTURE-SECURITY-RLS.md`, `ARCHITECTURE-SEARCH.md`, `ARCHITECTURE-WALLET-LEDGER.md`, `ARCHITECTURE-PWA.md`, `TEST-STRATEGY.md`, `CHANGELOG.md`.

---

## 2. שלבי ביצוע מומלצים

### Phase A: Soft-open storefront (חוסם הכנסה)

| סדר | עבודה | Docs מובילים |
|---:|---|---|
| A1 | Catalog + taxonomy + PDP מחירים | CATEGORIES, PRICING, SEO-PERFORMANCE |
| A2 | Cart/checkout Cardcom + vouchers | RUNBOOK, FRAUD, SUPPLIER-PORTAL |
| A3 | Notifications Resend + RTL templates | NOTIFICATIONS, EMAIL-TEMPLATES |
| A4 | Admin products (`platform_percent`) + suppliers approve | ADMIN, ONBOARDING, PRICING |
| A5 | Observability + backups Pro/PITR | OBSERVABILITY, BACKUP-DR |
| A6 | Legal copy + a11y gates | LEGAL, TEST-STRATEGY |

יציאה: רכישת טסט + redeem טסט + `CHECKOUT_ENABLED=true`.

### Phase B: Growth loops

| סדר | עבודה | Docs |
|---:|---|---|
| B1 | Search UX + Meili pipeline/DLQ | SEARCH, SEARCH-UX |
| B2 | Cashback wallet earn | CASHBACK-WALLET, WALLET-LEDGER |
| B3 | Referral | REFERRAL |
| B4 | Analytics PostHog + GA4 consent | ANALYTICS |
| B5 | Inventory quotas / flash deals | INVENTORY, PRICING |

### Phase C: Mobile + retention

| סדר | עבודה | Docs |
|---:|---|---|
| C1 | PWA bridge (manifest/SW/push) | PWA, MOBILE-APP |
| C2 | Expo customer + push + wallet passes | MOBILE-APP, NOTIFICATIONS |
| C3 | Supplier scan hardening | SUPPLIER-PORTAL, FRAUD |
| C4 | Support macros + dispute queue | CUSTOMER-SUPPORT, FRAUD |

---

## 3. תלויות קריטיות

```text
Supabase Pro/PITR ──► first real capture
platform_percent on products ──► publish + checkout
redeem atomic ──► supplier soft-open
Resend domain ──► coupon_issued
CHECKOUT_ENABLED ──► after test purchase PASS
Expo ──► after PWA bridge + stable web money
```

---

## 4. מדדי הצלחה (V2)

| מדד | יעד ראשוני |
|---|---|
| CWV mobile (home/PDP) | LCP/CLS/INP ירוקים (SEO-PERFORMANCE) |
| Redeem success rate | > 98% מהניסיונות התקינים |
| Notification p95 email | ≤ 60s |
| Double-redeem incidents | 0 כספיים (רק already_used) |
| Backup restore drill | רבעוני PASS |
| Referral abuse | נתפס ב-manual_review לפני תשלומי בונוס חריגים |

---

## 5. Out of scope ל-V2

- Escrow / held-until-redeem לקופון  
- משיכת ארנק החוצה  
- Marketplace רב-מחסנים מורכב  
- תחליף ל-Cardcom  
- Make/Zapier בייצור  

---

## 6. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: ROADMAP-V2 מסכם 20 מסמכים לתוכנית A/B/C |
