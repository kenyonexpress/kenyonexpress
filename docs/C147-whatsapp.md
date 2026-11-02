# C147 — WhatsApp + share

Date: 2026-11-02 · Branch: closeout/v1-final

## What changed

| Surface | wa.me button (prefilled) | Share menu (WhatsApp → native → copy) |
|---|---|---|
| Product `/product/<slug>` (`ProductInfo.tsx`) | already present: `WhatsAppShareButton` (`wa.me/?text=` from `buildShareMessage` + URL); supplier chat button where `products.whatsapp_enabled` | already in the required order: `WhatsAppShareButton`, `NativeShareButton`, `CopyLinkButton` — unchanged |
| Business `/s/<id>` | **new**: `שאלה על העסק בוואטסאפ` → store number, text from new `buildBusinessInquiryText(name, url)` | **new**: `ShareMenu` |
| Order `/account/orders/<id>` | **new**: summary row `שאלה על ההזמנה?` → store number, text `buildOrderInquiryText(orderNumber)`; per-supplier `צור קשר עם הספק` button kept | n/a (private page) |

- New `src/components/shared/ShareMenu.tsx`: fixed order WhatsApp, native share (`navigator.share`, hidden where unsupported), copy link. Text always comes from `buildShareMessage` (the share-buttons.test.tsx price guard stays green).
- Business-page chat goes to the store's number, not the supplier's: suppliers opt into WhatsApp per product (`whatsapp_enabled`), a business page has no such consent.
- No automated sends added: every new link is a user-clicked `https://wa.me/...` link. Nothing calls Twilio or enqueues `whatsapp_outbox`. The existing opt-in Twilio outbox (`/api/cron/whatsapp`, consent re-checked at send) and WhatsApp OTP were left as they were. This item didn't remove them.
- Files: `src/components/shared/ShareMenu.tsx`, `ShareMenu.test.tsx`, `src/lib/whatsapp.ts`, `src/app/(store)/s/[id]/page.tsx`, `src/app/(account)/account/orders/[id]/page.tsx`. No forbidden files touched.

## Proof

### Unit tests
```
$ npx vitest run src/components/shared/ src/lib/whatsapp src/components/storefront/ProductInfo.test.tsx "src/app/(store)"
 Test Files  19 passed (19)
      Tests  149 passed (149)
```

### Type-check
```
$ pnpm type-check
$ tsc --noEmit
type-check exit 0
```

### Rendered pages (next dev :3147)
```
$ curl http://localhost:3147/s/ce85543d-e102-4ff1-b6dc-06799ca9d5a0
GET /s/ce85543d... 200
href="https://wa.me/972524635550?text=%D7%A9%D7%9C%D7%95%D7%9D%2C%20%D7%A8%D7%90%D7%99%D7%AA%D7%99%20%D7%90%D7%AA%20%22%D7%A1%D7%98%D7%99%D7%99%D7%9C%20%D7%94%D7%91%D7%99%D7%AA%22%20%D7%91%D7%A7%D7%A0%D7%99%D7%95%D7%9F%20EXPRESS%20%D7%95%D7%90%D7%A9%D7%9E%D7%97%20%D7%9C%D7%A4%D7%A8%D7%98%D7%99%D7%9D%0Ahttp%3A%2F%2Flocalhost%3A3417%2Fs%2Fce85543d-e102-4ff1-b6dc-06799ca9d5a0"
   2 data-share-menu
   1 העתקת קישור
   2 שאלה על העסק בוואטסאפ
   1 שתפו בוואטסאפ
GET /product 200
   1 שתפו בוואטסאפ
   1 העתקת קישור
GET /account/orders/x (unauth) 307 -> http://localhost:3147/login?next=%2Faccount%2Forders%2F00000000-0000-0000-0000-000000000000
```
(The decoded text is `שלום, ראיתי את "סטייל הבית" בקניון EXPRESS ואשמח לפרטים` + page URL. Each count of 2 is the HTML plus the RSC payload. The native-share button renders client-side only, so it isn't in the SSR HTML. The order page needs a session, and the source-level test in ShareMenu.test.tsx covers it.)

### compare.mjs (site-wide parity gate)
```
=== COMPARE_ALLOW_PENDING_IMAGES=1 node scripts/compare.mjs --page=product --widths=380 ===
  ours     : 1 failed to load (1 fetch)
live: 380x11181  mine: 380x11617
OVERALL first 2600px: 37.57%
  of which: reference blank 24.55%  ours blank 6.34%  both painted 6.68%
=== COMPARE_ALLOW_PENDING_IMAGES=1 node scripts/compare.mjs --page=home --widths=380 ===
  ours     : 1 failed to load (1 fetch)
live: 380x8792  mine: 380x11617
OVERALL first 2600px: 44.85%
  of which: reference blank 16.66%  ours blank 13.86%  both painted 14.33%
```
C147 doesn't change the markup of any gated page (home, product, /c, /c/<slug>). `git diff` touches only /s/<id>, the account order page, and lib/components that ProductInfo doesn't import. The numbers match the earlier runs (home 380: C130 46.26, C133 46.25), and they still fail <11. Per M01-c347, that gap comes from the locked header/topbar/hero bands and local data fallback. C147 didn't cause it and can't fix it.

RESULT: DONE
