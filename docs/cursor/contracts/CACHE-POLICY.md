# Cache policy

---

## May be cached

- Public catalogue HTML for logged-out users if `cacheComponents` / CDN, **without** personal cookies. `createPublicClient` is always anon (admin JWT must not leak drafts into cache).
- R2 public images (`R2_PUBLIC_BASE_URL`). Immutable hashed `_next/image` derivatives.
- Meili documents derived from Postgres (invalidate via outbox).

---

## Must never be cached

- `/api/payments/*`, webhook, checkout POST, `submitCheckout`.
- `/checkout/frame-return` (cookie-less iframe).
- Account, scan, admin, supplier portal.
- `/api/wallet/apple/*` (`no-store`: QR capability).
- `/api/a` ingest.
- Responses that include `ke_session_id` Set-Cookie as if public (guest cart is user-specific).
- Service worker must not cache the above.

---

## Invalidation

- Product change: search outbox + webhook → reindex. Catalogue pages: revalidate tags if used (`revalidatePath` on admin save already).
- Kill switch cache: skip cache layer, read Postgres (correct, slower).
- `NEXT_PUBLIC_*`: rebuild, not purge.

---

## Open questions

| Q | Best answer |
|---|---|
| `ke_cart_mirror_v1`? | Legal cookie list. Confirm it is a tiny mirror, not a second money cart. |
