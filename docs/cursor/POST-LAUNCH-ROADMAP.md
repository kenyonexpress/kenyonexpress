# Post-launch roadmap

Do not start these while
`docs/cursor/LAUNCH-BLOCKERS.md`
H1–H6 are open. None of this is a commercial-launch blocker.

Estimates are engineering-days for one person who already knows this repo, **not** calendar time, **not** including partner/legal wait.

---

## P1. Reviews (and the compare leftover)

**What exists.** Admin
`/admin/reviews`
and
`admin/reviews.ts`.
Customer
`reviews.ts`
actions. Not a money path. Pixel/YITH compare bar was explicitly out of scope in the wishlist architecture (branch name reserved it).

**What to ship.**

- PDP: Hebrew review list, average, empty state, only
  `paid`
  buyers (one review per
  `order_item`
  / product).
- Moderation: pending → published / rejected. Public SELECT only
  `published`.
- Abuse: rate limit, no HTML, no PII in the body.
- Optional: photo reviews on R2 (same MIME allowlist as catalogue).

**Out of scope here:** YITH-style product compare bar.

| | |
|---|---|
| **Estimate** | 5–8 days (tables+RLS+PDP+admin+tests). +3 days if photos. Compare bar is a separate 8–12 day pixel fight and should not ride this ticket. |
| **Depends on** | Launch H6 (real paid orders, or reviews are an empty museum). RLS pattern from `docs/cursor/RLS-CATALOG.md` (owner insert, public read published, admin U). `docs/ERROR-COPY.md` Hebrew strings. Money invariant: ratings are not prices. |
| **Risks** | Fake reviews without a paid-order join. `has_role('customer')` would let staff review as customers. |

---

## P2. Wishlist

**What exists.** Architecture binding:
`docs/ARCHITECTURE-WISHLIST.md`.
Route
`/account/wishlist`
is in the App Router map. Guest list is
`localStorage`
key
`ke_wishlist`,
merge on login next to
`mergeGuestCart`.
Cap 100. `/wishlist` `noindex`. Not money: PDP prices on the page are display-only; checkout re-resolves agorot.

**What to finish.**

- Heart on
  `ProductCard`
  + PDP
  `הוסף למועדפים` /
  `הסר ממועדפים`.
- Header count badge. Empty:
  `עדיין אין מוצרים במועדפים`.
- Auth tables
  `wishlists`
  +
  `wishlist_items`
  if not already applied: owner RLS, one default list per user, prune inactive products on read.
- Merge guest → user without duplicating product ids.
- Do **not** ship share URLs or price alerts in v1.

| | |
|---|---|
| **Estimate** | 4–6 days if tables already live; 8–10 if the migration is still a draft in that architecture doc. Pixel match against live YITH is the long pole, not the SQL. |
| **Depends on** | `mergeGuestCart` behaviour (same callback). Catalogue public predicate. RTL logical properties. Launch not strictly required (guests can heart on vercel.app). |
| **Risks** | Treating wishlist as a cart (writing prices into jsonb). Guest cookie instead of localStorage (CSP / cookie bloat; architecture forbids it). Cap silently dropping oldest (prefer Hebrew reject). |

---

## P3. Abandoned cart recovery

**What exists.** Cron
`/api/cron/abandoned-cart`
and table
`abandoned_cart_nudges`.
View
`v_abandoned_cart_recovery`
(service_role). Marketing architecture journey
`abandoned_cart`
(1h / 24h, email + optional WhatsApp, dedupe
`abandoned_cart_1:<cart_id>:<day>`).
Cart lines live in
`carts.items`
jsonb.

**What to finish.**

- Eligibility: cart with sellable lines, not checked out, not already paid, consent
  `marketing_email`
  (and phone for WhatsApp).
- Two touches, then stop. Cart edit resets the journey.
- Deep link to `/cart` (session restore). Re-price on open; do not honour a stale jsonb price.
- Suppress if any line is now unsellable; copy must not promise the old ₪.
- Operator: `/admin` visibility of nudge rows, not a blast UI in v1.

| | |
|---|---|
| **Estimate** | 3–5 days to make the existing cron **correct** (consent, dedupe, copy, re-price). 10–15 days to add WhatsApp marketing templates on top (see P4). |
| **Depends on** | H1 (Resend actually delivers). H5 (cron 200). Consent table / `decideConsent`. `implausible-discount` + coupon-offer (do not nudge the master test row). Legal: marketing vs transactional (abandoned cart is marketing). |
| **Risks** | Double scheduler sends two emails. Nudging after checkout because jsonb cart was not cleared. Quoting snapshotted client prices. |

---

