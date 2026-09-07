# Runbook: DNS cutover

DNS is **last**. Preview `https://kenyonexpress.vercel.app` must already run H6.

## Zones

Registrar NS: **live** Cloudflare `derek` / `elma`. Account also has staged `ignat` / `tess` (silent no-op if edited). H0: open the live zone.

## Steps

1. Pull remaining `wp-content` images into R2. Confirm 32 SKUs.
2. Apex still WP proxied. Create A/CNAME to Vercel **on the live zone** when ready: apex + www as Vercel docs.
3. TTL: lower hours before, not at the moment.
4. Box (registrar) NS change only if leaving Cloudflare; default is stay on Cloudflare and change **records**, not NS.
5. Propagation: `dig` apex from 1.1.1.1 and 8.8.8.8. Check `kenyonexpress.co.il` serves Next, not WP.
6. SSL: Cloudflare orange cloud vs Vercel cert. Prefer one TLS terminator as already documented in launch blockers.
7. POST `/api/payments/cardcom/webhook` must hit Vercel. Update Cardcom URL before cutting HTML if WP would swallow POST (proxy only redirects GET/HEAD on the Next side; WP may still own the name).
8. Rollback: restore WP A records on the **live** zone. Do not edit the staged zone and think you rolled back.

## Verify

Home Hebrew, checkout frame-return, one webhook 200, images not WP 404.
