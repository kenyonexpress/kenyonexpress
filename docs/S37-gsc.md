# S37: Search Console, TXT record and sitemap submission (06.11.2026)

Queue item S37: add the `google-site-verification` TXT record with `vercel dns add` if a token is in `~/ke-goals/secrets` (else SKIPPED), then submit the sitemap through the Search Console API.

**RESULT: SKIPPED no-gsc-credentials.** Nothing was added, nothing was submitted, no code changed.

- **TXT record.** `~/ke-goals/secrets` holds no verification token, so per the item nothing was added. Nothing needed adding either: the apex already carries a `google-site-verification` TXT record on Vercel DNS, created 22 days ago, and it resolves publicly.
- **Sitemap submission.** Not done. The Search Console API (`PUT https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/sitemaps/{feedpath}`) needs a Google OAuth token or service account with the `webmasters` scope, and this machine has none. A submission today would also have handed Google a 503: production is under `MAINTENANCE_MODE`, and `/sitemap.xml` is not exempt from it.

Everything below was measured on 06.11.2026 (01:50 Israel time) against production. All of it is read-only.

## What changed

| file | change |
|---|---|
| `docs/S37-gsc.md`, `docs/INDEX.md`, `README.md`, `STATE.md` | This file, its index row, the document count, state. |

No source file, no migration, no DNS record, no Vercel setting.

## Credentials looked for

| place | found |
|---|---|
| `~/ke-goals/secrets/cf.env` | Cloudflare R2 and Turnstile names only (7 variables) |
| `~/ke-goals/secrets/token.env` | `CLAUDE_CODE_OAUTH_TOKEN` only |
| `~/ke-goals` (file names matching gsc, google, service, credential) | nothing |
| `~/.config/gcloud` | does not exist |
| repo `.env*` (names starting `GOOGLE`, `GSC`, `GCP`) | nothing |
| `vercel env ls production` (names containing `GOOGLE`) | nothing |

Only variable names were read; no secret value was printed.

## The TXT record that is already there

```
$ dig +short TXT kenyonexpress.co.il
"google-site-verification=7_-kZsP6HnHTkq5qR--mZyLYx-EE3WSz6C1sxnbr0-I"

$ dig +short NS kenyonexpress.co.il
ns2.vercel-dns.com.
ns1.vercel-dns.com.

$ vercel dns ls kenyonexpress.co.il
rec_b31ce500162158b67d3c1478   (apex)   TXT   google-site-verification=7_-kZsP6HnHTkq5qR--mZyLYx-EE3WSz6C1sxnbr0-I   22d ago
```

The value is the same one recorded in `docs/DNS-SNAPSHOT-PRE-CUTOVER.md` (lines 79 and 96), so it was carried over from the old DNS at the cutover. A TXT record on the apex is what a Search Console **Domain property** (`sc-domain:kenyonexpress.co.il`) checks, and it covers both `kenyonexpress.co.il` and `www`.

Not measured: whether Search Console currently shows the property as verified, and under which Google account. That needs a login to Search Console.

## The sitemap, as Google would fetch it today

```
https://kenyonexpress.co.il/sitemap.xml        308 -> https://www.kenyonexpress.co.il/sitemap.xml
https://www.kenyonexpress.co.il/sitemap.xml    503 text/html, 1077 bytes, Retry-After: 300   (maintenance page)
https://www.kenyonexpress.co.il/sitemap/products.xml   503 (maintenance page)
https://www.kenyonexpress.co.il/                503 (maintenance page)
https://www.kenyonexpress.co.il/robots.txt      200 text/plain, 477 bytes
https://www.kenyonexpress.co.il/api/ready       200 {"ok":true,"search":"degraded","checks":{"database":"ok","redis":"ok","meilisearch":"down","r2":"ok","cardcom":"ok"}}
https://www.kenyonexpress.co.il/api/health      200
```

The same request with a Googlebot user agent on the apex also answers 308. `robots.txt` is exempt from maintenance mode (`src/lib/resilience/maintenance.ts`, `EXEMPT_EXACT`); `/sitemap.xml` and `/sitemap/*.xml` are not, so the file `robots.txt` points at is a 503 until the switch is turned off. `MAINTENANCE_MODE` was left alone: turning it off is the launch, and it is Ofir's (`STATE.md`, `docs/MANUAL.md`).

## Found, not fixed

- **`robots.txt` names the apex, production serves `www`.** It says `Host: https://kenyonexpress.co.il` and `Sitemap: https://kenyonexpress.co.il/sitemap.xml`, and every apex URL answers 308 to `www`. Both lines come from `siteUrl()` (`NEXT_PUBLIC_SITE_URL`, changed in Vercel 2 days ago), and the sitemap's `<loc>` values come from the same function. Google follows the redirect for the sitemap file itself, but if the `<loc>` values are apex URLs, every listed page is a redirect and not the canonical. Could not be read from production (503). To check once maintenance is off: the host in `<loc>` should be the host that answers 200.
- **Sitemaps are not served under maintenance.** A 503 with `Retry-After` is the correct answer for pages, and Google tolerates it on a sitemap for a short while; this one is 12 days old.

## What Ofir needs to do

1. Turn off `MAINTENANCE_MODE` (already the next step in `STATE.md`), and confirm `https://www.kenyonexpress.co.il/sitemap.xml` answers 200 XML.
2. In Search Console, open the Domain property `kenyonexpress.co.il` (the TXT record is in place; press Verify if it asks), then Sitemaps, and submit `https://www.kenyonexpress.co.il/sitemap.xml`. One time, about a minute.
3. Only if a scripted submission is wanted later: a Google service account JSON in `~/ke-goals/secrets`, with that account added as an owner of the property in Search Console. Then the `PUT` above can run from the queue.

## Gates

- Freeze: `git diff design-locked-2026-10-19 -- <frozen paths>` is empty (output at the commit, below).
- `pnpm lint:docs`: passes with this file indexed.
- `compare.mjs`: not run, no page changed. vitest, tsc, build: not run, no source file changed.
