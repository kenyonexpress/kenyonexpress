# דוח פורט מה-repo הכפול (2026-07-23)


> <!-- v1-final-historical:2026-09-01 -->
> 🕯️ **Historical snapshot. Not current guidance.**
>
> This is a one-off port from a duplicate checkout, true on the date it carries. It is kept as a record of what
> was measured and decided then, and it is **not** maintained against
> production. Numbers, table names and statuses in it may since have changed.
>
> For the current state see `docs/ARCHITECTURE-OVERVIEW.md`, and
> `docs/INDEX.md` for which document is authoritative on a given subject.

מקור: העותק שנבנה בטעות בלילה ב-
`/Users/ofir/kenyonexpress/kenyonexpress 0.48.20`
(9 קומיטים, נבנה 13:16-14:13 באותו יום, מבוסס על עותק ישן של ה-repo הזה).
ה-repo האמיתי מקדים אותו כמעט בכל דומיין (checkout עם escrow/settlement + 41
בדיקות, עמודים מיושרים פיקסל מול האתר החי), ולכן רוב העותק נזרק. נלקחו רק
פערים אמיתיים, בהתאמה לארכיטקטורה הקיימת.

## מה נלקח (4 קומיטים)

1. **חיפוש** (`ba177b6`): עמוד `/search`, ‏`/api/search`, ‏hook עם debounce
   וביטול בקשות, SearchBox. לא היה קיים כאן בכלל. הותאם: הוסר
   `brand.ilike` (העמודה לא הייתה בסכמה בזמן הפורט), שימוש ב-ProductCard
   הקיים (variant "deals"). Meilisearch נשאר אופציונלי מאחורי env.
2. **בדיקות E2E** (`25430c1`): ‏home/product/cart/checkout specs. הותאמו:
   גילוי מוצר דינמי במקום slugs של דמו, ה-checkout spec בודק את שער
   ההתחברות האמיתי (redirect ל-login עם next), כפתורים שנחשפים ב-hover
   נבדקים כ-attached. אגב כך תוקן strict-mode violation ישן ב-auth.spec.
   הסוויטה: 24/24.
3. **שכבת R2** (`fc25aac`): ‏presigned PUT ללא תלות (Web Crypto SigV4),
   ‏action ‏`requestUploadUrl` ‏staff-only, ו-ImageUploader שמעדיף R2 עם
   fallback ל-Supabase Storage כשאין env. תשתית ליעד pipeline התמונות.
4. **שדות תוכן למוצר** (`9a7672a`): מיגרציה 048 (הוחלה על המרוחק דרך MCP):
   תיאור קצר, מותג, נקודות מכירה, וידאו, ברקוד, סף מלאי נמוך, מקסימום
   להזמנה, משלוח/משקל/מידות/אחריות/מצב, תנאי קופון + הוראות מימוש +
   מינימום רכישה, שדות SEO. הטופס וה-action הורחבו; מטא-דאטה של PDP
   מעדיפה seo_title/seo_description.

## מה נזרק ולמה

- **סכמת Drizzle (CTI)**: מקור האמת כאן הוא מיגרציות SQL + טיפוסים
  שנוצרו מהסכמה. סכמה מקבילה = פיצול אמת.
- **checkout/cardcom של העותק** (success/failure/mock-pay/callback,
  CheckoutForm): הזרימה האמיתית חדשה יותר (Low Profile + reconcile +
  escrow + finalize אידמפוטנטי). גם WIP לא מקומט של Cardcom קיים בעץ.
- **מודל split לספק** (supplier_split_percent / default 70%): סותר את
  מנוע העמלות שהוכרע (commission_percent + platform_percent + settlement).
- **RLS ציבורי על suppliers + עמודות קשר לספק + SupplierCard**: ‏suppliers
  הוא admin-only בהחלטת אבטחה; חשיפת שם בלבד דרך service client
  (SupplierInfo). חשיפת טלפון/כתובת ציבורית נדחתה.
- **cashback_enabled / profit_share_cap_percent**: הדומיין כבר בבעלות
  cashback_percent.
- **פסי דף הבית מונעי-DB** (HomeStrips/ProductStrip/MidBanners/BrandStrip
  ‏+ queries): דף הבית מיושר פיקסל מול האתר החי עם דאטה שחולץ; החלפה
  לדאטה חי שוברת את ה-parity. יטופל ביעד CMS דף הבית.
- **HeaderSearch בתוך ה-header**: קבצי ה-header נעולים (הכרעת pixel).
  החיפוש נגיש ב-`/search`; חיווט ל-masthead ממתין להחלטת unlock.
- **PriceFilter/CategorySort/Pagination**: לדף הקטגוריה האמיתי יש כבר
  sidebar/מיון/pagination שנמדדו מול האתר החי.
- **CartButton/CartView**: העגלה האמיתית (provider + drawer + server
  actions) חדשה יותר.
- **seed-demo.mjs**: המרוחק כבר seeded דרך מיגרציות 043/044 (31 מוצרים
  מקושרים); סקריפט דמו היה דורס/מתנגש.
- **0075_categories_icon_url**: ‏icon_url + name_en כבר קיימים בסכמה כאן.
- **עמוד עריכת מוצר של העותק**: קיים כאן ב-`products/[id]/edit`.
