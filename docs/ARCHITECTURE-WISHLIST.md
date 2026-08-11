# ארכיטקטורה: רשימת מועדפים (Wishlist)

החלפת YITH Wishlist: heart בכרטיס/PDP, `/wishlist`, אורח ב-`localStorage`, merge בהתחברות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **לא כסף**. מחירים בדף מועדפים לתצוגה בלבד; checkout קורא agorot מ-DB.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/coupon-page-measured.md
docs/ARCHITECTURE-CART-GUEST.md
docs/ARCHITECTURE-RLS-MATRIX.md
```

Compare (YITH Compare) **מחוץ להיקף**. product compare = מסמך נפרד בעתיד.

---

## 0. החלטה (W1 עד W9)

| # | הכרעה |
|---|---|
| W1 | Wishlist לא כסף; לא ledger, לא wallet. |
| W2 | מקור אמת auth = Postgres (`wishlists`, `wishlist_items`) + RLS owner-only. |
| W3 | אורח = `localStorage` key `ke_wishlist` בלבד; אין שורת DB לאורח. |
| W4 | merge בהתחברות (`mergeGuestWishlist`) באותה נקודה כמו `mergeGuestCart`. |
| W5 | רשימה אחת default per user v1; שם `מועדפים`. |
| W6 | cap 100 מוצרים; דחייה עם שגיאה עברית (לא silent drop). |
| W7 | רק מוצרים `published`/`active` ב-UI; orphan IDs נמחקים ב-read. |
| W8 | `/wishlist` = `noindex`; RTL + Heebo. |
| W9 | אין ייבוא CSS/JS של YITH. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| cookie לאורח (כמו YITH) | bloat + CSP; W3 localStorage |
| wishlist כשורת cart | בלבול checkout; W1 |
| multiple named lists v1 | scope; W5 |
| share URL ציבורי v1 | privacy + abuse |
| server-side guest table | complexity; W3 |

---

## 2. סכמת DB

**DDL יעד** (מיגרציה עתידית, לא במסמך זה):

| טבלה | עמודות עיקריות |
|---|---|
| `wishlists` | `id`, `user_id` UNIQUE, `name_he`, `is_default`, timestamps |
| `wishlist_items` | `wishlist_id`, `product_id`, UNIQUE(wishlist_id, product_id), `added_at` |

RLS: owner-only authenticated; **אין** policies ל-anon.  
RPC: `ensure_default_wishlist(p_user_id)` SECURITY DEFINER ל-merge.

אינדקסים: `(wishlist_id, added_at DESC)`, `(product_id)`.

---

## 3. UX parity (electro / YITH)

| Live | KenyonExpress |
|---|---|
| Heart ב-header | `WishlistNavLink` + badge count |
| Heart על כרטיס | פינת תמונה, `הוסף למועדפים` |
| PDP link-style | תחת buy controls, 13px `#333e48` |
| דף wishlist | grid + empty state עברית |

מחרוזות חובה: `מועדפים`, `הוסף למועדפים`, `הסר ממועדפים`, `רשימת מועדפים`, `עדיין אין מוצרים במועדפים`.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| WL-E1 | merge: 100+ guest + user items | cap; שארית נשארת ב-localStorage עד ניקוי |
| WL-E2 | מוצר unpublished אחרי add | נעלם ב-read; item נמחק ב-server prune |
| WL-E3 | OAuth callback בלי localStorage access | `WishlistMergeOnAuth` one-shot מ-client |
| WL-E4 | duplicate product_id ב-guest JSON | dedupe on write |
| WL-E5 | concurrent toggle auth | last write wins; UNIQUE constraint |
| WL-E6 | guest API hydrate עם UUID לא קיים | מחזיר רשימה מסוננת |
| WL-E7 | multi-tab localStorage | `ke:wishlist-changed` event sync |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | מיגרציה `wishlists` לא הוחלה בפרוד | 2026-08-12 |
| O2 | WP YITH import one-time script | 2026-08-12 |
| O3 | price-drop alerts from wishlist | 2026-08-12 |

---

## 6. Acceptance

- [ ] guest localStorage + auth DB + merge
- [ ] cap 100 + reject Hebrew error
- [ ] RTL + measured PDP slot
- [ ] noindex `/wishlist`
- [ ] RLS owner-only

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | מסמך ראשוני wishlist-compare branch |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING; הסרת קוד יישום |
