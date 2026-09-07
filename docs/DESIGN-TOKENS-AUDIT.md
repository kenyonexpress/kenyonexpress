# ביקורת טוקני עיצוב

מקור האמת: ‏`src/styles/tokens.ts` → ‏`src/styles/tokens.css` (`@theme`) →
utilities של Tailwind. השער: ‏`tokens.test.ts` + ‏`scripts/tokens-gate.mjs`.

‏`docs/COMPONENT-INVENTORY.md` עדיין מזכיר `@theme` ב-`globals.css`; בפועל
‏`globals.css` רק מייבא את ‏`tokens.css`.

## מה תקין

- אפס התאמות ‏`[#hex]` בקבצי ‏`.tsx` של רכיבים (נסרק 07.09.2026).
- ‏`SITE` / ‏`ELECTRO` מרוכזים ב-‏`tokens.ts` עם שיקוף ל-CSS.
- ניגודיות ‏muted / ‏saleBadge תועדה והוכהתה ל-AA (בלוק 12).

## חוב פתוח: ‏CSS של דפים

קבצים תחת ‏`src/styles/*.css` (מלבד ‏`tokens.css`) עדיין נוקבים hex גולמי.
דוגמאות מ-‏`cart-page.css`: ‏`#333e48`, ‏`#fed700`, ‏`#dc3545`, ‏`#ddd`,
‏`#f7f6f6`, ‏`#0062bd`. אותו דפוס ב-‏`account.css`, ‏`checkout-page.css`,
‏`category-page.css`, ‏`product-page.css`, ‏`mini-cart.css`,
‏`product-card-deals.css`, ‏`home-handheld.css`, ‏`newsletter.css`.

**יעד:** להחליף ל-`var(--color-*)` מ-‏`tokens.css` בלי לשנות פיקסל בשער.
אחרי כל קובץ: ‏compare על המסלול הרלוונטי.

## חוב פתוח: מודולי ‏lib מקבילים

| קובץ | תפקיד | סיכון |
|---|---|---|
| ‏`src/lib/electro-hero-tokens.ts` | גאומטריית הירו | hex כפול מול ‏SITE |
| ‏`src/lib/category-tokens.ts` | קטגוריה | כפילות ‏heading/link/price |
| ‏`src/lib/ke-live-revslider-slides.ts` | נתוני סליידר חי | מחרוזות צבע לשימור פריסה |
| ‏`src/lib/hero-singlefile-data.ts` | ייחוס | תיעוד בלבד |

יעד: צבעים מ-‏`SITE` בלבד; מספרי פריסה יכולים להישאר מקומיים עד שיוחלפו
במפת מידות.

## px שרירותי ב-TSX

נמדד: בעיקר ‏`HeroSlider.tsx` (גאומטריית Electro) ו-‏`BarSeries.tsx`.
לא לערבב עם צבעים. העברה לטוקני מידה רק אם השער נשאר ירוק.

## ספירת מלאי ישנה

‏COMPONENT-INVENTORY סימן 33 רכיבים «לא תואמי טוקן». הסריקה הנוכחית על
‏`.tsx` מראה שהחוב עבר ל-CSS ול-lib. לעדכן את המלאי אחרי גל ההעברה הראשון
של קובץ CSS אחד (מומלץ: ‏`cart-page.css` מול ‏compare cart).

## סדר עבודה מומלץ

1. ‏cart-page.css → compare cart  
2. ‏mini-cart.css → home + cart @380  
3. ‏product-page.css / ‏product-card-deals.css → product + home  
4. ‏checkout-page.css → checkout  
5. ‏account.css → account (עם ‏STORAGE_STATE)  
6. איחוד ‏electro-hero-tokens / ‏category-tokens ל-‏SITE  

בלוק האכיפה העתידי: 83 (lint על hex גולמי בכלל העץ).
