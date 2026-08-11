# ארכיטקטורה: Launch Marketing

שיווק השקה: שימור SEO מ-WP (301), Google Merchant, קמפיין תלת-שלבי.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-MARKETING.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-WP-MIGRATION-PLAN.md
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| LM1 | שימור SEO קיים **קודם** לכל קמפיין בתשלום. |
| LM2 | אין paid media לפני P0 Go-Live + 72 שעות נקיות + soft-launch (שלב A). |
| LM3 | כל קישור חיצוני עם UTM (חוץ מאורגני ישיר). |
| LM4 | דיוור שיווקי: opt-in בלבד; רשימת WP **לא** נטענת בלי consent. |
| LM5 | 301 מ-WXR inventory: מוצר 1:1 slug; תגיות → `/products`; אין שרשור 301. |
| LM6 | Merchant Center: physical only בפיד; קופונים לא ביום 1. |
| LM7 | קמפיין: A soft → B ציבורי → C צמיחה; עצירה על checkout error >2%. |
| LM8 | `utm_campaign=launch_2026` להשקה; attribution purchase בשרת. |
| LM9 | T+14 בערך: שלב B רק אם שבועיים נקיים post-cutover. |
| LM10 | עמוד נחיתה = דף הבית; לא landing נפרד. |

### 1.1 SEO migration (301)

| סוג URL ישן | יעד |
|---|---|
| `/product/{slug}/` | `/product/{slug}` |
| `/product-category/{slug}/` | `/category/{slug}` |
| `/shop/` | `/products` |
| `/cart/`, `/checkout/` | `/cart`, `/checkout` |
| `/?s={q}&post_type=product` | `/search?q={q}` |
| `/product-tag/{slug}/` | `/products` (אין תגיות ביום 1) |

כללים: unpublished → 301 לקטגוריה; trailing slash; URL-decode slugs; MAP4 חוסם cutover.

### 1.2 Google Merchant

GM1–GM5: חשבון מאומת, פיד מ-DB, שדות מלאים, `identifier_exists=no`, עמודי legal.

### 1.3 שלבי קמפיין

```text
A: soft-launch, 20-50 עסקאות, בלי paid
B: Google brand + Shopping physical, FB/IG, WA ספקים
C: הרחבה לפי CAC vs platform_revenue
```

### 1.4 שערי עצירה

| תנאי | פעולה |
|---|---|
| checkout error >2% | השהיית paid מיד |
| CAC > 3× platform_revenue ממוצע | עצירת ערוץ |
| ספק לא עומד במימושים | הורדה מקרוסלה |

### 1.5 לוח T = cutover

| מתי | פעולה |
|---|---|
| T-7 | 301 סגור + סקריפט staging ירוק |
| T-3 | Merchant verified |
| T | DNS + sitemap + 301 prod |
| T+1..14 | GSC יומי; בלי paid |
| T+14 | שלב B אם נקי |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| paid מיום cutover | LM2; checkout/cardcom לא מוכח. |
| 404 על מוצר לא מיובא | LM5; 301 לקטגוריה. |
| landing page נפרד להשקה | LM10; SEO לדף הבית. |
| import רשימת WP ל-email | LM4; 30א opt-in. |
| קופונים ב-Merchant day 1 | LM6; סיכון account. |
| influencer paid ביום 1 | out of scope; שלב C. |
| affiliate program ביום 1 | MARKETING O3; לא launch. |

---

## 3. סכמת DB

**אין DDL חדש.** שימוש:

| טבלה / artifact | שימוש launch |
|---|---|
| `wp_import.url_inventory` | מקור 301 |
| `seo_redirects` | runtime 301 (030) |
| `products` | פיד Merchant; `product_type`, `status` |
| `marketing_consent` | opt-in post-migration |
| analytics events | UTM + purchase server-side |

CSV/JSON מיפוי 301 בגרסה (artifact); נטען ל-`seo_redirects`.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | 301 → 301 chain | collapse בטעינה; smoke script fail |
| E2 | slug עברית encoded vs decoded | match שני הצורות |
| E3 | 404 עם referrer חיצוני שבוע 1 | שורת 301 חדשה |
| E4 | Merchant disapproval המוני | pause ads; fix feed |
| E5 | cutover + paid same day | אסור LM2 |
| E6 | GSC Coverage drop >10% | triage redirects 24h |
| E7 | supplier WA link בלי UTM | template עם `supplier_{slug}` |
| E8 | newsletter ללא opt-in | block send |
| E9 | soft-launch chargeback spike | pause B; fraud review |
| E10 | sitemap ישן still indexed | submit new; monitor 30d |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | תקציב cashback launch banner | תלוי בעלים + legal | 2026-08-12 |
| O2 | PMax vs Shopping only | Shopping physical קודם | 2026-08-12 |
| O3 | בלוג SEO pre-launch | P2 אחרי קטלוג יציב | 2026-08-12 |
| O4 | אפליקציה בקמפיין B | MOBILE-APP; web first | 2026-08-12 |

---

## 6. Out of scope (יום 1)

- תוכנית affiliates / influencers בתשלום  
- אפליקציה store campaign  
- בלוג תוכן  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | 301, Merchant, קמפיין תלת-שלבי |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
