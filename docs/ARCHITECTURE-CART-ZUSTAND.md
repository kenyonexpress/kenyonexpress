# ARCHITECTURE-CART-ZUSTAND.md

ארכיטקטורת **עגלה (Zustand + Guest + מיזוג ב-שלם)** ל-KenyonExpress.

Status: BINDING summary in `ke-arch` · Date: 2026-07-31 · docs only.  
Detail companions: `ke-arch-cart-zustand`, `ke-arch-cart` ARCHITECTURE-CART-CHECKOUT.

## Stack
Zustand 5 + persist (localStorage lines only) + Supabase `carts` + cookie `ke_session_id`.  
Server re-prices always. UI may be optimistic.

## Binding rules
1. Guest cart פתוח בלי הרשמה.
2. Login (Google) בלחיצת **שלם** → `mergeGuestCart` → checkout.
3. Persist שומר רק `product_id/variant_id/quantity` (לא מחירים).
4. Hydration App Router: SSR מ-`getCart`; אחרי hydrate reconcile בלי CLS על ה-badge.
5. Edge: מוצר נמחק / מלאי / מחיר השתנה → `available` + חסימת checkout.
6. Optimistic + rollback ל-`serverCart`.
7. RTL, Heebo, `#fed700` על `/cart` לפי Electro.

## Surfaces
Mini-cart header + drawer · `/cart` · AddToCart על PDP/cards.

## Tests (min)
Guest add → refresh · merge on OAuth · unavailable line blocks pay · optimistic rollback.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Binding cart summary mirrored into `ke-arch` (`arch/docs-queue`) |
