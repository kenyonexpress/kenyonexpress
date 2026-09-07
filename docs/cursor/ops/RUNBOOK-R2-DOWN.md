# Runbook: R2 down

Likelihood: low. Money path does not read R2.

## First ten minutes

1. Storefront: product images 404. Prices and cart still work if Postgres is up.
2. Admin upload: signed PUT fails. Stop publishing products that need new photos.
3. After DNS cutover: 32 SKUs may still load from WordPress `wp-content`. If R2 is down and WP is still up, those URLs can mask the outage. Do not treat WP as a permanent CDN.
4. Apple Wallet: pkpass 500/404. The on-site QR still works. Do not email a screenshot of the code as a workaround (capability leak).
5. Confirm all five R2 env vars are still set (H7). A missing key looks like "R2 down".

## Recovery

Wait for Cloudflare R2. Re-upload only if objects were lost (rare). Do not commit binaries to git.

## Do not

Hotlink random CDNs. Change `next/image` remotePatterns mid-incident without a deploy plan. Serve originals by pinning sharp 0.34 (that bug ships unoptimized AVIF).

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
