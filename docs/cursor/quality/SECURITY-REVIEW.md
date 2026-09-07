# Security review (quality)

Companion to `docs/cursor/SECURITY-REVIEW.md`. Short threat → stop.

| Attack | Stop |
|---|---|
| Shopper sets price | beginCheckout re-prices |
| Webhook forge amount | ignore body; GetLpResult; `?s=` |
| Replay webhook | dedup 200 |
| Guest cart steal | UUID cookie httpOnly; policy session_id constructed; no jar forward |
| Admin JWT on catalogue cache | `createPublicClient` anon |
| Uploader refund | requireSection + tests |
| Support refund | 403 |
| Scanner other shop | wrong_supplier from membership |
| service_role in mobile | forbid; grep |
| Leaked service key | SHA-256 denylist + rotate |
| Mock in prod | env tests |
| QR guess | signed + alphabet |
| Double scan | WHERE issued + idempotency |
| Referral farm | SQL fingerprint; paid on-site cash |
| Open redirect | `safe-next` |
| Debug sentry probe | 404 when off |
| ntfy lurker | unguessable topic; no amounts |
| RLS advisor add policy on zero-policy | would loosen; 172_rls explicit deny instead |

Cardcom no HMAC: secret URL is the authenticator. Rotate retiring window.

Full write-up: `docs/cursor/SECURITY-REVIEW.md`.

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
