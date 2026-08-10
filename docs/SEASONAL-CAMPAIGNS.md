# קמפיינים עונתיים (תוצר/תפעול)

באנרים מתוזמנים, קולקציות זמניות, ו-countdown לחגים ישראליים ול-Black Friday.

Status: **PLAN** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**מקור מחייב (ארכיטקטורה):** לא משכפלים הכרעות S1-S7 כאן.

```
docs/ARCHITECTURE-SEASONAL-CAMPAIGNS.md
```

מסמכים נוספים:

```
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/MARKETING-LAUNCH.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CONTRADICTIONS.md
```

---

## 1. מטרה

תרגום ארכיטקטורת הקמפיין ללוח עבודה: מתי עולים באנרים, איך נבנית קולקציה זמנית, ואיך countdown מוצג בלי לשבור מחיר/עמלה.

---

## 2. חגים מחייבים (בסיס)

| קמפיין | חלון טיפוסי | באנר | קולקציה | Countdown |
|---|---|---|---|---|
| ראש השנה | אלול עד תשרי | כן (hero + strip) | מתנות / מסעדות / ספא | אופציונלי לימי מבצע |
| פסח | ניסן | כן | נופש / אטרקציות | כן בשבוע לפני |
| Black Friday / סייבר | נוב עד דצמ | כן | הנחות רוחביות (זהירות LEGAL) | כן (שעון שרת) |

שעון: `Asia/Jerusalem` בלבד. תאריכים עבריים מחושבים מראש ללוח אזרחי.

---

## 3. באנרים מתוזמנים

| כלל | פירוט |
|---|---|
| ישות | `campaign_banner`: `starts_at`, `ends_at`, `placement` (home_hero / home_strip / category), `image`, `cta_href`, `priority` |
| הצגה | רק אם `now` בחלון ו-`enabled` |
| חפיפה | באנר עם `priority` גבוה יותר מנצח באותו placement |
| נגישות | טקסט חלופי בעברית; לא טקסט בתוך תמונה בלבד |
| Consent | באנר שיווקי כפוף למדיניות cookies/marketing אם כולל פיקסל צד ג |

אין שינוי `platform_percent` מתוך באנר.

---

## 4. קולקציות זמניות

| כלל | פירוט |
|---|---|
| ישות | `campaign_collection`: slug, name_he, חלון, רשימת `product_id` |
| נתיב | `/c/{slug}` או קטגוריה וירטואלית מתוזמנת |
| מלאי | מכסות דיל נאכפות גם תחת עומס (INVENTORY) |
| מחיר | שינוי תצוגה/קופון באתר בלבד; snapshot ב-checkout |

אחרי `ends_at`: הקולקציה יורדת מהניווט; URL ישן → 410 או redirect לקטלוג (הכרעה ב-SEO doc).

---

## 5. Countdown

| כלל | פירוט |
|---|---|
| מקור זמן | שרת; לקוח מציג יחסית ל-`ends_at` ISO |
| מיקום | כרטיס דיל בזק / באנר קמפיין / דף קולקציה |
| אחרי סיום | הסתרת שעון + הסרת מחיר מבצע אם פג תוקף |
| אסור | countdown מזויף (שעון שמתאפס) |

---

## 6. כסף (תזכורת)

קמפיין **לא** יוצר Escrow / נאמן / J5 / held.  
שינוי עמלה = publish מוצר עם `platform_percent` פר מוצר בלבד.

---

## 7. Acceptance

- [ ] באנר מחוץ לחלון לא מוצג
- [ ] countdown מסתיים לפי שעון שרת
- [ ] קולקציה אחרי סיום לא נמכרת במחיר מבצע שפג
- [ ] אין שפת Escrow בטקסטי באנר

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | שכבת תפעול/תוצר מעל ARCHITECTURE-SEASONAL-CAMPAIGNS |
