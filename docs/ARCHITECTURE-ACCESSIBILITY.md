# ארכיטקטורה: נגישות (a11y)

תוכנית נגישות מחייבת ל-KenyonExpress RTL: WCAG 2.2 AA בדפי מפתח, מקלדת, קורא מסך עברית, ניגודיות מול טוקני מותג.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: No Escrow (לא רלוונטי ישירות; UI קופון/ארנק חייב טקסט מפורש, לא צבע בלבד).

מסמכים קשורים:

```
docs/ARCHITECTURE-ACCESSIBILITY-IL.md
docs/ARCHITECTURE-DESIGN-SYSTEM.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
docs/LEGAL-CHECKLIST.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| A1 | יעד: **WCAG 2.2 Level AA** בדפי מפתח לפני GA. שער Lighthouse Accessibility ≥ 90 על home, category, PDP, cart, checkout, account, supplier scan. |
| A2 | `lang="he"` + `dir="rtl"` על `<html>` מה-SSR הראשוני, לא רק אחרי hydration. |
| A3 | כל פעולה בעכבר במשטחי P0 (קנייה, חשבון, סריקה) זמינה במקלדת עם focus גלוי. |
| A4 | ניגודיות AA לטקסט; על `#fed700` חובה דיו כהה (`#333e48`), לא לבן חלש. |
| A5 | תמונות מוצר: `alt` בעברית משמעותי; דקורטיבי = `alt=""`. |
| A6 | טפסים: `label` מפורש; שגיאות מקושרות ב-`aria-describedby` + `aria-live` מתאים. |
| A7 | Modals/drawers: focus trap, Escape סוגר, חזרת focus לטריגר. |
| A8 | QR/קופון: קוד טקסט תמיד לצד QR; לא להסתמך על צבע בלבד לסטטוס (issued/used/expired). |
| A9 | מחירים ויתרת ארנק: טקסט מפורש ("₪ X.XX", "יתרה באתר"); אגורות ב-DB, תצוגה ב-`he-IL` בלבד. |
| A10 | עמוד הצהרה ב-`/accessibility` עם רכז נגישות, תאריך בדיקה אחרון, וקישור לתמיכה. |

### 1.1 Scope משטחים

| עדיפות | משטח |
|---|---|
| P0 | Home, PDP, cart, checkout, login, `/account/coupons` + QR |
| P0 | הודעות שגיאה/הצלחה בתשלום ומימוש |
| P1 | Category, search, supplier scan |
| P2 | Admin (פנימי; מקלדת בסיסית) |

### 1.2 רכיבים רגישים

| רכיב | דגש נגישות |
|---|---|
| Cart drawer | focus בפתיחה; `aria-live="polite"` אחרי add; כפתור סגירה עם `aria-label` |
| Checkout | סדר Tab RTL הגיוני; 3DS container עם focus trap באזור האתר |
| Coupon tabs | `role="tablist"` / `tab` / `tabpanel` או ניווט ברור במקלדת |
| Supplier scan | הצלחה/כישלון בטקסט + אייקון, לא צבע בלבד |
| Wallet strip | יתרה כטקסט, לא רק chip צבעוני |

### 1.3 בדיקות חובה

