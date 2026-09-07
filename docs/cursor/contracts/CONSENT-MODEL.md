# Consent model

Cookies (legal test): `ke_session_id` (necessary, guest cart + analytics anonymous_id), `ke_consent`, `ke_attr`, `ke_cart_mirror_v1`.

---

## Types

| Type | Where | Unlocks | Withdraw |
|---|---|---|---|
| Necessary | session/cart | Shop | Session end / cookie delete; cart dies |
| Analytics | `ke_consent` + `/api/a` | page_view etc. | Banner deny; stop ingest |
| Marketing email | newsletter `confirmed_at` | abandoned cart, campaigns | unsubscribe + `email_suppressions` |
| Marketing WhatsApp | explicit (not the float) | W30 | stop text + suppression |
| Push | token + `PUSH_ENABLED` | outbox push leg | delete token |
| Attribution | `ke_attr` | affiliate/referral first touch | cookie delete; paid snapshots stay |

Transactional mail (voucher, receipt) does **not** use the marketing checkbox.

Analytics `session_id` in the event payload is client-owned; `anonymous_id` is the httpOnly cookie. Do not conflate with PostgREST `session_id=`.

---

## Open questions

| Q | Best answer |
|---|---|
| Google/Meta tags? | Load only after consent (`ThirdPartyTags.test.tsx`). Script itself leaks IP if loaded early; architecture prefers not to load denied. |
