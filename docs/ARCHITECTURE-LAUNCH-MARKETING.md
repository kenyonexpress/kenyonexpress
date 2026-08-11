# ARCHITECTURE-LAUNCH-MARKETING.md

ארכיטקטורת **שיווק השקה**: שימור SEO מ-WP (הפניות 301), Google Merchant, קמפיין השקה.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31 (rev A)  
Scope: docs בלבד.  
Companions: `ARCHITECTURE-SEO-PERFORMANCE.md` (SEO טכני), `ARCHITECTURE-WP-MIGRATION-PLAN.md` (מקור טבלת ה-301), `ARCHITECTURE-ANALYTICS.md` (UTM ומדידה), `ARCHITECTURE-LEGAL-PAGES.md`, Go-Live.

---

## 0. עקרונות

1. שימור ה-SEO הקיים קודם לכל קמפיין: תנועה אורגנית שהאתר הישן צבר היא הנכס השיווקי הזול ביותר, ואיבוד שלה ב-cutover בלתי הפיך כמעט.
2. אין קמפיין בתשלום לפני ששערי P0 של Go-Live ירוקים ו-72 השעות הראשונות עברו נקי. קונים לא נשלחים בכסף אל checkout לא מאומת.
3. כל ערוץ נמדד: קישור בלי UTM לא יוצא החוצה.
4. הודעות שיווק בדיוור: opt-in בלבד (סעיף 30א); רשימת התפוצה הישנה מ-WP לא נטענת בלי ראיית הסכמה.

---

## 1. SEO migration מ-WP (הפניות 301)

### 1.1 מלאי ה-URLs הישנים

נגזר מה-WXR (‏`refs/wp-export/wp-export.xml`‏, ראה WP-MIGRATION-PLAN §0):

| סוג URL ישן | תבנית | כמות | יעד חדש |
|---|---|---|---|
| מוצר | `/product/{slug}/` | 48 | `/product/{slug}` (slug נשמר ככלל) |
| קטגוריה | `/product-category/{slug}/` | 11 | `/category/{slug}` |
| חנות | `/shop/` | 1 | `/products` |
| עגלה / checkout ישנים | `/cart/`, `/checkout/` | 2 | `/cart`, `/checkout` |
| עמודי תוכן | `/{page-slug}/` | 28 | עמוד חדש רלוונטי או דף הבית |
| חיפוש WP | `/?s={q}&post_type=product` | query | `/search?q={q}` |
| תגיות | `/product-tag/{slug}/` | 43 | `/products` (אין עמודי תגית ביום 1) |

### 1.2 כללי מיפוי

| כלל | פירוט |
|---|---|
| מוצר שנשמר לו slug | ‏301 ישיר 1:1; לא דרך דף הבית |
| מוצר שלא מיובא / לא published | ‏301 לקטגוריה שלו, לא 404 ולא דף הבית |
| עמוד תוכן בלי מקבילה | ‏301 לדף הבית; מתועד ברשימת "ויתורים" |
| trailing slash | הגרסה הישנה עם `/` בסוף; ה-301 בולע את שתי הצורות |
| slugs בעברית | ההשוואה על הצורה המפוענחת (URL-decode) וגם המקודדת |
| שרשור | אסור 301 → 301; כל ישן מפנה ישירות לסופי |

### 1.3 ביצוע ואימות

| שלב | פעולה |
|---|---|
| בנייה | טבלת מיפוי אחת (‏CSV/JSON בגרסה) → `next.config` redirects או middleware |
| בדיקה לפני cutover | סקריפט שרץ על כל ה-URLs הישנים ומאמת 301 + יעד 200; הפלט נשמר כראיה |
| Google Search Console | אימות בעלות על הדומיין נשאר; הגשת sitemap חדש ביום ה-cutover; מעקב Coverage שבועיים |
| ניטור אחרי | דוח 404 מהלוגים בשבוע הראשון; כל 404 עם referrer חיצוני מקבל שורת 301 חדשה |

שער: ‏MAP4 ב-WP-MIGRATION-PLAN (כל slug ישן מכוסה) חוסם cutover.

---

## 2. Google Merchant Center

### 2.1 הכנה

| # | פריט | הערה |
|---|---|---|
| GM1 | חשבון Merchant Center מאומת על `kenyonexpress.co.il` | דרך GSC |
| GM2 | פיד מוצרים: endpoint פנימי שמייצר XML/TSV מ-products published | לא ידני |
| GM3 | שדות פיד: id (product uuid), title (name_he), description, link, image_link (R2), price "X.XX ILS", availability, condition=new, brand אם קיים | |
| GM4 | ‏identifier_exists=no למוצרים בלי GTIN/MPN | רוב הקטלוג |
| GM5 | מדיניות אתר: עמודי משלוח/החזרות/פרטיות נגישים (LEGAL-PAGES) | דרישת אישור חשבון |

