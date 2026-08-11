# ארכיטקטורה: נגישות (ישראל / ת״י 5568)

התאמה ל-WCAG 2.0 AA / ת״י 5568: מקלדת, קורא מסך RTL, ניגודיות, טפסים.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. **לא ייעוץ משפטי.**

מסמכים קשורים:

```
docs/ARCHITECTURE-ACCESSIBILITY.md
docs/ARCHITECTURE-CONTENT-LEGAL.md
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| IL1 | יעד: WCAG 2.0 Level AA כבסיס לת״י 5568; הצהרה ב-`/accessibility`. |
| IL2 | `lang="he"` + `dir="rtl"` מה-HTML הראשוני. |
| IL3 | P0: home, PDP, cart, checkout, login, account coupons/QR, שגיאות תשלום. |
| IL4 | כל פעולת עכבר ב-P0 זמינה במקלדת; skip link "דלג לתוכן". |
| IL5 | `#fed700` על לבן: **אסור** לטקסט גוף; CTA: דיו `#333e48` על צהוב. |
| IL6 | שגיאות טופס: עברית + `aria-invalid` + `aria-describedby` + live region. |
| IL7 | פוקוס נראה; אין `outline: none` בלי חלופה. |
| IL8 | שער CI: Lighthouse a11y ≥ 90 על home/PDP (SEO-PERFORMANCE). |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| WCAG 2.2 AAA מלא ב-v1 | עלות; AA מספיק לתקנה. |
| overlay widget צד ג' | לא בשליטה; on-page fixes. |
| נגישות רק ב-JS אחרי paint | IL2: HTML ראשוני. |
| צבע בלבד למחיר/סטטוס | IL6: טקסט "שולם באתר" / "יתרה בעסק". |
| div קליק בלי role ב-checkout | IL4: כפתור אמיתי / role=button. |

---

## סכמת DB

אין DDL. תוכן משפטי:

```text
legal_pages (slug='accessibility', body_he, updated_at, coordinator_contact)
```

אין שינוי סכימה במסמך זה.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | 3DS iframe Cardcom | focus trap בדיאלוג האתר; חזרה לטריגר. |
| CE2 | QR coupon: העתקה במקלדת | כפתור נגיש Enter/Space. |
| CE3 | הוספה לסל async | `aria-live="polite"`. |
| CE4 | שגיאת תשלום קריטית | `aria-live="assertive"`. |
| CE5 | קוד קופון LTR | `dir="ltr"` על segment. |
| CE6 | modal cart drawer | Escape סוגר; focus trap. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | ביקורת משפטית חיצונית | LEGAL checklist. |
| O2 | supplier scan P1 | אחרי P0. |
| O3 | admin a11y P2 | מקלדת בסיסית. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
