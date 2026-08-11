# ארכיטקטורה: Marketing

פיד Google Shopping, Facebook catalog, שיתוף WhatsApp, ומבנה קישורי affiliate.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: No Escrow (פידים מציגים מחיר אתר; קופון = מחיר מלא באתר).

מסמכים קשורים:

```
docs/ARCHITECTURE-LAUNCH-MARKETING.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md
docs/ARCHITECTURE-MEDIA-R2.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| MK1 | אין מדיה בתשלום לפני שערי Go-Live P0 ירוקים. |
| MK2 | כל קישור יוצא עם UTM (חוץ מאורגני ישיר). |
| MK3 | דיוור שיווקי: opt-in + הסרה (30א). Transactional (הזמנה/קופון) לא דרך מסמך זה. |
| MK4 | מחירים בפידים מ-API שרת באגורות → מחרוזת `"X.XX ILS"`; לא ידני בגיליון. |
| MK5 | Google Shopping + Meta catalog: **`physical` בלבד** ביום 1; קופונים **לא** בפיד. |
| MK6 | `image_link` = URL ציבורי R2/CDN; לא signed URL קצר. |
| MK7 | WhatsApp share: `wa.me/?text=` עם URL https + UTM; **לא** `qr_token` / `qr_payload`. |
| MK8 | Affiliate: `/r/{code}` עם cookie first-party; `noindex`; attribution ב-`paid`. |
| MK9 | Meta CAPI / server purchase event אחרי `paid`; לא pixel בלבד. |
| MK10 | Merchant Center מאומת על `kenyonexpress.co.il` לפני שלב B. |

### 1.1 UTM קנוני

| ערוץ | utm_source | utm_medium |
|---|---|---|
| Google Ads / Shopping | `google` | `cpc` |
| Facebook / Instagram ads | `facebook` / `instagram` | `paid_social` |
| Facebook organic share | `facebook` | `social` |
| WhatsApp | `whatsapp` | `referral` או `social` |
| Affiliate | `affiliate` | `affiliate` |
| Newsletter | `newsletter` | `email` |

`utm_campaign`: `launch_2026`, `supplier_{slug}`, `aff_{code}`.

### 1.2 Google Shopping

```
GET /api/feeds/google-shopping.xml
```

| שדה | מקור |
|---|---|
| `id` | `products.id` |
| `title` | `name_he` |
| `description` | תיאור מקוצר נקי HTML |
| `link` | `https://kenyonexpress.co.il/product/{slug}` |
| `image_link` | R2 public URL |
| `price` | מחיר פיזי / תצוגה קנונית |
| `availability` | מלאי |
| `condition` | `new` |
| `identifier_exists` | `no` בלי GTIN |

פילטר: `product_type = physical` AND `status = published`.

### 1.3 Meta catalog

```
GET /api/feeds/meta-catalog.csv
```

אותם שדות; `ILS`; physical only; scheduled feed ב-Business Manager.

### 1.4 WhatsApp share

```text
{product_name_he}
שולם באתר: ₪X · יתרה בבית העסק: ₪Y   (קופון)
{url}?utm_source=whatsapp&utm_medium=social&utm_campaign=share_product
```

### 1.5 Affiliate

```
https://kenyonexpress.co.il/r/{code}
```

Cookie `ke_ref={code}`; TTL 30 יום; snapshot תגמול בזמן `paid`.

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| קופונים ב-Google Shopping ביום 1 | מדיניות vouchers/gift; סיכון דחיית חשבון כולו. |
| גיליון Google Sheets כמקור אמת לפיד | drift מ-DB; MK4 API only. |
| שיתוף QR token ב-WhatsApp | leakage + אבטחה; MK7. |
| Affiliate cross-domain cookie | first-party `/r/` בלבד; privacy. |
| Browser pixel בלבד ל-Meta | SKAN/ITP; MK9 server CAPI. |
| קמפיין paid לפני Go-Live | MK1; checkout לא מאומת. |
| UTM מזויף על traffic ישיר | analytics noise; organic בלי UTM. |

---

## 3. סכמת DB

**אין DDL חדש במסמך זה.** קריאה מטבלאות קיימות:

| טבלה | שדות לפידים / attribution |
|---|---|
| `products` | `id`, `slug`, `name_he`, `description`, `product_type`, `status`, מחירים באגורות, מלאי |
| `media_assets` / `product_images` | `image_link` |
| `orders` | `referral_code`, `affiliate_id`, UTM snapshot (analytics) |
| `affiliates` / `referral_codes` | `code` ל-`/r/{code}` |
| `marketing_consent` / preferences | opt-in לדיוור (30א) |

פידים: generated at request; cache TTL יומי מינימום.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| E1 | מוצר unpublished באמצע build פיד | excluded; לא 404 ב-feed item |
| E2 | תמונה R2 404 | exclude מ-p feed + alert |
| E3 | מחיר 0 / null | exclude; לא `"0.00 ILS"` |
| E4 | קופון בטעות ב-query פיד | filter `physical`; monitor Merchant warnings |
| E5 | Self-referral affiliate | block credit; flag fraud |
| E6 | `/r/{code}` bot crawl | rate limit; לא index (noindex) |
| E7 | UTM stripped ב-WhatsApp preview | URL מלא ב-text; landing שומר query |
| E8 | Meta catalog stale price | daily refresh; price mismatch = disapproval |
| E9 | share ללא opt-in marketing | transactional OK; bulk WA lists = opt-in |
| E10 | float במחיר פיד | אסור; integer agorot → format ILS string |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | First-click vs last-click affiliate | last-click; תיעוד ב-analytics | 2026-08-12 |
| O2 | קופונים ב-Shopping post-launch | בחינה משפטית/מדיניות per SKU | 2026-08-12 |
| O3 | פורטל affiliates מלא | מחוץ ליום 1 | 2026-08-12 |
| O4 | TikTok catalog | P2 אחרי Meta/Google stable | 2026-08-12 |

---

## 6. Acceptance

- [ ] פיד Google: physical only, מחירים תקינים  
- [ ] פיד Meta מאותו מקור  
- [ ] WhatsApp בלי QR secrets + UTM  
- [ ] `/r/{code}` attribution + noindex  
- [ ] אין דיוור שיווקי בלי opt-in  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-02 | Shopping, Meta, WhatsApp, affiliate |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
