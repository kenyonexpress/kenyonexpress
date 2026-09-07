# גלי UI: ‏W3 עד ‏W49

לכל גל עם משטח UI: מסכים חדשים, רכיבים קיימים מ-
`docs/COMPONENT-INVENTORY.md`
, רכיבים חדשים, הערות ‏RTL / a11y, ומסלולי
`compare.mjs`
שחייבים להישאר מתחת ל-11% ב-380 / 768 / 1440.

**מקור המיפוי:** ‏`NEXT-GOALS.md` (‏W3 = בלוק 16 והלאה). כותרת הבלוק גוברת
על מספרי ‏W ב-`LAUNCH-TRIAGE.md` כשיש סתירה.

**כלל קבע לכל גל:** עברית ‏RTL, יעד מגע ≥44px ב-380, אפס גלילה אופקית,
‏`platform_percent` רק מהמוצר או מצילום ‏`order_items`, כסף באגורות דרך
`src/lib/money.ts`
.

| גל | מסכים / משטחים | רכיבים קיימים | רכיבים חדשים צפויים | RTL / a11y | compare |
|---|---|---|---|---|---|
| ‏W3 ביקורות | ‏PDP ביקורות, ‏`/admin/reviews` | ‏ProductCard, ‏StatusBadge | ‏ReviewForm, ‏ReviewList, ‏ModerationQueue | דירוג עם שם נגיש, לא צבע בלבד | home, product |
| ‏W4 משאלות | ‏`/account/wishlist` | ‏AccountNav, ‏ProductCard | ‏WishlistButton, ‏PriceAlertToggle | כפתור מצב עם ‏`aria-pressed` | account (דורש ‏STORAGE_STATE) |
| ‏W5 עגלה נטושה | מיני-עגלה, מייל/‏deep link | ‏CartDrawer, ‏CartLineItem | באנר שחזור | פוקוס חוזר לכפתור אחרי סגירה | cart |
| ‏W6 WhatsApp | אדמין תבניות/קמפיין | ‏AdminSidebar | ‏TemplateEditor | טקסטים בעברית בלבד בתוכן הלקוח | אין (אדמין) |
| ‏W7 הרשמת ספק | טופס ציבורי, אישור אדמין | ‏VendorForm, ‏approvals | ‏SupplierSignupWizard | שגיאות שדה גלויות | אין |
| ‏W8 content-uploader | טיוטת מוצר, העלאת תמונה | ‏ProductForm, ‏ImageUploader | תור אישורים לסשן יוצר | ‏ROLE-MATRIX: ‏`created_by` | אין |
| ‏W9 אנליטיקה | ‏`/admin/analytics` | ‏BarSeries, ‏SalesChart | פילטרים לפי ספק/קטגוריה | מצבי ריק קיימים | אין |
| ‏W10 i18n | כל ה-UI | ‏hebrew-copy gate | ‏next-intl keys | he-IL יחיד פעיל | כל המסלולים אחרי החלפה |
| ‏W16 תפעול אדמין | ייבוא ‏CSV, דריסת הזמנה | ‏ProductsTable, ‏DataTable | ‏CsvImport, ‏OrderOverride | אישור כפול על כסף | אין |
| ‏W17 חשבון לקוח | הזמנות, קבלות, מחיקת חשבון | ‏AccountNav, דפי ‏account | ‏DeleteAccount flow | ‏WCAG AA על אזהרות | account |
| ‏W19 מובייל | כל הדפים ב-380 | layout, ‏MiniCart | ליטוש בלבד | יעד מגע 44px, סריקה ביד אחת | home, cart, checkout @380 |
| ‏W20 ריק/שגיאה | כל רשימה וזרימה | ‏`.account-empty`, ‏CartEmptyState | ‏EmptyState משותף | ראה ‏`EMPTY-AND-ERROR-STATES.md` | לפי מסלול |
| ‏W21 חיפוש | **אין UI חיפוש** (‏ADR 0010) | - | הכנה בלבד בשרת | אסור להחזיר שדה חיפוש | search נמדד רק אם קיים |
| ‏W22 קטגוריות | עץ, פילטרים, פירורים | ‏CategorySidebar, ‏CategorySort | ‏CategoryTreeNav | ‏sort עם פוקוס נראה | category, products |
| ‏W23 מבצעים | קמפיין, תג מחיר | ‏ProductCard deals | ‏CampaignBadge | תג לא על תמונת הירו כ-overlay חופשי | home, product |
| ‏W25 תשלומי ספק | דוחות להורדה | ‏`/supplier/payouts` | ייצוא ‏CSV מוכן | טבלאות ‏RTL | אין |
| ‏W26 משפטי | ‏`/legal/*`, עוגיות | ‏LegalArticle | ‏`/cookies` (חסר) | קריאות מסמך | אין |
| ‏W30–W34 שוברים | מתנה, רב-שובר, חלקי, העברה | ‏`/account/coupons`, ‏scan | מסכי מתנה/העברה | ‏QR נגיש עם טקסט חלופי | coupon surfaces |
| ‏W35–W36 צוות ספק | סניפים, תפקידים | ‏SupplierNav | ‏BranchForm, ‏MemberInvite | ‏scanner = סריקה בלבד | אין |
| ‏W37–W38 ספק | התראות, אנליטיקה | דשבורד ‏`/supplier` | כרטיסי מדדים | 380 ראשי | אין |
| ‏W39–W43 נאמנות | דרגות, הפניות, פלחים | ‏`/account/referrals`, wallet | ‏LoyaltyBadge | בלי הבטחת אחוז גלובלי | account |
| ‏W44–W48 PWA | התקנה, אופליין, מצלמה, Wallet | ‏InstallPrompt, ‏sw | אופליין-שובר, ‏camera scan | ‏reduced-motion על אנימציות התקנה | home @380 |
| ‏W49+ אדמין עומק | דגלים, ביקורת, התחזות | ‏`/admin/feature-flags`, audit | ‏ImpersonationBanner | באנר גלוי, בלי מוטציית כסף | אין |

## מסלולי compare חובה (שער 11%)

פקודה:

```
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

מסלולים נתמכים בסקריפט: ‏home, product, category, products, search, cart,
checkout. אחרי כל גל שנוגע בחזית: לפחות ‏home בשלושת הרוחבים, וכל מסלול
ששונה.

קו בסיס אחרון (‏home, 07.09): ‏10.68 / 7.72 / 8.12. ראה
`docs/UI-PARITY-REPORT.md`
ו-
`docs/UI-PARITY-PLAN.md`
.
