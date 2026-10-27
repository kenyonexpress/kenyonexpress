# C10: F14 web push

Status: complete. The VAPID env, the service worker handler and the subscribe
route were already live (see C11-WEB-PUSH-SETUP.md). C10 added the rest.

| Piece | Where |
| --- | --- |
| VAPID env | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (inert without keys) |
| Service worker `push` and `notificationclick` | `public/sw.js` (same-origin click targets only) |
| Subscribe | `POST /api/push/subscribe` |
| Unsubscribe | `DELETE /api/push/subscribe` with `{ endpoint }`, RLS `delete_own` |
| Admin broadcast | `/admin/push`, `src/server/actions/admin/push-broadcast.ts`, `src/lib/push/broadcast.ts` |
| User toggle | `src/components/account/BrowserPushToggle.tsx` on `/account/notifications` |

The broadcast is admin-only (`requireAdminSession`, MFA included), validates
title (80) and body (200), allows same-origin paths only, prunes 404/410
endpoints, and writes an audit-log row. No migration was needed.
