# L5 / C06 — Account + Wallet + Vouchers render check

Date: 2026-10-25. Branch: closeout/v1-final. No code changed this item.

## Pages
- `/account`, `/account/wallet`, `/account/vouchers`, `/account/my-vouchers` (all under `src/app/(account)/account/`).

## Result
- Unauthenticated, all four return 307 to `/login?next=...`. That is the expected guard, not a render.
- Rendering them for a signed-in user needs a Supabase session. `NEXT_PUBLIC_SUPABASE_ANON_KEY` returns 401 from `/rest/v1/`, so sign-in is impossible and the pages could not be rendered or checked for client/server errors.
- `tsc --noEmit` reports no errors in the four page files.
- During the check the dev server on :3000 dropped connections on `/login` and `/` (empty reply) and its PID changed, so it restarted. Cause not diagnosed; probably the same 401 key.

## Unblock
Replace the Supabase anon/service keys in `.env.local` (same blocker as C04, C05), then load the four pages with a test session and read the dev console and server log.
