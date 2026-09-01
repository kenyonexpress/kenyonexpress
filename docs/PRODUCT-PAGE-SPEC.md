# PRODUCT-PAGE-SPEC - מפרט דף מוצר וטופס הניהול (מסמך אחד)

נוצר: 2026-07-24. עודכן: 2026-07-28. ענף: `feat/checkout-complete`.

**המסמך הזה בולע את `PRODUCT-ADMIN-FORM.md`.** אין שני מסמכים: מה שהאדמין ממלא
ומה שהלקוח רואה הם שני צדדים של אותו שדה, והפרדתם היא בדיוק מקור הדריפט. כל שדה
מופיע כאן פעם אחת, עם העמודה שמאחוריו, מי רואה אותו, והאם הוא חובה.
המיזוג בוצע ב-24.07 והקובץ הנפרד אינו קיים בעץ ולא בהיסטוריית git.

> **עדכון 2026-07-28.** שלושה דברים שהמסמך תיאר כחסומים נסגרו: ‏C11 הוכרעה
> (Escrow, גרסה ב), ‏`platform_percent` ו-`coupon_expiry_days` הם שדות בטופס
> האדמין, והטופס שומר גם את `supplier_split_percent`. הפער שנותר פתוח בפאזה 0
> הוא רצפת 120 היום, שאינה נאכפת עדיין. פירוט ב-§9 ו-§10.

מקורות שאוחדו לתוך המסמך:
- `docs/product-page/KenyonExpress_קובץ_אב_דף_מוצר.docx` - קובץ האב של Ofir, 16 קבוצות שדות
- `docs/BUSINESS-MODEL.md` - שלושת סוגי המוצרים ופרטי הספק החובה
- `docs/CONTRADICTIONS.md` - ההכרעות העסקיות C1-C10 (גובר על כל נוסח כאן)
- `docs/ARCHITECTURE-LEGAL-COMPLIANCE.md` §1.1-1.2 - חוק הגנת הצרכן
- הסכימה בפועל: `005`, `042`, `048`, `050`, ו-`027` (טיוטה)
- `src/components/admin/ProductForm.tsx` - 34 השדות שכבר קיימים בטופס

**היררכיה**: `docs/CONTRADICTIONS.md` גובר. `ARCHITECTURE-LEGAL-COMPLIANCE.md`
גובר בענייני דין. כל מספר עמלה שמופיע בקובץ האב (למשל "עמלת פלטפורמה 10%") הוא
שריד ובטל - ראו §3.

---

## 1. מקרא

| סימון | משמעות |
|---|---|
| 🟢 לקוח | מוצג בדף המוצר הציבורי |
| 🔵 פנימי | admin / ספק בלבד, **לעולם לא מגיע ל-DOM של הלקוח** |
| **חובה** | שמירה נכשלת בלעדיו (ולידציית zod ב-server action, לא רק ב-UI) |
| חובה-פרסום | אפשר לשמור טיוטה בלעדיו, אסור לעבור ל-`status = 'active'` |
| ⛔ חסר | אין עמודה בסכימה ואין שדה בטופס. ראו טיוטת המיגרציה ב-§8 |

---

## 2. שדות ניהול - הטופס המלא

### 2.1 כותרת ומיקום

| שדה | עמודה | חובה | מי רואה | מצב |
|---|---|---|---|---|
| שם המוצר/דיל | `products.name_he` | **חובה** | 🟢 | קיים |
| שם באנגלית | `products.name_en` | | 🔵 | קיים |
| Slug | `products.slug` | **חובה**, UNIQUE | 🟢 (URL) | קיים |
| שם העסק | `suppliers.name` דרך `supplier_id` | **חובה** | 🟢 | קיים |
| עיר | `suppliers.city` | חובה-פרסום | 🟢 גם על הכרטיס בדף הבית | קיים (027) |
| כתובת מלאה | `suppliers.address` | חובה-פרסום | 🟢 | קיים (027) |
| קטגוריה | `products.category_id` | חובה-פרסום | 🟢 breadcrumb | קיים |
| תגיות (דיל חם / מומלץ / חדש) | `products.badges` | | 🟢 | ⛔ חסר |
| מומלץ | `products.is_featured` | | 🟢 | קיים |

### 2.2 תמחור

**כלל על**: כל מחיר מוצג ללקוח **כולל מע"מ** (חוק הגנת הצרכן 17ד, איסור הצגת
מחיר חלקי). אין מקום בטופס שמזינים בו מחיר לפני מע"מ.

