# WhatsApp

Verified 2026-09-02. Built before G5; G5's one real gap was measurement, closed
with migration 151.

| Piece | Where |
| --- | --- |
| Phone normalization + wa.me links | `src/lib/whatsapp.ts` (+9 tests): local/international/landline, Hebrew message builders |
| Floating help button | `WhatsAppFloat` in the store/main layouts; hidden when `NEXT_PUBLIC_WHATSAPP_PHONE` is empty |
| PDP share | `WhatsAppShareButton` next to the SKU, prefilled Hebrew message + page URL |
| Per-product toggle | `products.whatsapp_enabled` (123), admin control in `ProductForm.tsx`; supplier chat in `SupplierInfo.tsx` renders only when enabled |
| Order-update link | checkout/return page + admin order page, prefilled status text |
| Click analytics | `whatsapp_click` (with `product_id`) from the PDP share, emitted BEFORE the window opens. Lands when 151 applies -- which is also what turns the rest of the analytics pipeline on; the ingest function did not exist. |

**Content, not code:** `whatsapp_enabled` is false on all 80 products, so no
supplier chat renders anywhere yet. Flipping it is an admin action per product.

**Untracked on purpose:** the floating button is a server component on every
page; hydrating the whole site to count its taps is a worse trade than losing
the number. The PDP share -- the funnel-relevant tap -- is the one counted.
