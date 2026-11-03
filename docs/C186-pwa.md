# C186: PWA and web push

03.11.2026, branch `closeout/v1-final`.

## What already existed (wired, measured live)

| Piece | Where | Consumer |
|---|---|---|
| Manifest | `src/app/manifest.ts` | Next metadata route, `/manifest.webmanifest` |
| Service worker | `public/sw.js` | `ServiceWorkerRegistrar` in `src/app/layout.tsx` |
| Offline fallback | `src/app/offline/page.tsx`, `OFFLINE_URL` in `sw.js` | network-first navigations fall back to it |
| Install prompt | `src/components/pwa/InstallPrompt.tsx` | `src/app/layout.tsx` |
| VAPID web push | `src/lib/push/web-push.ts`, `sw.js` push + notificationclick | `PushPrompt` on `/checkout/return`, `BrowserPushToggle` on `/account/notifications` |

`layout.tsx` is a forbidden file and was not touched; both PWA components were already mounted there.

Production, `https://www.kenyonexpress.co.il`:

```
/manifest.webmanifest 200 application/manifest+json; charset=utf-8
/sw.js 200 application/javascript; charset=utf-8
/offline 200 text/html; charset=utf-8
/icons/icon-192.png 200 image/png
/icons/icon-maskable-512.png 200 image/png
{"name":"קניון EXPRESS","short_name":"קניון EXPRESS","description":"קופונים ומוצרים מעסקים בישראל","start_url":"/","scope":"/","display":"standalone","orientation":"portrait","theme_color":"#fed700","background_color":"#ffffff","lang":"he","dir":"rtl","categories":["shopping"],"icons":[...192 any, 512 any, 512 maskable]}
77:const OFFLINE_URL = '/offline'
105:self.addEventListener('install', (event) => {
116:self.addEventListener('activate', (event) => {
308:self.addEventListener('fetch', (event) => {
397:self.addEventListener('push', (event) => {
428:self.addEventListener('notificationclick', (event) => {
cache-control: public, max-age=0, must-revalidate
service-worker-allowed: /
```

Vercel production env (`vercel env ls production`, names only):

```
 VAPID_PRIVATE_KEY                  Hidden                      Secret    Production                          40d ago
 NEXT_PUBLIC_VAPID_PUBLIC_KEY       eyJ2IjoidjIiLCJjIj…         Config    Production                          40d ago
```

`VAPID_SUBJECT` is unset there; both `configure()` and `vapidConfig()` fall back to a default subject, so sending does not depend on it.

## What was broken: the post-purchase subscription never got saved

1. **`PushPrompt` (on `/checkout/return`) and `BrowserPushToggle` POSTed to `/api/push/subscribe` with no `Authorization` header.** That route returns 401 without `Bearer`. So the shopper granted browser permission, the browser subscribed, and the save failed every time, leaving a subscription the server couldn't reach.
2. **The route wrote columns that don't exist.** It wrote `keys_p256dh` and `keys_auth` with conflict target `(user_id, endpoint)`. The live table (290) has `p256dh`, `auth` and a unique index on `endpoint`, so even a correct Bearer call would have failed. Proof, production:
   ```
   ERROR:  42703: column ... (keys_p256dh) of relation push_subscriptions does not exist
   indexdef: CREATE UNIQUE INDEX push_subscriptions_endpoint_key ON public.push_subscriptions USING btree (endpoint)
   ```
3. **The toggle's "off" sent `DELETE /api/push/subscribe`, and that route only exports `POST`.** Turning it off returned 405 and left the stored row in place.
4. **The return page rendered two push offers at once**: `PushPrompt` and `PostPurchasePushPrompt` (a link to `/account/notifications`).

## Fix

- `PushPrompt` and `BrowserPushToggle` now save through `savePushSubscription` and remove through `removePushSubscription` (`src/server/actions/push.ts`). These use cookie auth, which covers anonymous guest buyers. They validate the wire format and write the live columns. A refused save unsubscribes the browser again. Both reuse `urlBase64ToUint8Array` from `src/lib/push/vapid.ts` instead of their own copies.
- `/api/push/subscribe` (the Bearer path, kept for token clients) now writes `p256dh`/`auth` with `onConflict: 'endpoint'`.
- `PostPurchasePushPrompt` is no longer rendered on the return page, so there is one offer after a purchase. The dialog still opens only from an explicit button press. The component and its tests stay as they are; deleting them was not required.
- `no-unbounded-fetch.test.ts`: removed the two allowances that the change made stale. The test itself demands this.

The action's upsert shape, proven against production in a rolled-back block (two identical upserts collapse to one row; nothing is left behind):

```
C186_PROBE rows=1 (rolled back)
"count": 0
```

## Gates

```
$ vitest run src/components/push src/components/pwa src/app/api/push src/lib/push src/lib/pwa src/server/actions src/lib/http "src/app/(store)/checkout" src/components/account src/app/manifest.test.ts src/app/offline
 Test Files  75 passed (75)
      Tests  705 passed (705)

$ pnpm -s type-check
type-check rc=0

$ pnpm -s lint
lint rc=0
Checked 7110 files in 2s. No fixes applied.
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
```

New tests: `src/components/push/PushPrompt.test.tsx` checks that saving goes through the action with no `fetch`, and that a refused save calls unsubscribe. `route.test.ts` adds a check that pins the live column names and the conflict target.

No visual change to home, product or category pages; the only rendered change removes one banner from `/checkout/return`, so the compare gate does not apply. No migration.
