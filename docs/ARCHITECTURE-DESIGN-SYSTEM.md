# ARCHITECTURE-DESIGN-SYSTEM.md

ארכיטקטורת **שפת עיצוב / Design tokens** ל-KenyonExpress (Electro-aligned).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: refs/, account.css, cart-page.css, SEO-PERFORMANCE, a11y.

---

## 0. עקרונות

1. מותג ראשון ב-viewport שיווקי; לא דשבורד גנרי.
2. RTL + Heebo בלבד ל-UI עברי.
3. צהוב מותג `#fed700` ל-CTA ראשי; ink `#333e48`.
4. מדידות מ-`refs/` + CSS חי גוברות על "טעם AI".
5. אין ערכות סגול-על-לבן / קרם-טרקוטה כברירת מחדל.

---

## 1. Tokens

```css
:root {
  --color-brand: #fed700;
  --color-ink: #333e48;
  --color-muted: #768b9e;
  --color-line: #e4e4e4;
  --color-link: #0062bd;
  --color-danger: #e4002b;
  --color-success: #44b81b;
  --font-heebo: /* next/font */;
  --container: 1320px; /* storefront; cart often ~1170 */
}
```

---

## 2. טיפוגרפיה

| שימוש | גודל משוער |
|---|---|
| H1 עגלה/חשבון | ~40px / 500 |
| גוף | 14–16px |
| Meta | 13px muted |

---

## 3. רכיבים

| רכיב | כלל |
|---|---|
| Primary button | bg brand, text ink |
| Cards | גבול line, רדיוס קטן; לא ב-hero |
| Chips | ok/warn/dead |
| Forms | labels מימין, שגיאה אדומה |
| Toasts | ‏API אחד (`notify`), ‏toaster אחד, אורך חיים לפי סוג; §3.1 |

### 3.1 Toasts (UX28, 15.10.2026)

**‏API אחד.** כל הודעה צפה עוברת דרך `notify(kind, message, options?)` ב-`src/lib/ui/toast.ts`.
‏`kind` הוא `success | error | info | warning`; ‏`options` הם `description`, ‏`action` (כפתור אחד, לחיצה סוגרת),
‏`id` ו-`duration`. ‏`dismissToast(id?)` סוגר אחת או את כולן. ‏`import { toast } from 'sonner'` מותר
**רק** ב-`components/ui/sonner.tsx`; ‏`src/__tests__/toast-entry-points.test.ts` נכשל על כל ייבוא נוסף.

**אורך חיים לפי סוג, ותמיד סופי.** ‏success ‏4s, ‏info ‏5s, ‏warning ‏6s, ‏error ‏8s (`TOAST_DURATION_MS`).
שגיאה היא משהו לקרוא ולכן חיה פי שניים, אבל גם היא נסגרת לבד כדי שהערימה לא תתמלא בסירובים שאף אחד לא סגר.
כל סוג נסגר גם בכפתור, בהחלקה ובפעולה.

**זהות לפי הודעה.** ה-`id` ברירת המחדל הוא `ke:<kind>:<message>` (`toastId`): אותה הודעה פעמיים היא
‏toast **אחד** שמתעדכן במקומו והשעון שלו מתאפס. נמדד (‏logs/ux28): ארבע לחיצות "הוסף להשוואה" היו ארבעה
‏toasts (שלושה גלויים, אחד בתור) ועכשיו הן אחד. הודעות שונות (מוצר אחר, סכום אחר) הן ‏toasts שונים.

**ערימה.** ‏`visibleToasts = 3` (`MAX_VISIBLE_TOASTS`); מעבר לזה הישנים מחכים מאחור. ‏`top-center`,
‏`dir="rtl"`: כפתור הסגירה ב-inline-start (ימין). ה-toast מצויר **מעל** ה-header הדביק (ב-380: ‏y 20..73
על ‏header ‏0..50) למשך חייו; זו המוסכמה של ‏top-center והוא אינו חוסם אף פקד לצמיתות. מתחת ל-600px
ה-offset הוא ‏20 ולא ‏16 של ‏sonner, כדי שתיבת הפגיעה של כפתור הסגירה (שתלוי ‏7px מחוץ לפינה) תסתיים
על המסך ולא מעבר לו.

**‏toaster אחד, בלי props.** ‏`<Toaster />` (`components/ui/sonner.tsx`) נושא את כל המדיניות:
‏`theme="light"` קבוע (לאתר אין מצב כהה; ‏`useTheme()` בלי ‏provider החזיר ‏'system' וקונה עם ‏OS כהה ראה
‏toast שחור על דף לבן), ‏richColors, ‏closeButton עם השם "סגירת ההודעה" (ברירת המחדל של ‏sonner היתה
‏"Close toast"), האזור "התראות". כל ‏mount הוא ‏`<DeferredToaster />` חשוף: ‏(store) דרך
‏DeferredStoreChrome, ‏(main), ‏(account), ו-(admin) (לפני ‏UX28 ל-25 קריאות ‏toast בפאנל לא היה שום ‏toaster).

**מגע.** הגליף של כפתור הסגירה נשאר ‏20px; תיבת הפגיעה היא ‏`::after` של ‏44x44 ב-globals.css
(‏`inset: -13px`: לכפתור יש ‏border של ‏1px ו-`inset` נמדד מתיבת ה-padding; ‏`-12px` נמדד ‏42x42). תחת
‏`prefers-reduced-motion` אין החלקה.

**צבעים.** ארבעת צבעי הטקסט מוכהים ל-AA ב-globals.css (‏4.6:1 ומעלה; ‏LIGHTHOUSE-AUDIT §1); הרקעים הם של
‏sonner.

---

## 4. Motion

2–3 תנועות מכוונות במשטחים שיווקיים (hero fade, add-to-cart feedback). בלי רעש.

---

## 5. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Design system tokens (`arch/docs-queue`) |
| 2026-10-15 | §3.1 Toasts: one API, one toaster, lifetime by kind, identity by message (UX28) |
