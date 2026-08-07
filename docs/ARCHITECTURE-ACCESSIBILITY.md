# ARCHITECTURE-ACCESSIBILITY.md

ארכיטקטורת **נגישות** (a11y) ל-KenyonExpress RTL.

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
Companions: SEO-PERFORMANCE, Go-Live, design-system.

---

## 0. יעד

תאימות מעשית ל-WCAG 2.2 AA בדפי מפתח: home, category, PDP, cart, checkout, account, supplier scan.

שער: Lighthouse a11y ≥ 90 על דפים אלה לפני GA.

---

## 1. כללים מחייבים

1. `lang="he"` + `dir="rtl"` על `<html>`.
2. ניגודיות: טקסט על `#fed700` חייב ink כהה (`#333e48`), לא לבן חלש.
3. כל תמונת מוצר: `alt` בעברית משמעותי (לא שם קובץ).
4. טפסים: `label` מפורש; שגיאות מקושרות ב-`aria-describedby`.
5. Focus גלוי במקלדת; בלי `outline: none` בלי חלופה.
6. כפתורי אייקון (עגלה, סגירת drawer): `aria-label` בעברית.
7. Modals/drawers: focus trap + Escape סוגר.
8. QR: לא המידע היחיד; תמיד קוד טקסט לצד.

---

## 2. רכיבים רגישים

| רכיב | דגש |
|---|---|
| Cart drawer | focus בפתיחה; סטטוס ל-screen reader אחרי add |
| Checkout | סדר טאב RTL הגיוני |
| Coupon tabs | `role=tablist` או ניווט ברור |
| Supplier scan | הודעות הצלחה/כישלון לא רק בצבע |

---

## 3. בדיקות

| # | בדיקה |
|---|---|
| A1 |axe/Lighthouse על PR לדפי מפתח |
| A2 | מקלדת בלבד: cart → checkout |
| A3 | VoiceOver/TalkBack ספוט על PDP + voucher |

---

## 4. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Accessibility binding (`arch/docs-queue`) |