| שדה | עמודה | חובה | מי רואה | מצב |
|---|---|---|---|---|
| מחיר מקורי (חוצה קו) | `products.full_price` | חובה-פרסום | 🟢 | קיים |
| מחיר דיל / מחיר סופי | `products.kenyon_price` | **חובה** | 🟢 | קיים |
| כמה חוסכים ₪ + % | מחושב מהשניים | - | 🟢 | קיים (UI) |
| מחיר ליחידה | מחושב | - | 🟢 | ⛔ חסר |
| מחיר עלות | `products.cost_ils` | | 🔵 | קיים בסכימה, **לא בטופס** |
| **`platform_percent`** | `products.platform_percent` (‏`platform_bp` מאז 059) | **חובה, בלי ברירת מחדל** | 🔵 | ✅ עמודה (050/070) **ושדה חובה בטופס** מ-2026-07-28 |
| `supplier_split_percent` | `products.supplier_split_percent` | **חובה** | 🔵 מוצג כתווית חיה ליד האחוז | ✅ נשמר, נגזר ב-server action כ-`100 −` הקלט. ה-CHECK ‏`products_split_pair_sums_to_100` (070) מסופק בבנייה |
| `cashback_percent` | `products.cashback_bp` (שונה שם ב-059) | ברירת מחדל 0 | 🟢 (כהטבה) | עמודה קיימת, **לא בטופס** |
| רווח גולמי | מחושב: `kenyon_price - cost_ils - עמלה` | - | 🔵 | ⛔ חסר |
| קוד הנחה נוסף | ישות נפרדת (promotions) | | 🟢 | מחוץ להיקף |

> **נסגר 2026-07-28.** ‏`platform_percent` הוא שדה חובה בטופס
> (`ProductForm.tsx`) ובסכימת ה-zod של `upsertProduct`, והטופס שומר את שני
> חצאי הפיצול. מה שנשאר חוסם את החלת 050/070 הוא **הדאטה ולא ה-UI**: הן זורקות
> בכוונה כל עוד קיים מוצר חי בלי אחוז, ולכן צריך מעבר על הקטלוג לפני ההחלה.
> ראו משימה 0.3 ב-§9.

### 2.3 סוג ומימוש

| שדה | עמודה | חובה | מי רואה | מצב |
|---|---|---|---|---|
| סוג | `products.type` (`physical` / `coupon`) | **חובה** | 🟢 | קיים |
| מנוי / חיוב חוזר | `products.type = 'subscription'` | | 🟢 | ⛔ חסר (BUSINESS-MODEL §ג) |
| סטטוס | `products.status` | **חובה** | - | קיים |
| קופון פעיל | `products.is_coupon_enabled` | | - | קיים |
| **תוקף השובר בימים** | `products.coupon_expiry_days` | **חובה לקופון** | 🟢 | ✅ עמודה (042) **ושדה בטופס** מ-2026-07-28, `required` על מוצר קופון. ראו §5 |
| כמות זמינה | `products.stock_quantity` | | 🟢 | קיים |
| סף מלאי נמוך | `products.low_stock_threshold` | ברירת מחדל 5 | 🔵 | קיים |
| מקסימום ללקוח | `products.max_per_order` | | 🟢 | קיים |
| שיטת מימוש | QR חתום - קבוע במערכת | - | 🟢 | קיים (027) |
| הוראות מימוש | `products.redemption_instructions_he` | חובה-פרסום לקופון | 🟢 | קיים |
| תיאום מראש? | `products.requires_reservation` | | 🟢 | ⛔ חסר |
| קנייה מינימלית | `products.min_purchase_ils` | | 🟢 | קיים |

### 2.4 אופציות הדיל

| שדה | עמודה | מי רואה | מצב |
|---|---|---|---|
| אופציה (שם + מחיר + מה כלול) | `product_variants` | 🟢 | קיים (014), בטופס דרך `variants` |
| מה כלול בכל אופציה | `product_variants.included_he` | 🟢 | ⛔ חסר |

### 2.5 גלריה ומדיה

| שדה | עמודה | חובה | מי רואה | מצב |
|---|---|---|---|---|
| תמונה ראשית | `products.images[0]` | חובה-פרסום | 🟢 | קיים |
| גלריית תמונות | `products.images` + `media_assets` (049) | | 🟢 | קיים |
| Alt עברית | `media_assets.alt_he` | **חובה** | 🟢 (a11y) | קיים (049) |
| וידאו | `products.video_url` | | 🟢 | קיים |

### 2.6 תיאור ותוכן

| שדה | עמודה | חובה | מי רואה | מצב |
|---|---|---|---|---|
| תיאור קצר | `products.short_description_he` | חובה-פרסום | 🟢 | קיים |
| תיאור מלא | `products.description_he` | חובה-פרסום | 🟢 | קיים |
| יתרונות עיקריים | `products.highlights` jsonb | | 🟢 | קיים |
| מותג | `products.brand` | | 🟢 | קיים |
| איך מממשים (1-2-3-4) | `products.redemption_instructions_he` | | 🟢 | קיים |
| Fun Fact | `products.fun_fact_he` | | 🟢 | ⛔ חסר |
| שאלות נפוצות | `products.faq` jsonb | | 🟢 | ⛔ חסר |

