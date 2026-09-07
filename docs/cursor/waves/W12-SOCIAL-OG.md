# W12 Social OG

Code-agent spec. WhatsApp is how products are shared in IL. Preview is `og:image`. WhatsApp is strict: WebP is unsafe; follow redirects poorly.

---

## What the wave builds

1. Per-PDP OG: title, Hebrew description, **JPEG/PNG** `og:image` (R2), absolute URL, no redirect hop.
2. `og:locale` `he_IL`. Price in OG is **display** and must match `formatIls` of the sellable price (coupon absolute, not face).
3. Share buttons already exist (`share-buttons.test.tsx`). Wire OG, do not add a second WhatsApp number.

**Do not build.** Campaign WhatsApp (W30). Using `NEXT_PUBLIC_WHATSAPP_PHONE` fallback `972524635550` ("Test Store").

---

## Tables

`products`, `media_assets`, `product_images`. No new table.

---

## RLS

Public read of active products only. OG route must not leak draft products (same predicate as PDP).

---

## Money invariants

OG price = cart sellable price. Coupon: `coupon_price_ils`, never percent of face. Missing coupon price: product is unsellable; OG must not invent 10%.

---

## Tests

`src/lib/share/message.test.ts`. Assert OG image is not `.webp` for share. Assert coupon OG does not print face as the charge.

---

## Feature flag

None. Missing R2 public base: image 404s (launch trap with WP `wp-content` URLs).

---

## Close

Share a coupon PDP in WhatsApp (human or documented curl of og tags). No test-store number in production env (H4 addendum).

---

## Second pass (after contracts and ops)

Binding: `WAVE-INDEX.md`, `contracts/ROLE-VENDOR.md` (till is `supplier_members`), `contracts/LEDGER.md` (integer agorot, cashback at finalize), `contracts/PAYMENT-BOUNDARY.md` (GetLpResult, no HMAC), `contracts/MIGRATION-PLAYBOOK.md` (full pending filenames). Feature flags are env. Do not invent payout or escrow writers. Hebrew UX stays RTL source-of-truth.
