# ARCHITECTURE-WISHLIST.md

ארכיטקטורת **Wishlist / השוואה** (עדיפות משנית אחרי Go-Live).

Status: BINDING lite · `ke-arch` · Date: 2026-07-31 · docs only.

## Scope
| Feature | Behavior |
|---|---|
| Wishlist | שמירת product_id למשתמש מחובר; אורח ב-localStorage עד login merge |
| Compare | עד 3 או 4 מוצרים מאותו סוג; הצגת מחיר לתשלום באתר נכון לקופון |

## Rules
1. Wishlist לא משריין מלאי ומחיר.  
2. CTA מ-wishlist → add to cart (server price).  
3. RLS: `wishlists.user_id = auth.uid()`.  
4. לא SEO-critical; noindex על `/account/wishlist` אם קיים.

## Out of scope v1
Social sharing lists · price-drop email (marketing doc).

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Wishlist lite in `ke-arch` (`arch/docs-queue`) |