### 2.7 משלוח (פיזי בלבד)

| שדה | עמודה | מי רואה | מצב |
|---|---|---|---|
| דורש משלוח | `products.requires_shipping` | 🔵 | קיים |
| משקל (גרם) | `products.weight_grams` | 🔵 | קיים |
| מידות | `length_cm` / `width_cm` / `height_cm` | 🔵 | קיים |
| מצב פריט | `products.condition` | 🟢 | קיים |
| אחריות (חודשים) | `products.warranty_months` | 🟢 | קיים |
| מי שולח | `products.fulfilled_by` | 🔵 | ⛔ חסר |
| עלות משלוח | `products.shipping_cost_ils` | 🟢 | ⛔ חסר |
| זמן אספקה (ימי עסקים) | `products.delivery_days` | 🟢 **חובה חוקית**, ראו §4 | ⛔ חסר |

### 2.8 SEO

| שדה | עמודה | מי רואה | מצב |
|---|---|---|---|
| meta title | `products.seo_title` | 🔵 | קיים |
| meta description | `products.seo_description` | 🔵 | קיים |
| keywords | `products.seo_keywords` | 🔵 | קיים |

### 2.9 מה כבר יש בטופס היום

`src/components/admin/ProductForm.tsx` מכיל 34 שדות: `name_he`, `name_en`,
`slug`, `sku`, `description_he`, `category_id`, `type`, `status`, `kenyon_price`,
`full_price`, `stock_quantity`, `is_featured`, `is_coupon_enabled`,
`short_description_he`, `highlights`, `brand`, `video_url`, `barcode`,
`coupon_terms_he`, `redemption_instructions_he`, `min_purchase_ils`,
`low_stock_threshold`, `max_per_order`, `condition`, `requires_shipping`,
`weight_grams`, `length_cm`, `width_cm`, `height_cm`, `warranty_months`,
`seo_title`, `seo_keywords`, `seo_description`, `images` + `variants`.

מאז 2026-07-28 נוספו שניים: **`platform_percent`** (חובה, עם תווית חיה שמראה
את חלק הספק) ו-**`coupon_expiry_days`** (חובה על מוצר קופון). ה-server action
מוסיף `supplier_split_percent` נגזר, בלי שדה נוסף בטופס.

**החסרים הכספיים שנותרו**: `cashback_bp` ו-`cost_ils`. שניהם לא חוסמים מכירה:
הראשון מגביל את מנוע הקאשבק לערך 0, השני חוסם תצוגת רווח גולמי לאדמין.

---

## 3. עמלת הפלטפורמה - הכלל שגובר על קובץ האב

קובץ האב כותב "עמלת פלטפורמה 10%". **הנוסח הזה בטל** מאז ההכרעה של 2026-07-24:

- `products.platform_percent` הוא **שדה חובה פר-מוצר שהאדמין מזין**, `NOT NULL`
  בלי `DEFAULT` בשום מקום (C1, מיגרציה 050).
- **עמודה אחת בלבד.** `products.commission_percent` יצא משימוש כידית פיצול (C2).
  `suppliers.commission_percent` ו-`vendors.commission_rate` הם **הצעה** שמוצגת
  בזמן יצירת מוצר לספק, ולא נקראים בקופה או בהתחשבנות.
- העמלה מחושבת **על הסכום שעבר דרך הפלטפורמה בלבד** - המקדמה שנגבתה באתר, לא
  שווי הדיל המלא (C5).
- האחוז מצולם ל-`order_items.platform_percent` בזמן הקנייה. שינוי האחוז על
  המוצר לא מזיז דוחות עבר (C10).

**מחיר הקופון אינו נגזרת של האחוז** (C4): הוא שדה חופשי פר-מוצר. דיל בשווי 100
עם קופון 10 באתר הוא החלטת תמחור, לא "10%".

### 3.1 ‏C11 הוכרעה (2026-07-27) - גרסה (ב)

השאלה שהייתה פתוחה כאן, מי מקבל את המקדמה כשה-held נסגר, נסגרה סופית ‏**וההכרעה
הפוכה ממה שנכתב כאן קודם**: ‏**הפלטפורמה שומרת ‏100% מהמקדמה, לצמיתות, ושום חלק
ממנה לא משוחרר לספק, לא במימוש ולא אחריו.** הספק גובה את היתרה במזומן מהלקוח
בדלפק, והכסף הזה לא עובר דרך חשבון הסליקה שלנו.