## P4. WhatsApp campaigns via Twilio

**What exists today.** Click-to-chat only:
`src/lib/whatsapp.ts`,
`WhatsAppFloat`,
PDP share,
`products.whatsapp_enabled`
(false on all 80 products as of 2026-09-02). No campaign sender. Analytics
`whatsapp_click`
needs the ingest pipeline (migration 151 in that STATUS note).

**What the older marketing doc decided.** Meta Cloud API **direct**, not Twilio, for a young catalogue (no BSP monthly fee). SMS: Israeli aggregator, not Twilio. That decision still stands as the cheaper default.

**What this roadmap item is** (the requested Twilio path), if the owner wants one vendor for WhatsApp + later SMS:

- Twilio Content / Messaging API, WhatsApp sender, Meta template approval still required (Twilio does not skip Meta).
- Utility templates: order paid, voucher delivered, expiry warning (transactional, 24h window rules).
- Marketing templates: abandoned cart, win-back. Explicit opt-in. Stop text.
- Webhook into
  `notification_outbox`
  status (delivered / failed / opted out) →
  `email_suppressions`
  equivalent for WhatsApp.
- Do not send marketing into the floating button's number fallback
  `972524635550`
  ("Test Store" on the live WP site).
  `NEXT_PUBLIC_WHATSAPP_PHONE`
  must be the real business number first.

| | |
|---|---|
| **Estimate** | 12–18 days including Meta template review wait (that wait is calendar, not engineering). 3 days if we only flip `whatsapp_enabled` and keep click-to-chat. Twilio vs Meta-direct is a **vendor** choice; swapping later is another 5–8 days. |
| **Depends on** | Dedicated business phone. Meta Business verification. H1-class DNS if using a branded sender. `notification_outbox` drain (H5). Consent flags. Hebrew RTL templates (approved per language). Launch H6 so utility messages have a real voucher to talk about. |
| **Risks** | Marketing template rejected. Sending campaigns without opt-in. Using Twilio **and** Meta **and** the float, three sources. Cost markup vs Meta-direct at scale. |

---

## P5. i18n (second locale)

**What exists.** One locale:
`he-IL`,
`dir="rtl"`,
Heebo, copy in Hebrew,
`og:locale`
`he_IL`.
Architecture SEO: URLs must survive a second locale (`ar-IL` or `en-IL`) without breaking current paths. Content columns are
`*_he`.
hreflang today is
`he-IL`
only.

**What to ship (minimum honest i18n).**

- Locale prefix or subdomain decision **once** (prefix `/en/...` vs `en.kenyonexpress.co.il`). Prefix is less DNS. Subdomain is more CDN/cookie pain.
- `hreflang` + `x-default` pointing at Hebrew as default.
- Do not machine-translate legal. Counsel for EN/AR terms, privacy, 14-day copy.
- Money, dates, phone still
  `he-IL`
  format until a locale formatter is complete. **Do not** switch agorot to decimal strings per locale.
- LTR for `en`: logical Tailwind (`ps`/`pe`) should already flip. Audit physical `left`/`right` leftovers (
  `docs/RTL-PITFALLS.md`
  if present).
- Meilisearch index per locale or a `locale` filterable attribute. ILIKE Hebrew synonyms do not apply to English.

| | |
|---|---|
| **Estimate** | 20–30 days for EN storefront + legal + hreflang + search. AR-IL is not "flip dir"; it is a new copy deck (another 15–20). Pixel gate vs Electro Hebrew refs **will fail** if EN is forced through the same compare.mjs threshold: exclude EN from the 11% gate or raise a second ref. |
| **Depends on** | Stable Hebrew copy (ERROR-COPY, legal pages). SEO plan. Cardcom invoices remain Hebrew legally even if UI is EN (confirm with counsel). |
| **Risks** | Translating `coupon_price` labels into a percent story. Duplicate-content without hreflang. Mixing `dir=ltr` on a page that still has Hebrew crumbs. |

---

## P6. Supplier self-serve onboarding

**What exists.** Admin creates
`suppliers`
+
`supplier_members`.
Public
`submitSupplierLead`.
Portal login. Scan. Architecture:
`docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md`
(KYC light, draft products, admin publish, money briefing: platform keeps coupon prepaid, no escrow).

**What "self-serve" means here (v1).**

- Lead form →
  `supplier_leads`
  (already).
- Partner completes profile, uploads docs to R2 (not git), sets Google login.
- Partner creates **draft** products with mandatory
  `platform_percent`
  and, for coupons, absolute
  `coupon_price_ils`.
  Cannot publish. Admin
  `approveProduct`.
