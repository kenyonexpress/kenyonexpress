# C85 — Canonical host: https://www.kenyonexpress.co.il

## Decision
Canonical origin is `https://www.kenyonexpress.co.il`. The apex already 308s to www (Vercel).

## Finding (before)
Production (checked 2026-10-30) emitted apex URLs everywhere: `<link rel="canonical" href="https://kenyonexpress.co.il"/>`,
`og:url`, JSON-LD `"url"`, and every `<loc>` in `/sitemap.xml`. Cause: `NEXT_PUBLIC_APP_URL` unset in the build, so every
`?? 'https://kenyonexpress.co.il'` fallback won. `robots.txt` derives its `Sitemap:` line from the same helper.

## Change
- `src/lib/site-url.ts` (used by sitemap.ts, robots.ts, feeds): fallback → www.
- Page-level fallbacks → www: store home (JSON-LD), product, category, city, /s/[id], checkout return, affiliate,
  newsletter, finalize (emails), invoice route, 3 cron routes.
- `next.config.ts` `env.NEXT_PUBLIC_APP_URL` defaults to www. This covers `src/app/layout.tsx` (`metadataBase`, root
  canonical/og:url), which is a LOCKED file and was not edited. An explicit env value still wins.
- Developer docs curl examples, admin placeholder, email doc comments → www.
- Left alone on purpose: email addresses (`@kenyonexpress.co.il`), `cdn.` host, WordPress `wp-content` image sources, tests that use apex as an arbitrary request URL.

## Verify
```
$ curl -sI https://kenyonexpress.co.il
HTTP/2 308 
location: https://www.kenyonexpress.co.il/
$ curl -sI https://www.kenyonexpress.co.il
HTTP/2 200 
server: Vercel
```
Unit tests (site-url, sitemap, robots, seo): 72 pass.

## Post-deploy check
`curl -s https://www.kenyonexpress.co.il/ | grep -o 'rel="canonical"[^>]*'` and `curl -s https://www.kenyonexpress.co.il/sitemap.xml | grep -c '<loc>https://kenyonexpress'` (expect 0).
Production still serves the old apex output until this commit is deployed. Setting `NEXT_PUBLIC_APP_URL=https://www.kenyonexpress.co.il` in Vercel production env is optional (next.config.ts default covers it).
