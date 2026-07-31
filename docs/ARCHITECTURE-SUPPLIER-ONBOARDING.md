# ARCHITECTURE-SUPPLIER-ONBOARDING.md

ארכיטקטורת **צירוף ספקים** (onboarding) ל-KenyonExpress.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31 (rev C)  
Scope: docs בלבד.  
Companions: `ARCHITECTURE-SUPPLIER-PORTAL.md`, admin product spec, legal, fulfillment, Go-Live, `MASTER-ARCHITECTURE-v2.md`.

---

## 0. עקרונות מחייבים

1. ספק לא ב-publish בלי אימייל תפעולי + אישור אדמין/בעלים.
2. **`platform_percent` דינמי פר-מוצר**, חובה למוצר פיזי לפני publish; **אין ברירת מחדל ואין 5%/10% קבוע**.
3. קופון: חובה `coupon_price_ils` מוחלט; הלקוח משלם אותו במלואו באתר; **הכסף נשאר בפלטפורמה**; יתרה נגבית בעסק בסריקה; **אין Escrow**; payout לספק מקופון prepaid = 0.
4. הסבר לספק חייב להתאים למודל (לא "נאמן", לא "שחרור מקדמה מהפלטפורמה").
5. גישה רק דרך `supplier_members` + RLS.

---

## 1. תהליך צירוף (end-to-end)

```
1. Lead / פנייה
2. איסוף מסמכים + פרטי עסק (§2)
3. יצירת שורת suppliers (status=pending)
4. הזמנת משתמש ל-supplier_members (role owner/staff)
5. חתימה דיגיטלית / אישור תנאי ספק (legal)
6. הדרכת מודל כסף + סורק QR (§5)
7. הגדרת מוצרים בטיוטה + platform_percent / coupon_price (§4)
8. ביקורת אדמין (publish gate)
9. go-live: status=active, מוצרים published
10. מעקב שבוע ראשון (סריקות / משלוחים / תמיכה)
```

SLA יעד פנימי: Lead → active תוך 5 ימי עסקים אם המסמכים מלאים.

---

## 2. מסמכים ופרטים נדרשים

### 2.1 חובה לפני active

| פריט | למה |
|---|---|
| שם מסחרי + מותג לתצוגה | קטלוג / קופון |
| ח.פ / עוסק מורשה / ת.ז עוסק | payout פיזי + חשבוניות |
| אישור ניהול חשבון / עוסק (צילום/PDF) | KYC קל |
| איש קשר: שם, טלפון נייד, אימייל | התראות + תמיכה |
| כתובת בית העסק (לקופונים) | הצגה ללקוח + מימוש |
| פרטי בנק / העברה (לפayout פיזי) | 051 payout terms; לא לקופון prepaid |
| אישור שקרא את תנאי הספק (מודל קופון/פיזי) | audit |

### 2.2 מומלץ

| פריט |
|---|
| לוגו + תמונות באיכות גבוהה |
| שעות פעילות / הוראות מימוש בעברית |
| איש קשר משני לחופשות |

אחסון מסמכים: bucket פרטי (R2/Storage) עם גישת admin בלבד; לא ב-git.

---

## 3. יצירת גישה במערכת

| שלב | פעולה |
|---|---|
| A | `INSERT suppliers` עם status `pending` |
| B | יצירת/קישור `auth.users` לספק (Google) |
| C | `supplier_members` עם role (`owner` / `staff`) |
| D | בדיקת RLS: הספק רואה רק את עצמו |
| E | הדרכת `/supplier/scan` על קופון טסט (או staging) |
| F | אחרי publish ראשון: `suppliers.status = active` |

השעיה: אדמין → `suspended` + unpublish מוצרים + כיבוי סריקה אם צריך.

---

## 4. הגדרת `platform_percent` ומוצרים

### 4.1 פיזי

1. אדמין (או ספק בטיוטה + אישור אדמין) ממלא `products.platform_percent` מספר חיובי לפי הסכם.
2. **אין default בסכימה ובקוד.** מוצר בלי ערך לא ניתן ל-publish / לא נמכר.
3. בזמן קנייה הערך מצולם ל-`order_items` (immutable).
4. שינוי אחוז בהמשך **לא** משנה הזמנות עבר.

### 4.2 קופון

1. חובה: `coupon_price_ils` מוחלט + `price_ils` / face לתצוגת יתרה בעסק.
2. `platform_percent` על קופון: לא קובע את מחיר הלקוח באתר; המודל הוא גבייה מלאה של מחיר הקופון לפלטפורמה.
3. לפני publish: אדמין מאמת שמחיר הקופון ≤ face ושאין copy של "10% עכשיו" כנגזרת אוטומטית.

### 4.3 שערי publish (אדמין)

| בדיקה | חובה |
|---|---|
| ספק active/pending מאושר | כן |
| תמונה + שם בעברית | כן |
| פיזי: `platform_percent` ממולא | כן |
| קופון: `coupon_price_ils` + תוקף/הוראות | כן |
| אין נוסח Escrow בדף | כן |

---

## 5. הדרכת ספק (תוכן מחייב)

מסרים שחייבים להיאמר (עברית):

1. לקוח קופון משלם באתר את מחיר הקופון במלואו; הסכום נשאר אצל KenyonExpress.
2. בסריקה גובים מהלקוח את היתרה בקופה; הקופון נשרף (חד-פעמי).
3. אין "שחרור כסף" מהפלטפורמה על קופון.
4. פיזי: אחרי מכירה רואים יתרת ספק לפי האחוז שסוכם במוצר; payout לפי מדיניות T+3 / מינימום.
5. איך לעדכן משלוח בפורטל.

חומרים: PDF קצר + סרטון סריקה (אופציונלי) + לינק לפורטל.

---

## 6. צ'קליסט go-live לספק

- [ ] מסמכים §2 הועלו
- [ ] חבר owner ב-`supplier_members`
- [ ] סריקת ניסיון הצליחה (staging או קופון טסט)
- [ ] לפחות מוצר אחד עבר publish gate
- [ ] `platform_percent` / `coupon_price` תקינים
- [ ] אימייל התראות מגיע
- [ ] הספק אישר בכתב שהוא מבין את מודל הקופון

---

## 7. מדדים

| KPI | הגדרה |
|---|---|
| Time-to-active | ימים מ-lead ל-active |
| Docs incomplete rate | % לידים תקועים בלי מסמך |
| First redeem within 14d | ספקים עם קופון שנסרק |
| Support tickets / supplier week 1 | איכות הדרכה |

---

## 8. Out of scope

- פתיחת מסוף Cardcom נפרד לכל ספק ביום 1 (אופציונלי later; ברירת מחדל מסוף פלטפורמה)
- Escrow / נאמן
- עמלה קבועה גלובלית

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Onboarding ראשוני |
| 2026-07-31 | rev C: מסמכים, תהליך מלא, הגדרת platform_percent |