‏**אין Escrow בשום צורה** (הוכרע 24.07.2026, מיגרציה ‏125 הסירה את המסלול):
אין נאמן חיצוני, אין ‏J5, אין החזקה על הכרטיס ואין ‏held פנימי.
‏`escrow_holds` עדיין קיימת בפרודקשן עם ‏2 שורות היסטוריות ואף כותב בקוד לא נוגע
בה, וערכי ה-enum ‏`escrow_held` ו-`escrow_released` הם תוויות מתות ש-`SettlementState`
מסרב להן במפורש. פירוט: `docs/PAYMENT-FLOW.md` §5.

מה שנובע מכך למסמך הזה:

- **שני האחוזים הם עמודות.** ‏`platform_percent` ו-`supplier_split_percent`,
  עם CHECK שסכומם 100 (מיגרציה 070). ערך נגזר לא היה שורד את ה-snapshot
  ל-`order_items` שדוחות עבר נשענים עליו (C10).
- **האחוז חל גם על קופון.** קודם הוא נדרס ל-0 בקופונים; תחת המודל הזה 0% היה
  נותן לספק את כל המקדמה.
- **הבלוק הכספי לספק בדף המוצר כבר לא חסום.** אפשר להציג לספק "כמה תקבל":
  ‏`supplier_split_percent` מהמקדמה, משוחרר במימוש, ובתוספת T+3 ימי עסקים
  ומינימום 100 ש"ח לצבירה (C8). מה שעדיין לא נבנה הוא הרכיב עצמו, לא ההכרעה.

---

## 4. הבלוק החוקי - חוק הגנת הצרכן, עסקת מכר מרחוק

כל מכירה באתר היא **עסקת מכר מרחוק** (חוק הגנת הצרכן, התשמ"א-1981, סעיפים
14ג, 14ג1, 14ה, 14ח). הבלוק הזה הוא **קבוע בכל דף מוצר**, לא אופציונלי, ולא
נשלט על ידי הספק.

### 4.1 גילוי מוקדם (14ג(א)) - שבעת השדות שחייבים להופיע

| דרישת הדין | מקור הנתון | חובה |
|---|---|---|
| שם העוסק + ח.פ / מס' עוסק | `suppliers.legal_name` + `suppliers.business_id` (027) | **חובה** |
| כתובת העוסק | `suppliers.address` + `suppliers.city` | **חובה** |
| תכונות הנכס / השירות | `products.description_he` + `highlights` | **חובה** |
| מחיר כולל מע"מ | `products.kenyon_price` - תמיד מוצג כולל | **חובה** |
| תנאי תשלום | קבוע: Cardcom, כרטיס אשראי | קבוע |
| מועד ומקום אספקה | פיזי: `delivery_days` ⛔ · קופון: כתובת העסק | **חובה** |
| תקופת תוקף ההצעה | `products.offer_valid_until` ⛔ | **חובה** |
| פרטי אחריות | `products.warranty_months` + `warranty_terms_he` ⛔ | **חובה** |
| זכות ביטול | נוסח קבוע + קישור `/cancel` | קבוע |

### 4.2 זכות ביטול (14ג(ג)) ודמי ביטול (14ה)

- **נכס פיזי**: 14 יום מקבלת הנכס או ממסמך הגילוי, המאוחר. החלון מחושב ב-DB
  מ-`delivered_at`, **לא ב-UI**.
- **קופון / שירות**: 14 יום מיום העסקה (`orders.paid_at`), ולא פחות מ-2 ימי
  עבודה לפני מועד השירות.
- **דמי ביטול**: עד 5% או 100 ש"ח, **הנמוך מביניהם**, ורק כשהביטול אינו עקב
  פגם / אי התאמה / אי אספקה. ביטול עקב פגם = 0 דמי ביטול + החזר מלא.
- **החזר תוך 14 יום** ממועד ההודעה, **באופן שבו שולם**: החלק שבכרטיס חוזר
  לכרטיס דרך Cardcom refund, החלק מהארנק חוזר לארנק.
- **ביטול מקוון חובה** (14ט): קישור "ביטול עסקה" קבוע ב-footer + עמוד `/cancel`
  ציבורי, נגיש גם בלי התחברות.

### 4.3 חריגי זכות הביטול (14ג(ד))

שדה `products.cancellation_exempt` (boolean) + `cancellation_exempt_reason` ⛔.
**ברירת מחדל: לא מוחרג.** החריגים: טובין פסידים; מידע או תוכן דיגיטלי; טובין
שיוצרו במיוחד לפי הזמנה; טובין הניתנים להעתקה שאריזתם נפתחה; שירותי הארחה,
נסיעה, חופש או בילוי כשמועד הביטול חל בתוך 7 ימים שאינם ימי מנוחה לפני מועד
השירות. ההחרגה **מוצגת בדף המוצר** ובמסמך הגילוי.

### 4.4 שוברים וכלל 5 השנים (14ח)

