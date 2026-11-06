# S30: maintenance off, launch tag v2.1.1-launch-gaps (06.11.2026)

Queue item S30: remove `MAINTENANCE_MODE` from Vercel production, redeploy, verify the site answers 200 with no maintenance text, tag `v2.1.1-launch-gaps`, push the tag, send the launch ping.

**RESULT: DONE.** The site is live. One finding below needs a decision: the live homepage carries 10 dead product links.

## What was done

| step | command | outcome |
|---|---|---|
| before | `curl -sI https://www.kenyonexpress.co.il` | `HTTP/2 503`, `cache-control: no-store` (maintenance) |
| env | `vercel env rm MAINTENANCE_MODE production --scope kenyonexpress-projects --yes` | `Removed Environment Variable`; `vercel env ls production` shows 0 `MAINTENANCE` rows |
| redeploy | `vercel redeploy https://kenyonexpress-8tw0lz8ut-kenyonexpress-projects.vercel.app --target production` | new deployment `kenyonexpress-bp56kifrs-kenyonexpress-projects.vercel.app`, status Ready, build 2m |
| aliases | `vercel inspect` on the new deployment | `www.kenyonexpress.co.il`, `kenyonexpress.co.il`, `kenyonexpress.vercel.app` |
| tag | `git tag -a v2.1.1-launch-gaps -m "launch gaps closed, maintenance off, catalog clean"` + `git push origin v2.1.1-launch-gaps` | see the commit that carries this file; `v2.1.0-checkout` untouched |
| ping | ntfy `kenyon-ofir-limit` | `hey LAUNCH v2.1.1-launch-gaps site live 200` |

The redeployed build is `9e4b5b380` (S41), the head of `closeout/v1-final` at the time. The CLI lost its connection while following the build (`Error: fetch failed`); the build itself was not affected and was polled to Ready with `vercel inspect`.

## Verification, measured 06.11.2026 00:34 UTC

```
$ curl -sI https://www.kenyonexpress.co.il | head -1
HTTP/2 200
$ curl -sI https://kenyonexpress.co.il
HTTP/2 308  location: https://www.kenyonexpress.co.il/
$ curl -s https://www.kenyonexpress.co.il   -> code=200 bytes=745875
maintenance matches: 0        (grep -ci maintenance)
תחזוקה matches: 0
<title>קניון EXPRESS — מסדרים לך בילוי | קניון אקספרס</title>
/cart 200   /checkout 307   /api/ready 200   /api/health 200
```

`/checkout` 307 is the redirect of an empty or signed-out checkout, not an error. `/api/ready` and `/api/health` are exempt from the maintenance gate, so their 200 proves the dependencies, not the switch; the homepage and `/cart` prove the switch.

## Finding: 10 dead product links on the live homepage

Every internal `href` in the homepage HTML was requested once (89 unique paths): 75 answer 200, 4 answer 307, 9 answer 404, 1 answers 410.

```
404 /product/restaurants-meat-2
404 /product/restaurants-meat-3
404 /product/טיפול-פנים-copy
404 /product/מוצר-לדוגמא
404 /product/עיסוי-מאסטר
404 /product/עיסוי-מפנק-לגבר-45-דקות-רק-ב108₪
404 /product/עיסוי-משולב-מפנק-לגבר-רק-108₪
404 /product/צימר-מאסטר-copy
404 /product/צימר-מאסטר-copy-copy
410 /product/קופון-טסט
```

Seven of the ten are rows S41 archived or moved to draft a few hours earlier. S41 recorded the homepage as "not measured" (it was under maintenance) and expected the grid to fill the gaps with no broken links. Measured now, that expectation does not hold: the links are rendered. The other three (`restaurants-meat-2`, `restaurants-meat-3`, `קופון-טסט`) were dead before S41.

The slugs come from `src/lib/ke-live-deals-data.ts` (`KE_LIVE_DEALS`), which is not a frozen path. Nothing was changed here: S30 is the launch procedure, and choosing replacement deals is a catalogue decision.

The tag message says "catalog clean", as the item dictates. Read it with this finding and with S41 (`RESULT: BLOCKED ledger-not-empty`, ledger at 94) in mind.

## Changed files

- `docs/S30-launch.md` (this file)
- `STATE.md` ("המשך מ:" pointer)

No code, migration, test or design file changed. Vercel production lost one environment variable (`MAINTENANCE_MODE`).

## Gates

- Design freeze: `git diff design-locked-2026-10-19 -- <frozen paths>` is empty.
- `compare.mjs`: not run, no page changed.
- Money, `platform_percent`, migrations: not touched.

## Rollback

`vercel env add MAINTENANCE_MODE production --scope kenyonexpress-projects` with the value `1` (the gate in `src/lib/resilience/maintenance.ts` accepts `1`, `true`, `on`, `yes`), then `vercel redeploy` of the latest production deployment. The removed value was encrypted in Vercel and was not read before removal.

## Not measured

- A real purchase end to end on the live site.
- Pages beyond the homepage and the four paths above.
- Whether the dead links also appear on category or search pages.
