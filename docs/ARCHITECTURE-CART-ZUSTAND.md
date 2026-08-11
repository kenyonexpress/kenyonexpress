# ארכיטקטורה: עגלה Zustand

Zustand + persist מקומי + מקור אמת בשרת (`carts` + `ke_session_id`).

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-CART-GUEST.md
docs/ARCHITECTURE-CART-CHECKOUT.md
docs/ARCHITECTURE-MONEY.md
```

מודל כסף: **No Escrow**. מחירים לא נשמרים ב-persist; תמחור תמיד מהשרת.

---

## 0. החלטה

| # | הכרעה |
|---|---|
| CZ1 | Stack: Zustand 5 + persist (שורות בלבד) + Supabase `carts` + cookie `ke_session_id`. |
| CZ2 | Persist שומר רק `product_id` / `variant_id` / `quantity` (לא מחירים/% ). |
| CZ3 | SSR מ-`getCart`; אחרי hydrate reconcile בלי CLS על badge. |
| CZ4 | Optimistic UI מותר עם rollback ל-`serverCart`. |
| CZ5 | Login בלחיצת שלם → `mergeGuestCart` (sum+cap 99) → checkout. |
| CZ6 | שורה לא זמינה חוסמת תשלום; לא ממציאים מחיר. |
| CZ7 | RTL עברית; עיצוב לפי storefront קיים. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Persist מחירים ב-localStorage | quote≠charge; MONEY. |
| עגלה רק מקומית בלי DB | אובדן בין מכשירים; אין מיזוג אמין. |
| בלי optimistic | UX איטי; מותר עם rollback. |
| אורח דורס עגלת משתמש במיזוג | CART-GUEST. |

---

## 2. סכמת DB

`carts` (+ אופציונלי `cart_items` legacy). ראה CART-GUEST. אין DDL כאן.

---

## 3. משטחים

| משטח | תפקיד |
|---|---|
| Mini-cart / drawer | כמות מהירה |
| `/cart` | עריכה מלאה |
| AddToCart ב-PDP/cards | הוספה |

---

## 4. מקרי קצה

| קוד | תוצאה |
|---|---|
| `hydrate_mismatch` | ניצחון שרת |
| `product_deleted` | unavailable |
| `price_changed` | תצוגה חדשה מה-DB |
| `optimistic_fail` | rollback |
| `merge_cap` | qty 99 |

---

## 5. פתוחות

| # | פתוח | שמרני |
|---|---|---|
| O1 | האם לבטל persist לגמרי אחרי auth | להשאיר שורות; שרת קובע |
| O2 | Drawer מול דף מלא במובייל | לפי compare קיים |

עודכן: 2026-08-12.

---

## 6. Acceptance

- [ ] Persist בלי מחירים  
- [ ] Merge מתועד  
- [ ] חלופות + DB + קצה + פתוחות  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | סיכום ראשון |
| 2026-08-12 | BINDING מלא לפי תבנית |
