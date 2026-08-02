# ARCHITECTURE: Accessibility (Israel / IS-5568)

תוכנית התאמה לת״י 5568 / WCAG 2.0 AA: מקלדת, קורא מסך עברית RTL, ביקורת ניגודיות מול טוקני מותג (`#fed700` על לבן), הכרזות שגיאה בטפסים.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי. **לא ייעוץ משפטי.**

Companions:

```
docs/ARCHITECTURE-CONTENT-LEGAL.md
docs/LEGAL-CHECKLIST.md
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/rtl-hebrew-ui skill (repo)
```

יעד: **WCAG 2.0 Level AA** כבסיס לת״י 5568 / תקנות הנגישות לאינטרנט בישראל. הצהרה ב-`/accessibility`.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| A1 | `lang="he"` + `dir="rtl"` מה-HTML הראשוני (לא רק ב-JS אחרי paint). |
| A2 | כל פעולה בעכבר זמינה במקלדת במשטחי קנייה/חשבון/סריקה. |
| A3 | שגיאות טופס בעברית + קישור לשדה; `aria-live` מתאים. |
| A4 | ניגודיות AA לטקסט; `#fed700` לא כטקסט על לבן בלי דיו כהה. |
| A5 | פוקוס נראה תמיד; לא `outline: none` בלי חלופה. |
| A6 | רכז נגישות + תאריך בדיקה בעמוד ההצהרה. |

---

## 1. Scope משטחים

| עדיפות | משטח |
|---|---|
| P0 | Home, PDP, cart, checkout, login, account coupons/QR |
| P0 | הודעות שגיאה/הצלחה בתשלום |
| P1 | Category, search, supplier scan |
| P2 | Admin (פנימי; עדיין מקלדת בסיסית) |

---

## 2. Keyboard navigation

| דרישה | יישום |
|---|---|
| Tab order | סדר לוגי RTL (ראשית מימין בשורות טבעיות) |
| Skip link | "דלג לתוכן" בתחילת העמוד |
| Menus | Escape סוגר; חצים אופציונלי |
| Modal / 3DS container | focus trap בתוך דיאלוג האתר; אחרי סגירה חזרה לטריגר |
| Cart / checkout CTA | נגיש ב-Enter/Space ככפתור אמיתי |
| QR page | כפתור העתקת קוד במקלדת |

אסור: אלמנטים קליקים רק כ-`div` בלי role/button בנתיבי P0.

---

## 3. Screen reader + Hebrew RTL

| נושא | כלל |
|---|---|
| שפה | `lang="he"` על `html`; קטעי LTR (`dir="ltr"`) לקוד קופון / מספר הזמנה |
| שמות נגישים | עברית על כפתורים (`הוספה לסל`, `המשך לתשלום`) |
| תמונות | `alt` בעברית תיאורי; דקורטיבי = `alt=""` |
| מחירים | לא להסתמך על צבע בלבד; טקסט "שולם באתר" / "יתרה בעסק" |
| Live regions | `aria-live="polite"` להוספה לסל; `assertive` לשגיאת תשלום קריטית |
| landmark | `main`, `nav`, `header`, `footer` |

בדיקה ידנית: VoiceOver / NVDA על PDP + checkout.

---

## 4. Contrast audit (design tokens)

טוקנים:

| Token | Hex | שימוש |
|---|---|---|
| Yellow | `#fed700` | CTA רקע, מבטאים |
| Ink | `#333e48` | טקסט ראשי |
| White | `#ffffff` | רקע |
| Muted | לבדוק ≥ 4.5:1 על רקע | טקסט משני |

### 4.1 `#fed700` על לבן

| צמד | בעיה | תיקון מחייב |
|---|---|---|
| טקסט `#fed700` על `#ffffff` | ניגודיות נמוכה מ-AA לטקסט רגיל | **אסור** לטקסט גוף/לינקים |
| טקסט `#333e48` על `#fed700` | בדרך כלל עומד לטקסט/CTA | CTA מועדף: דיו על צהוב |
| טקסט `#fed700` על `#333e48` | לבדוק יחס; אם נכשל להעבות משקל/גודל או להחליף | אייקון/hover בזהירות |
| Placeholder אפור בהיר | נכשל לעיתים | להכהות עד AA |

כלי: axe / Lighthouse a11y / Contrast Checker.  
לתעד חריגים גדולים (לוגו) כ-non-text אם רלוונטי.

### 4.2 Checklist ניגודיות

- [ ] טקסט גוף על רקע עמוד
- [ ] לינקים (מצב רגיל + hover לא רק צבע)
- [ ] כפתורי CTA ראשיים
- [ ] הודעות שגיאה (אדום על לבן)
- [ ] Disabled: לא חייב AA מלא; לא ייחודי כמידע יחיד

---

## 5. Form error announcements

| כלל | דוגמה |
|---|---|
| הודעה בעברית ליד השדה | "נא להזין טלפון תקין" |
| `aria-invalid="true"` | על השדה |
| `aria-describedby` | מפנה ל-id של הטקסט |
| סיכום בראש הטופס | ב-checkout אם יש כמה שגיאות |
| פוקוס | לשדה הראשון השגוי אחרי submit |
| רשת/תשלום | live region: "התשלום נכשל, נסו שוב" |

לא להסתפק באדום בלי טקסט.

---

## 6. תוכנית עבודה

| שלב | פעולה |
|---|---|
| 1 | Audit אוטומטי (axe) על P0 |
| 2 | תיקון ניגודיות צהוב/טקסט |
| 3 | מעבר מקלדת מלא ל-checkout + coupons |
| 4 | בדיקת קורא מסך RTL |
| 5 | עדכון `/accessibility` + תאריך |
| 6 | שער CI: Lighthouse a11y ≥ 90 על מדגם (ראה SEO-PERFORMANCE) |

---

## 7. Acceptance

- [ ] P0 עביר במקלדת
- [ ] אין טקסט `#fed700` על לבן
- [ ] שגיאות טופס עם aria + עברית
- [ ] הצהרת נגישות מעודכנת
- [ ] Lighthouse a11y ≥ 90 על home/PDP מדגם

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