- תוקף הדיל נקבע פר מוצר, **מינימום מחייב 4 חודשים** מיום הרכישה. ה-UI חוסם
  ערך קצר מזה (ולידציית zod ב-server action).
- קופון שפג בלי מימוש: **הסכום ששולם מזוכה אוטומטית לארנק הלקוח** במלואו (C6),
  `wallet_reason = 'refund_credit'`, ותוקפו 5 שנים מיום הזיכוי. אין הפקעה
  לטובת הפלטפורמה.
- הקופון עצמו מציג: תוקף, שם העסק, ח.פ, הסכום ששולם, היתרה לתשלום בעסק, ותנאי
  המימוש (snapshot על `coupon_codes`).

### 4.5 "תנאים והגבלות" פר מוצר

`products.coupon_terms_he` (קיים) הוא **האותיות הקטנות הייחודיות למוצר בלבד**:
מימוש חד-פעמי, אין כפל מבצעים, לא כולל מס או דמי שירות, ימים ושעות מוחרגים.
**הוא לא מחליף את הבלוק החוקי** של §4.1-4.4, שהוא גנרי ונשלט על ידי הפלטפורמה.

### 4.6 מסמך הגילוי בכתב (14ג(ב))

נשלח לא יאוחר ממועד האספקה, כ-`notifications_outbox` בסוג `order_disclosure`,
בתוך טרנזקציית ה-`paid`. מכיל את כל §4.1 + מדיניות הביטול המלאה + snapshot
מההזמנה, עם `wording_version`.

---

## 5. `expiry_days` - שדה אחד, שם אחד

**השם הקנוני הוא `products.coupon_expiry_days`.** הוא קיים מ-042, ומיגרציה 050
§5 מצהירה עליו מפורשות. **לא נוצרת עמודת `expiry_days` נוספת** - עמודה שנייה
לאותו מושג היא בדיוק סוג הדריפט שהמסמך הזה נועד לסגור.

| היבט | הכרעה |
|---|---|
| טיפוס | `integer`, ימים |
| ערכים מוצעים ב-UI | 30 / 60 / 90, עם קלט חופשי לכל מספר אחר (C7) |
| מינימום נאכף | **120 יום** (4 חודשים) לקופונים - §4.4, נאכף ב-zod בצד השרת |
| `physical` | 0 |
| חובה | כן לקופון. אין ברירת מחדל שקטה |
| בטופס | ✅ מ-2026-07-28: שדה `coupon_expiry_days`, ‏`required` כשהמוצר קופון, בלי ערך התחלתי |
| חישוב `expires_at` | `min(issued_at + coupon_expiry_days, offer_valid_until)` בזמן ההנפקה, מצולם ל-`vouchers.expires_at` (‏073) ולא מחושב מחדש לעולם. ‏`coupon_codes` הוא המסלול ההיסטורי מלפני 073 |
| מה קורה כשהשדה ריק | ההנפקה **נכשלת בקול**. עד 2026-07-28 `finalize.ts` השלים `?? 90` בשקט: הבטחה צרכנית שאיש לא נתן, ושקובעת מתי מגיע ללקוח כספו חזרה |
| בפקיעה | זיכוי מלא לארנק הלקוח (C6), לא הפקעה ולא זיכוי אשראי |
| בייבוא מ-WP | התוקף המקורי מה-plugin נשמר כמות שהוא, לא מחושב מחדש |

---

## 6. שדות ספק חובה - בכל שלושת סוגי המוצרים

מ-`BUSINESS-MODEL.md` §2: אלה שדות **חובה בכל דף מוצר**, ללא קשר לסוג. מוצר לא
עובר ל-`active` בלי כולם.

| שדה | עמודה | מי רואה | מצב |
|---|---|---|---|
| שם העסק | `suppliers.name` | 🟢 | קיים |
| שם משפטי + ח.פ | `suppliers.legal_name` + `business_id` | 🟢 (חובה חוקית §4.1) | קיים (027, לא הוחל) |
| כתובת מלאה | `suppliers.address` | 🟢 | קיים (027) |
| עיר | `suppliers.city` | 🟢 גם על תמונת הדיל | קיים (027) |
| קואורדינטות lat/lng | `suppliers.lat` / `suppliers.lng` | 🟢 (מיון לפי מרחק) | ⛔ חסר על `suppliers` (קיים רק על `coupon_deals` מ-015) |
| לינק Waze | נגזר מ-lat/lng | 🟢 לחיצה פותחת ניווט | ⛔ |
| מפה מוטמעת | נגזר מ-lat/lng | 🟢 | ⛔ |
| טלפון | `suppliers.contact_phone` | 🟢 לחיצה פותחת WhatsApp | קיים (005) |
| WhatsApp לבעל העסק | `suppliers.whatsapp_phone` | 🟢 הודעה מוכנה | ⛔ (נופל ל-`contact_phone`) |
| שעות פתיחה | `suppliers.opening_hours` jsonb | 🟢 | ⛔ חסר |
| אימייל הספק | `suppliers.contact_email` | 🔵 התראות | קיים |
| מק"ט | `products.sku` | 🔵 | קיים |
| הערות פנימיות | `products.admin_notes` | 🔵 | ⛔ חסר |

