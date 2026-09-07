# Runbook: R2 down

1. Storefront: images 404. Catalogue money still works.
2. Admin upload: signed PUT fails. Stop publishing products that need new photos.
3. DNS cutover trap: 32 SKUs still on WP `wp-content`. If R2 is down after cutover, those WP URLs may still work until WP dies.
4. Apple pass images: pkpass 500/404; coupon page still shows QR on site.
5. Do not commit binaries to git as a workaround.
