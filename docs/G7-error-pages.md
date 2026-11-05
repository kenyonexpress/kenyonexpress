# G7: branded error pages (05.11.2026)

Queue item G7: a Hebrew RTL 404 with the logo and support links, a 500 with
retry, an offline page that lists cached pages, and a static
`public/offline.html` fallback for the service worker. The three routes
already existed in Hebrew RTL; this item puts them on one branded frame,
adds the support links and the cached-pages list, and gives the worker a
no-script fallback.

## What changed

| file | role |
|---|---|
| `src/styles/error-pages.css` | The Electro palette **redefined locally** (`--ke-err-primary: #fed700`, hover `#fedd26`, heading `#333e48`, body `#6f6f6f`, rule `#ddd`) under `.ke-error-page`, plus the layout. Nothing imported from the frozen `globals.css` or `tokens.css`: these documents must render when the shell failed. 44 px targets. |
| `src/components/error-pages/ErrorPageFrame.tsx` | One frame for all three: logo (`/images/logo.webp`, a plain `<img>` because the image optimizer may be down), code, title, text, actions, children, and the support line: `mailto:support@kenyonexpress.co.il` and `https://wa.me/972524635550` (the published store number, not the env override, so it works without env). No hooks, no data. |
| `src/components/error-pages/OfflineCachedPages.tsx` + `src/lib/offline/cached-pages.ts` | On `/offline`, reads the worker's `<version>-pages` cache through the Cache API (no network) and lists the product, category and catalogue documents already stored, newest first, labelled from the slug. Pure helper with 4 tests. |
| `src/app/not-found.tsx` | 404 on the frame: all products, categories, home. |
| `src/app/error.tsx` | 500 on the frame: retry (`reset()`), home, the digest; Sentry capture kept as it was. |
| `src/app/offline/page.tsx` | Offline on the frame, plain-link retry (works before hydration), plus the cached list. |
| `public/offline.html` | Static, script-free fallback with the same palette and support links. |
| `public/sw.js` | `VERSION` `ke-v3` -> `ke-v4` (old caches drop on activate); precaches `/offline.html` and the logo; navigation fallback order is now: cached browse page -> rendered `/offline` -> `/offline.html` -> plain-text 503. |
| `messages/{he,en}.json` | All new copy under `errorPages.*`, so the Hebrew-literal ratchet went DOWN (564 -> 561, ceiling lowered to match). |

## Measured

Fresh `pnpm build` (third attempt: the first two died on Supabase REST
timeouts during prerender while the laptop's link to eu-north-1 was losing
a third of its packets; the database itself was idle) and `pnpm start` on
port 3311:

```
/this-route-does-not-exist   404 text/html    ke-error-page__code/title/support, logo.webp,
                                              mailto:support@kenyonexpress.co.il, wa.me/972524635550,
                                              "הדף שחיפשתם לא נמצא"
/offline                     200 text/html    "אין חיבור לאינטרנט", logo.webp (the cached list hydrates client-side)
/offline.html                200 text/html    static, no script
/sw.js                       200 javascript   ke-v4, /offline.html
/images/logo.webp            200 image/webp
```

Gates: `pnpm type-check` 0 errors, `pnpm lint` exit 0 (tokens gate clean:
raw hex lives in the stylesheet, not in `src/` TSX; i18n ceiling 561),
vitest `src/app` + `src/components/pwa` 68 files / 690 tests green,
`src/lib/offline` 4/4.

## Not done

- `global-error.tsx` (the boundary for a root layout that throws) keeps its
  own inline markup: it must supply `<html>` and `<body>` itself and cannot
  rely on a stylesheet that the failed layout would have loaded.
- The offline list shows slugs, not product names: the page cannot fetch,
  and the worker caches documents, not metadata. A slug like
  `launch-italian-dinner-tlv` or a Hebrew slug reads well enough; a numeric
  one does not, and that is a catalogue-slug problem (STATE.md item 1).
