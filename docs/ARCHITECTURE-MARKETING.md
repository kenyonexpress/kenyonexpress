# ARCHITECTURE: Marketing

פיד Google Shopping, Facebook catalog, שיתוף WhatsApp, ומבנה קישורי affiliate.

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only.  
Companions:

```
docs/ARCHITECTURE-LAUNCH-MARKETING.md
docs/ARCHITECTURE-GROWTH-SEO.md
docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/LEGAL-CHECKLIST.md
```

עקרונות:

1. אין מדיה בתשלום לפני שערי Go-Live ירוקים.
2. כל קישור יוצא עם UTM (חוץ מאורגני ישיר).
3. דיוור שיווקי: opt-in + הסרה (30א). Transactional (הזמנה/קופון) לא דרך המסמך הזה.
4. מחירים בפידים מ-API שרת באגורות → מחרוזת ILS; לא ידני בגיליון כמקור אמת.

---

## 0. UTM קנוני

| ערוץ | utm_source | utm_medium |
|---|---|---|
| Google Ads / Shopping | `google` | `cpc` |
| Facebook / Instagram ads | `facebook` / `instagram` | `paid_social` |
| Facebook organic share | `facebook` | `social` |
| WhatsApp | `whatsapp` | `referral` או `social` |
| Affiliate | `affiliate` | `affiliate` |
| Newsletter | `newsletter` | `email` |

`utm_campaign` לדוגמה: `launch_2026`, `supplier_{slug}`, `aff_{code}`.  
הצמדה להמרות: purchase בצד שרת (לא פיקסל בלבד).

---

## 1. Google Shopping feed

### 1.1 Endpoint

```
GET /api/feeds/google-shopping.xml
```

(או TSV לפי Merchant Center). Auth: ציבורי לקריאה או token בהגדרות הפיד. בניה מ-DB published בלבד.

### 1.2 שדות

| שדה | מקור |
|---|---|
| `id` | `products.id` |
| `title` | `name_he` |
| `description` | תיאור מקוצר נקי מ-HTML |
| `link` | `https://kenyonexpress.co.il/product/{slug}` |
| `image_link` | URL ציבורי ב-R2 |
| `price` | `"X.XX ILS"` ממחיר הפיזי / מחיר התצוגה הקנוני |
| `availability` | in stock / out of stock ממלאי |
| `condition` | `new` |
| `brand` | אם קיים |
| `identifier_exists` | `no` כשאין GTIN |

### 1.3 סייג קופונים

| סוג | בפיד? |
|---|---|
| `physical` | כן |
| `coupon` | **לא** ביום 1 (מדיניות vouchers/gift; סיכון לחשבון) |

פילטר מחייב: `product_type = physical` ו-`status = published`.

### 1.4 תפעול

1. Merchant Center מאומת על הדומיין (דרך GSC).
2. שליחת פיד + בדיקת אזהרות שבועית.
3. מחיר/זמינות: רענון לפחות יומי (או לפי דרישת Google).

---

## 2. Facebook catalog

### 2.1 פיד

פורמט Meta Product Catalog (CSV/XML) מאותו מקור מוצרים:

```
GET /api/feeds/meta-catalog.csv
```

שדות מקבילים ל-Shopping: `id`, `title`, `description`, `availability`, `condition`, `price`, `link`, `image_link`, `brand`.  
מטבע: `ILS`. אותה החלטה: **פיזי בלבד** ביום 1.

### 2.2 חיבור

1. Meta Business Manager → Catalog → Data source = scheduled feed.
2. פיקסל / CAPI לרכישות: עדיפות לאירוע שרת אחרי `paid` (לא רק browser pixel).
3. לא להעלות ידנית גיליון שמתפצל מה-DB.

### 2.3 Creative

- תמונות מ-R2 בלבד (יחסים שמותרים במודעות).
- טקסט מודעה לא מבטיח מחיר שונה מהפיד.
- קופונים: קידום מחוץ לקטלוג המוצרים (טראפיק ל-URL) אם בכלל, לא כ-product feed item ביום 1.

---

## 3. WhatsApp share

### 3.1 שיתוף מוצר (לקוח / ספק)

כפתור "שיתוף ב-WhatsApp" בונה:

```
https://wa.me/?text={urlencoded}
```

טקסט מומלץ:

```
{product_name_he}
שולם באתר: ₪X · יתרה בבית העסק: ₪Y   (לקופון)
{url}?utm_source=whatsapp&utm_medium=social&utm_campaign=share_product
```

לפיזי: מחיר מלא באתר בלבד (בלי המצאת יתרה).

### 3.2 חוקים

- לא לשתף `qr_token` / `qr_payload` בוואטסאפ.
- לא לשתף קישורי אדמין או redeem.
- ספק מקבל טקסט מוכן (מהפורטל) עם `utm_campaign=supplier_{slug}`.
- הודעות שיווקיות יזומות לרשימות: רק עם הסכמה; תבניות Meta אם Cloud API.

### 3.3 Deep link

אם האפליקציה חיה: אותו URL web + App Links. השיתוף תמיד URL https יציב, לא custom scheme בלבד.

---

## 4. Affiliate links structure

### 4.1 צורה קנונית

```
https://kenyonexpress.co.il/r/{code}
```

או:

```
https://kenyonexpress.co.il/?ref={code}
```

העדפה: `/r/{code}` עם 302 לערך הנחיתה + cookie first-party.

| רכיב | חוזה |
|---|---|
| `code` | ציבורי, לא ניתן לניחוש קל (ננויד), ייחודי ב-`affiliates` / `referral_codes` |
| Cookie | `ke_ref={code}`; TTL מוגדר (למשל 30 יום); Last-click או First-click: הכרעה אחת ב-STATE |
| Attribution | נשמר על `orders` ב-`paid` (`referral_code` / `affiliate_id`) |
| תגמול | ארנק פנימי / קרדיט בלבד לפי מדיניות; **לא** משיכה אם זה משתמש-קצה; שותף עסקי לפי חוזה נפרד |
| `noindex` | על `/r/*` |

### 4.2 פרמטרים

```
/r/{code}?utm_source=affiliate&utm_medium=affiliate&utm_campaign=aff_{code}
```

אחרי redirect ליעד (בית / מוצר / קטגוריה) ה-UTM נשמרים ל-analytics.

### 4.3 הגנות

| סיכון | הגנה |
|---|---|
| Self-referral | דגל אם `affiliate.user_id = order.user_id` |
| בוטים | rate limit על `/r/*` + סינון analytics |
| שינוי עמלה אחורה | תגמול לפי חוקי התוכנית בזמן ההזמנה (snapshot) |
| שיתוף QR | אסור כערוץ שותפים |

### 4.4 מחוץ ליום 1

- פורטל שותפים מלא
- תשלום בנקאי לשותפים
- קוקי cross-domain

---

## 5. Acceptance

- [ ] פיד Google: physical only, מחירים תקינים, Merchant בלי דחיות המוניות
- [ ] פיד Meta מאותו מקור
- [ ] שיתוף WhatsApp בלי סודות QR ועם UTM
- [ ] `/r/{code}` רושם attribution בלי SEO index
- [ ] אין דיוור שיווקי בלי opt-in

---

## 6. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Launch marketing (Shopping + SEO 301) |
| 2026-08-02 | מסמך מחייב: Shopping, Facebook catalog, WhatsApp share, affiliate `/r/{code}` |
