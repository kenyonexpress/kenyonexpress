# L11 Growth plumbing report (C12)

## State found
| Item | Status | Where |
|---|---|---|
| JSON-LD, product pages | present (Product, Offer, Breadcrumb) | `src/app/(store)/product/[slug]/page.tsx`, `src/lib/seo/json-ld.ts` |
| JSON-LD, /category/<slug> | present (BreadcrumbList + ItemList) | `src/app/(store)/category/[slug]/page.tsx` |
| JSON-LD, /c and /c/<city> | **added in C12** (BreadcrumbList; ItemList on city) | `src/app/(store)/c/page.tsx`, `src/app/(store)/c/[slug]/page.tsx` |
| sitemap.xml | present, anon client, cached, excludes private paths | `src/app/sitemap.ts` |
| robots.txt | present, disallows /redeem/ /coupon/ /account/ /admin/ /api/ etc. | `src/app/robots.ts` |
| 301 redirects | present, see `docs/REDIRECTS.md` (created in C12; it did not exist) | `src/proxy.ts`, `src/lib/seo/` |
| GA4 | present, consent-gated, id from `NEXT_PUBLIC_GA4_MEASUREMENT_ID` | `src/lib/analytics/third-party.ts` |
| Resend templates | present: order-confirmation, coupon-delivery, cashback-credited, refund-completed, welcome, gift, voucher-expiry, auth-mail | `src/lib/email/templates/` |

## Not done / not verifiable here
- `NEXT_PUBLIC_GA4_MEASUREMENT_ID` and Resend production keys are env values; not checked from this session.
- compare.mjs visual gate was not re-run: the change only adds `<script type="application/ld+json">` elements, which render nothing.
- layout.tsx is locked and was not touched.

## Verification
tsc clean for the touched files, biome clean, vitest sitemap/robots/seo suites 65/65 pass.