### 2.2 סייג קופונים (חשוב)

מדיניות Shopping אוסרת gift cards ומגבילה vouchers/שירותים; **מוצרי קופון כנראה לא זכאים לפיד**. החלטה:

| סוג | בפיד? |
|---|---|
| מוצר פיזי | כן |
| קופון | לא ביום 1; בחינה פר-מקרה מול המדיניות אם הקופון הוא בפועל מוצר עם מחיר מלא |

הפיד מסנן לפי `type='physical'`. שליחת קופונים לפיד ודחייתם מסכנת את החשבון כולו.

### 2.3 מדידה

קליקים מ-Shopping מסומנים utm אוטומטית (auto-tagging של Ads אם ירוץ קמפיין PMax בהמשך); ההמרות נמדדות ב-purchase השרתי (ANALYTICS §2.3), לא בפיקסל בלבד.

---

## 3. קמפיין השקה

### 3.1 שלבים

```
שלב A (soft-launch): בלי מדיה בתשלום.
  קהל: ספקים קיימים + מכרים. מטרה: 20-50 עסקאות אמיתיות נקיות.
שלב B (השקה ציבורית): אחרי P0+P1 ירוקים.
  ערוצים: Google (מותג + Shopping לפיזי), פייסבוק/אינסטגרם מקומי,
  וואטסאפ של בתי העסק המשתתפים.
שלב C (צמיחה): הרחבה לפי CAC נמדד מול AOV ו-platform_revenue.
```

### 3.2 ערוצים ו-UTM (מוסכמה מחייבת)

| ערוץ | utm_source | utm_medium | הערה |
|---|---|---|---|
| Google Ads | google | cpc | auto-tagging + gclid |
| פייסבוק/אינסטגרם | facebook / instagram | paid_social | |
| וואטסאפ ספקים | whatsapp | referral | קישור פר ספק: utm_campaign=supplier_{slug} |
| דיוור Resend | newsletter | email | רק opt-in |
| אורגני/ישיר | בלי UTM | | לא מזייפים source |

‏utm_campaign להשקה: `launch_2026`. הצמדת ה-UTM לאירועי הכסף לפי ANALYTICS §5.

### 3.3 נכסי השקה

| נכס | תלות |
|---|---|
| עמוד נחיתה = דף הבית (לא עמוד נפרד) עם קופוני ההשקה | קטלוג published |
| קרוסלת "מבצעי השקה" | אדמין מסמן מוצרים |
| באנר הטבת ארנק להרשמה (אם הבעלים מאשר תקציב קאשבק) | wallet חי + נוסח legal |
| חומרים לספקים: פוסטר QR לעסק + טקסט מוכן לוואטסאפ/סטורי | עיצוב חד-פעמי |

### 3.4 שערי עצירה לקמפיין

| תנאי | פעולה |
|---|---|
| checkout error rate מעל 2% | השהיית מדיה בתשלום מיד |
| CAC גדול מ-platform_revenue ממוצע לעסקה פי 3 | עצירת ערוץ וכיול |
| ספק לא עומד בעומס מימושים | הורדת הקופון מהקרוסלה |

---

## 4. לוח זמנים יחסי (T = cutover)

| מתי | פעולה |
|---|---|
| T-7 | טבלת 301 סגורה + סקריפט אימות ירוק על staging |
| T-3 | Merchant Center מאומת; פיד פיזי בסטטוס approved על דומיין זמני/staging אם אפשר |
| T | ‏cutover DNS; הגשת sitemap; אימות 301 בייצור |
| T+1 עד T+14 | ניטור GSC יומי (Coverage, 404); בלי מדיה בתשלום |
| T+14 בערך | אם 72 שעות + שבועיים נקיים: שלב B |

---

## 5. Out of scope

- תוכנית שותפים / אפיליאציה
- משפיענים בתשלום ביום 1
- אפליקציה (ראה MOBILE-APP)
- SEO תוכן (בלוג) לפני שהקטלוג יציב

---

## 6. Revision

| Date | Change |
|---|---|
| 2026-07-31 | rev A: טבלת 301 מלאה מה-WXR, מפרט Merchant עם סייג קופונים, קמפיין תלת-שלבי עם שערי עצירה |
