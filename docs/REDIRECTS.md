# REDIRECTS

Single reference for every 301/308 the site serves. (This file did not exist when C12 started; it records what the code actually does.)

Resolution order in `src/proxy.ts`:

1. `seo_redirects` table (per-URL map from the WordPress import), via `src/lib/seo/redirects.ts`. 301 or 410. Cached 5 minutes. A table row wins over everything below.
2. Structural WordPress shapes, `src/lib/seo/wp-legacy.ts`. 301.
3. `redirects()` in `next.config.ts`. Emits 308 (permanent).

## Structural WordPress map (wp-legacy.ts, 301)

| From | To |
|---|---|
| /shop | /products |
| /my-account | /account |
| /contact-us | /contact |
| /about-us | /about |
| /blog-2 | /blog |
| /home, /index.php | / |
| /product-category/<a>/<b> | /category/<b> (leaf slug) |
| /product-tag/<t> | /search?q=<t> |
| /product/<slug> | unchanged, no rule needed |

## next.config.ts (308)

| From | To |
|---|---|
| /supplier/apply | /suppliers |
| /terms-and-conditions | /terms |
| /privacy-policy | /privacy |
| /refund_returns | /returns |
| /cancellation-policy | /returns |

## Page-level

- /c/<category-slug> redirects to /category/<slug> (canonical category route).
