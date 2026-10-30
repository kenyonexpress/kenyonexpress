# C99 — Thank-you page + personal area

| Requirement | Where | Status |
|---|---|---|
| Invoice click-to-download on thank-you page | `checkout/return/page.tsx` links `/account/orders/<id>/invoice` (ownership re-checked per request, redirects to the Cardcom document / R2 mirror) | present |
| Orders list | `/account/orders`, `OrderCard` | present |
| Invoices click-to-download in orders list | `OrderCard` + overview list: "חשבונית" link when `OrderSummary.hasInvoice` (one batched `invoices` read, `getInvoicedOrderIds`) | added |
| Per-coupon QR | `/account/coupons` -> coupon page; QR on order detail and thank-you page | present |
| Waze + Google Maps to business | `BusinessLocation` on `/account`, `lib/business-location.ts`; set `NEXT_PUBLIC_BUSINESS_ADDRESS` for a street address, otherwise searches the display name (no address invented) | added |
| App-only notifications toggle + consent log | `AllInAppToggle` -> `setAllInAppNotifications` writes an append-only row to `user_consents` (280, applied) per change | present |
| `notification_consents` | read view over `user_consents` in `migrations/pending/316_notification_consents_view.sql` | pending (Supabase MCP needs OAuth, unavailable here; nothing in code depends on it) |

Checks: `tsc --noEmit` clean; vitest account + queries + business-location 107/107.
No forbidden files touched.
