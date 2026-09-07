# W41 PWA

Code-agent spec. Manifest, SW, offline tile `/offline` noindex, install prompt already exist.

---

## What it builds

1. Keep offline shell honest: no "pay offline". Queue scan is W18, not the shopper PWA.
2. Install prompt a11y (existing test). Do not block LCP (cookie banner history).
3. `source: pwa` on analytics client events.

---

## Tables

None. `push_tokens` is W42.

---

## RLS

N/A.

---

## Money invariants

Service worker must not cache `/api/payments/*` or checkout POST. Cache catalogue GET only if `CACHE-POLICY` allows.

---

## Tests before close

`install-prompt.test.tsx`. SW does not cache webhook. Offline page noindex.

---

## Feature flag

None.

---

## Docs updated

`CACHE-POLICY.md`, `A11Y-CHECKLIST.md`.

---

## Edge cases

`ke_session_id` httpOnly: SW cannot read it. Guest cart still cookie-based, not IDB as source of truth.

---

## Hebrew UX strings

| Key | Copy |
|---|---|
| Offline | אין חיבור. אפשר לגלוש בדפים שנשמרו. |
| Install | הוספה למסך הבית |

---

## Open questions

| Q | Best answer |
|---|---|
| Offline add-to-cart? | **No** as source of truth. IDB mirror at most (`ke_cart_mirror_v1` already a cookie name in legal tests: confirm it is not a second cart). |
