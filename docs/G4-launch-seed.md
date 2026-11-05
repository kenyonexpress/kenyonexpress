# G4: three launch coupons seeded (05.11.2026)

`scripts/seed-launch.ts` wrote one dummy supplier and three sample coupons into
production, through the same money module, publish gate and image pipeline the
admin form uses. Run `--check` to see them, `--remove` to delete exactly them.

## What is live now (`pnpm exec tsx scripts/seed-launch.ts --check`)

```
target project ixvwfbuvfxxsjiywhbbb (read-only)
supplier: דמה - להחליף (active, is_demo=true)
launch coupons present: 3 of 3
  launch-italian-dinner-tlv:   active, is_demo=true, paid 119 / face 240,  platform 15%, 90d, stock 50
  launch-swedish-massage-60:   active, is_demo=true, paid 149 / face 320,  platform 15%, 60d, stock 50
  launch-north-cabin-2-nights: active, is_demo=true, paid 790 / face 1400, platform 15%, 90d, stock 50
```

| slug | name | category | paid online | face value | validity | image (old site attachment) |
|---|---|---|---|---|---|---|
| `launch-italian-dinner-tlv` | ארוחת זוגית איטלקית - תל אביב | `restaurants-cafes` | 119 ILS | 240 ILS | 90 d | wp 6174 `סטייק-1.jpg` |
| `launch-swedish-massage-60` | עיסוי שוודי שעה - פאטאיה סטייל | `beauty-health` | 149 ILS | 320 ILS | 60 d | wp 7378 `massage-2768833_1280.jpg` |
| `launch-north-cabin-2-nights` | לינה בצימר צפון - 2 לילות | `vacation` | 790 ILS | 1400 ILS | 90 d | wp 6342 `h6.jpg` |

Money went through `buildProductMoneyWrite` (coupon convention: `price_ils` =
`full_price` = face value, `kenyon_price` = `coupon_price_ils` = paid online)
and `assertPublishable` with the supplier identity, so each row is one the
admin form would have published. Fixed ids `de30de30-0000-4000-8000-3...`,
`upsert ... onConflict id`: a second run leaves one copy. Both image URLs
probed 200 `image/webp` from the public bucket; the catalogue gate
(`pnpm exec vitest run src/lib/catalogue`) stays green at 43/43.

## Five corrections to the item as written

1. **No `is_seed` column and no migration.** `products.is_demo` and
   `suppliers.is_demo` already exist in production for this purpose (72 demo
   rows carry it). Adding a second flag with the same meaning is how two
   cleanups disagree. The three rows carry `is_demo = true` plus the tag
   `launch-seed`, and `--remove` targets their fixed ids, so the demo
   catalogue and the launch seed can be removed independently.
2. **Not the server action.** `createProduct` / `importProductsBatch` need a
   staff session and a multipart request, which a script has neither of
   (`scripts/seed-demo-catalog.ts` records the same). The real code path a
   script CAN share is the money module, the publish gate, `processImage`,
   the storage key shape and the `media_assets` row, and it does.
3. **Not `vercel env pull`.** The service key is sensitive in Vercel and does
   not pull. The script reads `.env.local` through the same `loadEnv` the
   demo seed uses, and the repo's `seed-target-guard` refused production
   until `SEED_ALLOW_PRODUCTION=i-understand` was set on the command line,
   which is the guard working, not bypassed.
4. **The images are from the old site, not `wp_import/italian-restaurant.jpg`
   etc.** Those file names do not exist; `wp_import/media/<sha256>.webp` are
   the attachments stage 06 downloaded, matched through
   `wp_import/normalized/media.json` and `products.json` (the old
   "ארוחה זוגית", "עיסוי מפנק" and "צימר מאסטר" listings). No stock, no
   placeholder.
5. **Images are stored in Supabase Storage, webp only.** R2 is not configured
   in `.env.local`, and the public `product-images` bucket allows
   `jpeg, jpg, png, webp, gif` and refuses `image/avif` (measured: the first
   upload failed on it). The script drops the avif renditions for a bucket
   that refuses them; the storefront reads only the largest webp. The admin
   upload action has the same gap on this sink and is not changed here.

## Related, not fixed here

The 72 `demo-` products reference `/images/cdn/wp/<sha>.webp`, a path nothing
in `src/` serves: production answers 404 for them. The launch rows do not
share that defect because their URLs are the bucket's own.

## Gates

`pnpm type-check` 0 errors, `pnpm lint` exit 0, catalogue gate 43/43. Freeze
diff empty.