**מיקום גולש (geo)**: `lat`/`lng` על `suppliers` הם התנאי ל-`BUSINESS-MODEL` §3
(מיון "קרוב אליי", דף בית לפי אזור). בלעדיהם כל פיצ'ר הגאו מת. זו הסיבה שהם
מסומנים כאן חובה ולא nice-to-have.

---

## 7. UX ואייקוני אמון

### 7.1 עקרונות

- **RTL מלא.** כיוון, יישור, ומיקום האייקונים ביחס לטקסט. אין `margin-left`
  קשיח - רק `margin-inline-start`.
- **ללא CLS**: לכל תמונה, טיימר ומונה יש מקום שמור מראש.
- **הבלוק החוקי (§4) תמיד נגיש בלי לחיצה** - מקופל מותר, מוסתר מאחורי טאב לא.
- **מובייל קודם**: הכפתור הראשי (קנייה) דביק בתחתית המסך במובייל.

### 7.2 סדר הבלוקים בדף (מלמעלה)

1. גלריה + תגיות
2. שם המוצר + שם העסק + עיר + breadcrumb
3. תמחור: מחיר דיל, מחיר מקורי חוצה קו, חיסכון ב-₪ ובאחוזים
4. אופציות הדיל (variants) + "מה כלול"
5. **שורת אייקוני אמון** (§7.3)
6. כפתור קנייה + מועדפים + שיתוף
7. תיאור קצר → תיאור מלא → יתרונות → איך מממשים
8. פרטי העסק: מפה, Waze, שעות, טלפון/WhatsApp
9. **תנאים והגבלות פר מוצר** (`coupon_terms_he`)
10. **הבלוק החוקי הקבוע** (§4) - שם העוסק, ח.פ, מחיר כולל מע"מ, אספקה, אחריות, זכות ביטול
11. FAQ
12. Upsell: "עוד מ-[העסק]" ואז "אולי תאהב"

### 7.3 אייקוני אמון - לפי סוג המוצר

הרשימה **נגזרת מסוג המוצר ומהשדות שמולאו**, לא נבחרת ידנית. אייקון שאין לו
גיבוי בנתונים לא מוצג. זה ההבדל בין אות אמון לבין קישוט.

| אייקון | מוצג כאשר | סוג |
|---|---|---|
| תשלום מאובטח Cardcom | תמיד | הכל |
| עסק מאומת | `suppliers.status = 'active'` ויש `business_id` | הכל |
| אחריות X חודשים | `warranty_months > 0` | פיזי |
| החזר תוך 14 יום | `cancellation_exempt = false` | הכל |
| מוצר מקורי | `condition = 'new'` | פיזי |
| תוקף עד DD/MM | `coupon_expiry_days` מולא | קופון |
| מימוש מיידי בסריקה | תמיד לקופון | קופון |
| ביטול מנוי בכל עת | תמיד למנוי (14ג1) | מנוי |
| משלוח חינם | `shipping_cost_ils = 0` | פיזי |

### 7.4 דחיפות - בגבולות הדין

חוק הגנת הצרכן אוסר הצגה מטעה. לכן:

- **טיימר ספירה לאחור**: מוצג **רק** כשיש `offer_valid_until` אמיתי בעמודה.
  אסור טיימר מתגלגל שמתאפס.
- **"X נמכרו היום" / "כמה כבר קנו"**: **רק** ספירה אמיתית מ-`order_items`.
  אסור מספר מומצא או מוגדל.
- **"נותרו X במלאי"**: רק כש-`stock_quantity <= low_stock_threshold`.

---

## 8. טיוטת מיגרציה - `081_product_page_fields.sql`

**טיוטה בלבד, לא נכתבה כקובץ ולא הוחלה.** אידמפוטנטית, forward-only, לפי
`.claude/skills/supabase-migrations`. סוגרת את כל ה-⛔ שסומנו למעלה.

> **מספור (תוקן 2026-07-28):** הטיוטה נשאה את המספר 052, שתפוס בפועל על ידי
> `052_product_approval_workflow.sql`. המספר הפנוי הבא אחרי `080` הוא **081**.
>
> **יחידות (תוקן 2026-07-28):** ‏`shipping_cost_ils numeric(10,2)` היה סותר את
> מיגרציה 059, שהעבירה את כל הכסף ל-`integer` באגורות. הטיוטה משתמשת עכשיו
> ב-`shipping_cost_agorot integer`. עמודת numeric חדשה לכסף הייתה נכנסת לעץ
> אחרי שכל שאר המערכת יצאה ממנו.