| # | בדיקה | תדירות |
|---|---|---|
| T1 | axe / Lighthouse a11y על PR לדפי P0 | כל PR שמשנה UI |
| T2 | מקלדת בלבד: home → PDP → cart → checkout | לפני GA |
| T3 | VoiceOver / TalkBack ספוט על PDP + voucher QR | לפני GA |
| T4 | ניגודיות טוקנים (`#fed700`, `#333e48`, לבן) | שינוי design tokens |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| WCAG 2.0 בלבד בלי 2.2 | `ARCHITECTURE-ACCESSIBILITY-IL.md` מכסה ת״י 5568; המוצר מחויב ל-2.2 AA בדפי מפתח לשיפור UX ומדידה אחידה. |
| Overlay widget (AccessiBe ודומה) | לא מחליף סמנטיקה; סיכון משפטי ותפעולי; נדרש קוד נative. |
| Skip a11y ב-admin בלבד | Admin P2 עדיין דורש מקלדת; החרגה מלאה יוצרת חוב טכני שמתפשט ל-customer flows. |
| הסתמכות על צבע לסטטוס קופון | נכשל WCAG 1.4.1; חובה טקסט "פעיל" / "נוצל" / "פג תוקף". |
| `outline: none` גלובלי + focus custom רק ב-checkout | focus חייב בכל P0; checkout לא מקבל יחס מיוחד בלבד. |
| תרגום אוטומטי alt מכותרת מוצר באנגלית | alt חייב עברית תיאורית; שם קובץ / slug אסור. |

---

## 3. סכמת DB

**אין DDL חדש.** נגישות היא שכבת UI/תוכן; אין טבלאות ייעודיות.

טבלאות שנקראות בהקשר נגיש (תצוגה בלבד):

| טבלה | שדות רלוונטיים | שימוש a11y |
|---|---|---|
| `products` | `title`, `description`, `images` | alt, כותרות, תיאור PDP |
| `product_images` | `url`, `sort_order` | alt לפי title + מיקום |
| `vouchers` | `code`, `status`, `expires_at` | QR + קוד LTR; סטטוס בטקסט |
| `orders` | `total_agorot`, `status` | תצוגת סכום ב-account |
| `wallet_accounts` | `balance_agorot` | יתרה מפורשת, לא float |
| `hero_slides` | `title`, `image_url`, `link_url` | carousel: כפתורי nav + alt |

מיגרציות مرجع: `017_hero_slides.sql`, `019_user_rate_limits.sql` (לא קשור ישירות), סכימת vouchers/orders קיימת.

---

## 4. מקרי קצה

| # | מצב | התנהגות נדרשת |
|---|---|---|
| E1 | משתמש מקלדת בלבד ב-cart drawer | Tab לא נופל מאחורי overlay; Escape סוגר; focus חוזר לכפתור "עגלה" |
| E2 | שגיאת תשלום Cardcom | `aria-live="assertive"` + טקסט בעברית; לא רק border אדום |
| E3 | קוד קופון ארוך (LTR) בתוך RTL | `dir="ltr"` על אלמנט הקוד; שאר העמוד RTL |
| E4 | QR לא נטען (תמונה שבורה) | קוד טקסט + כפתור "העתק קוד" נגיש במקלדת |
| E5 | `#fed700` על רקע לבן לטקסט body | אסור; רק רקע או אייקון; טקסט על צהוב עם `#333e48` |
| E6 | Modal תשלום נפתח מעל drawer | focus trap יחיד; סגירה מחזירה לטריגר הנכון |
| E7 | Screen reader על מחיר sale | מחיר ישן + חדש בטקסט, לא רק קוו חוצה CSS |
| E8 | Checkout disabled (`CHECKOUT_ENABLED=false`) | הודעה נגישה עם סיבה; CTA לא מוסתר בלי explanation |
| E9 | יתרת ארנק 0 | empty state בטקסט, לא רק אייקון ריק |
| E10 | Zoom 200% mobile | אין גלילה אופקית על P0; כפתורי CTA נשארים לחיצים |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | תאריך בדיקה VoiceOver אחרון לא מתועד ב-repo | לתעד ב-`/accessibility` ב-go-live | 2026-08-12 |
| O2 | carousel hero: האם autopause מספיק ל-WCAG 2.2.2 | pause/stop חובה אם autoplay פעיל | 2026-08-12 |
| O3 | supplier scan PWA offline | הודעת offline נגישה; לא scope P0 | 2026-08-12 |
| O4 | admin tables sort/filter | P2: מקלדת בסיסית; audit מלא אחרי GA | 2026-08-12 |

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | Accessibility binding (`arch/docs-queue`) |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