- Training checklist: scan a **test** voucher on vercel.app / staging, not a live ₪1 master row.
- Suspend: admin `suspended` unpublishes + blocks scanner.

**What it does not mean.** Instant go-live without admin. Cardcom sub-merchant. Payout self-serve (there is no payout table). Changing
`platform_percent`
on already-sold lines (snapshot forbids it).

| | |
|---|---|
| **Estimate** | 15–25 days (lead→draft catalogue→invite member→scan training→admin approve). KYC/legal review is owner calendar, not those days. |
| **Depends on** | R2 (H2). Admin approvals UI. RLS: partner writes drafts of **their** `supplier_id` only (`is_supplier_member`). Money invariants: no default percent. Launch not required to build; required to onboard a real restaurant. |
| **Risks** | Partner publish without `coupon_price_ils`. Partner reading issued voucher inventory (forbidden). Self-promotion via `profiles.role = vendor` without membership. Calling dead payout actions. |

---

## Suggested sequence after H9

1. P3 (abandoned cart correctness) if Resend is already green: small, uses cron that is already scheduled.
2. P2 (wishlist) if the header heart is a pixel hole.
3. P1 (reviews) once there are paid customers.
4. P6 (self-serve) before the second dozen partners, or stay admin-onboarded.
5. P4 (Twilio/Meta WhatsApp **campaigns**) after consent + templates. Click-to-chat is already enough for support.
6. P5 (i18n) last. Hebrew-only is the product.

Do not parallel P4 and P5. Both are copy + vendor + DNS attention, the same human who is also the launch operator.

---

## Cross-links from the rest of this pack

| Roadmap item | Invariant it must not break |
|---|---|
| P1 reviews | Not money. Join to **paid** `order_items`. Never `has_role('customer')`. |
| P2 wishlist | Re-price at checkout. Guest = `localStorage` only. |
| P3 abandoned cart | Marketing consent. Re-price. One scheduler. Skip the 172 row. |
| P4 Twilio | Opt-in. Do not use the Test Store fallback number. Meta still approves templates. |
| P5 i18n | Agorot stay integers. Hebrew legal stays source. New refs for pixel gate. |
| P6 self-serve | No default `platform_percent`. No issued-voucher dump. No payout tables. |

Payout self-serve is **not** a seventh item. It needs a schema that does not exist. When physical volume needs it, it is a new migration pack with conservation CHECKs, not a UI on `admin/payouts.ts`.

---

## P4 vs the existing click-to-chat

Do not block P3 on Twilio. Abandoned cart v1 is Resend. WhatsApp marketing templates wait on Meta approval even when the vendor is Twilio. Click-to-chat (P4 "3 days" slice) only needs H4 addendum (real
`NEXT_PUBLIC_WHATSAPP_PHONE`)
and per-product
`whatsapp_enabled`.

P1 reviews must not encode refunds. A 1-star review is not
`refund_ground`.
Moderation is
`admin/reviews.ts`,
money is
`refundOrder`.

---

## P1 / P2 are not greenfield

This tree already has:

| Surface | Status |
|---|---|
| `submitReview` / `getMyReviewableItem` | Actions live. Honesty remaining: join to **paid** `order_items` only. |
| `moderateReview` | Admin live. Must not call `refundOrder`. |
| `/account/wishlist` | Route live. |
| `toggleWishlist` / `getWishlistSaved` | Actions live in `reviews.ts`. |
| Guest list | `localStorage` key `ke_wishlist`. |

Estimates in P1/P2 above are **finish and pixel**, not create-from-zero. Do not open a second wishlist table.

---

## P3 must re-price and must not promise cashback

Cashback is credited in
`finalizeOrder`,
not at abandoned-cart time. A nudge that says "complete checkout and get 10% cashback" must re-read the live offer. The master test row must not be nudged (172 + implausible-discount).

---

## Payout is still not a seventh item

`admin/payouts.ts`
and
`/api/supplier/payouts/csv`
are dead (
`42P01`).
Physical residual is accounting. A real payout ledger is a new migration pack with conservation CHECKs, owner approval, and a TEST-MAP row. It is not a weekend UI ticket.

---

## Suggested sequence, revised after this pack

1. P3 correctness (Resend already required by H1/H5).
2. P2 pixel finish (heart already has actions).
3. P1 paid-buyer join (need H6 orders).
4. Close G1/G5/G6 on a **code** branch (not this markdown pack): live wallet RLS test, admin-redeem contract, cashback-at-finalize assertion.
5. P6 before the second dozen partners.
6. P4 campaigns after consent. Click-to-chat only needs the real WhatsApp number (H4 addendum).
7. P5 last.