```sql
-- 081_product_page_fields.sql
-- Closes the gaps in docs/PRODUCT-PAGE-SPEC.md: legal disclosure fields
-- (Consumer Protection Law 14c), supplier geo/contact, and product page content.
-- Idempotent, forward-only. Adds NO commission default (CONTRADICTIONS C1).

-- 1. Legal disclosure on the product (section 4.1)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS delivery_days               integer,
  ADD COLUMN IF NOT EXISTS shipping_cost_agorot        integer CHECK (shipping_cost_agorot IS NULL OR shipping_cost_agorot >= 0),
  ADD COLUMN IF NOT EXISTS fulfilled_by                text,
  ADD COLUMN IF NOT EXISTS offer_valid_until           timestamptz,
  ADD COLUMN IF NOT EXISTS warranty_terms_he           text,
  ADD COLUMN IF NOT EXISTS cancellation_exempt         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_exempt_reason  text;

DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_exempt_reason_required
    CHECK (NOT cancellation_exempt OR cancellation_exempt_reason IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_fulfilled_by_valid
    CHECK (fulfilled_by IS NULL OR fulfilled_by IN ('supplier', 'platform'));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Content (section 2.6) and merchandising (section 2.1)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fun_fact_he          text,
  ADD COLUMN IF NOT EXISTS faq                  jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS badges               jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS requires_reservation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_notes          text;

-- 3. Coupon validity floor (section 5). 4 months, and only for coupons.
--    NOT a default: a coupon with no value still fails NOT NULL upstream.
DO $$ BEGIN
  ALTER TABLE public.products
    ADD CONSTRAINT products_coupon_expiry_floor
    CHECK (
      type <> 'coupon'::public.product_type
      OR coupon_expiry_days IS NULL
      OR coupon_expiry_days >= 120
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 4. Supplier geo + contact (section 6). Unblocks BUSINESS-MODEL section 3.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS lat            double precision,
  ADD COLUMN IF NOT EXISTS lng            double precision,
  ADD COLUMN IF NOT EXISTS whatsapp_phone text,
  ADD COLUMN IF NOT EXISTS opening_hours  jsonb;

DO $$ BEGIN
  ALTER TABLE public.suppliers
    ADD CONSTRAINT suppliers_latlng_range
    CHECK (
      (lat IS NULL AND lng IS NULL)
      OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS suppliers_latlng_idx
  ON public.suppliers (lat, lng) WHERE lat IS NOT NULL;

-- 5. Variant contents (section 2.4)
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS included_he text;

-- 6. Documentation of intent
COMMENT ON COLUMN public.products.offer_valid_until IS
  'Offer validity end (Consumer Protection Law 14c(a)). The ONLY source for a countdown timer on the product page: no rolling timers.';
COMMENT ON COLUMN public.products.cancellation_exempt IS
  'Exempt from the 14-day right of cancellation under 14c(d). Default false. Requires an explicit reason and is shown on the product page.';
COMMENT ON COLUMN public.suppliers.opening_hours IS
  'jsonb: {"sun":[["09:00","17:00"]], ..., "sat":[]}. Empty array = closed that day.';
```

**מה המיגרציה הזו במפורש לא עושה**: לא נוגעת ב-`platform_percent` ובזוג הפיצול
(סגורים ב-050 ו-070), לא יוצרת `expiry_days` נוספת (§5), ולא מוסיפה שום ברירת
מחדל לעמלה.

**תלות סדר:** ‏081 מניחה שהמיגרציות 050, 051, 070, 079 ו-080 הוחלו לפניה. אף
אחת מהן לא הוחלה על המרוחק נכון ל-2026-07-28.

---

## 9. סדר מימוש בפאזות

### פאזה 0 - שער חוסם, בלעדיה שום דבר אחר לא נסגר

| # | משימה | מצב |
|---|---|---|
| 0.1 | `platform_percent` כשדה חובה בטופס האדמין + zod בצד השרת | ✅ 2026-07-28. כולל שמירת `supplier_split_percent` נגזר |
| 0.2 | `coupon_expiry_days` בטופס | ✅ 2026-07-28 כשדה חובה על מוצר קופון. ⚠️ **רצפת 120 היום טרם נאכפת** - ראו למטה |
| 0.3 | מילוי `platform_percent` לכל המוצרים החיים (61 לפי המדידה האחרונה) | פתוח. 050 ו-070 זורקות בכוונה כל עוד יש מוצר חי בלי ערך |
| 0.4 | החלת 050, 051, 070, 079, 080 על המרוחק בסשן אחד, בסדר הזה | פתוח. תלוי ב-0.3 |

**‏C11 הוכרעה** ב-2026-07-27 (§3.1), ולכן אינה חוסמת יותר את 0.4.

> ⚠️ **פער ידוע ב-0.2.** ‏§4.4 ו-§5 קובעים רצפה של 120 יום לתוקף קופון, נאכפת
> ב-zod בצד השרת. הוולידציה שנכתבה ב-2026-07-28 דורשת מספר שלם ‏`>= 1` בלבד,
> כלומר אדמין יכול להזין תוקף של יום אחד ולעבור. השדה קיים והוא חובה, אבל
> הרצפה החוקית אינה נאכפת עדיין, לא ב-zod ולא ב-CHECK של הסכימה
> (`products_coupon_expiry_floor` נמצא בטיוטת §8 ולא נכתב כקובץ). זו משימה
> פתוחה בפאזה 1, ולא היה ראוי לסמן את 0.2 כסגורה בלעדיה.

### פאזה 1 - ציות משפטי

| # | משימה |
|---|---|
| 1.0 | **אכיפת רצפת 120 היום** ל-`coupon_expiry_days`: `min(120)` בסכימת zod של `upsertProduct` + ה-CHECK `products_coupon_expiry_floor` מ-§8 |
| 1.1 | כתיבת `081` לפי §8 והחלתה |
| 1.2 | קומפוננטת `<LegalDisclosure />` - הבלוק הקבוע של §4.1, נבנית מ-`products` + `suppliers`, מופיעה בכל דף מוצר |
| 1.3 | שדות §4.1 בטופס: `delivery_days`, `offer_valid_until`, `warranty_terms_he`, `cancellation_exempt` + סיבה |
| 1.4 | חסימת `status = 'active'` בלי כל שדות חובה-פרסום, כולל `legal_name` + `business_id` של הספק |
| 1.5 | מסמך הגילוי בכתב (§4.6) כ-`order_disclosure` ב-outbox |

### פאזה 2 - פרטי הספק והגאו

| # | משימה |
|---|---|
| 2.1 | טופס ספק: `lat`/`lng` (עם geocoding מהכתובת), `opening_hours`, `whatsapp_phone` |
| 2.2 | בלוק "פרטי העסק" בדף המוצר: מפה, כפתור Waze, שעות, טלפון, WhatsApp עם הודעה מוכנה |
| 2.3 | backfill `lat`/`lng`. **שים לב**: לפי אודיט 2026-07-24 יש במרוחק `suppliers = 0` ו-`vendors = 6`, כלומר איחוד `vendors -> suppliers` (מיגרציה 034 המתוכננת) קודם לכל backfill |
| 2.4 | מיון "קרוב אליי" בקטגוריה ובדף הבית |

### פאזה 3 - תוכן, אמון ו-UX

| # | משימה |
|---|---|
| 3.1 | שדות התוכן: `fun_fact_he`, `faq`, `badges`, `included_he` לוריאציות |
| 3.2 | `<TrustIcons />` נגזר מנתונים לפי §7.3 |
| 3.3 | דחיפות לפי §7.4: טיימר רק מ-`offer_valid_until`, מונים רק מ-`order_items` |
| 3.4 | סדר הבלוקים לפי §7.2 + מעבר RTL ו-CLS |

### פאזה 4 - מסחר מורחב

| # | משימה |
|---|---|
| 4.1 | `type = 'subscription'` (BUSINESS-MODEL §ג) + 14ג1 |
| 4.2 | Buy as a gift, התראת "חזר למלאי" |
| 4.3 | Upsell: "עוד מ-[העסק]", "אולי תאהב", מוצר משלים אחרי הזמנה |
| 4.4 | AI: סיכום ביקורות, יצירת ויזואל לדיל |

---

## 10. פערים פתוחים

1. **רצפת 120 היום לתוקף קופון אינה נאכפת** (§4.4, §5). השדה חובה מ-2026-07-28
   אבל הוולידציה מקבלת יום אחד. חשיפה חוקית, וזה הפער החוסם היחיד שנוצר מהסבב
   של 28.07. משימה 1.0 ב-§9.
2. **‏`cost_ils` ורווח גולמי** - העמודה קיימת ב-005 אבל אין שדה בטופס ואין תצוגת
   רווח לאדמין. לא חוסם מכירה, חוסם החלטת תמחור.
   ‏**‏C11 ירדה מהרשימה**: הוכרעה 2026-07-27, ראו §3.1.
3. **מחיר ליחידה** - קובץ האב מבקש אותו; אין הגדרה של יחידת המידה. נדרשת עמודה
   `unit_label` + `unit_count` לפני שאפשר לחשב.
4. **"מי שולח"** - `fulfilled_by` בטיוטה, אבל אין תהליך שמפעיל אותו: מי מודיע
   לספק, מה ה-SLA. תלוי בפורטל הספקים.
