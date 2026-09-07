# Feature flags contract

There is **no** `feature_flags` table. `/admin/feature-flags` reports env kill switches (`listFeatureFlags`). Flip is Vercel env + new instance, not a row.

---

## Kill switches (`KILL_SWITCH_*`)

On only if raw is `1` / `true` / `on` / `yes` (case-insensitive). Else off (subsystem runs). Read per call.

| Env | Default | Who toggles | Off (killed) does to in-flight |
|---|---|---|---|
| `KILL_SWITCH_CACHE` | unset = run cache | Admin/ops in Vercel | Slower Postgres reads. Correct. In-flight HTML may be stale until next request. |
| `KILL_SWITCH_SEARCH` | unset | ops | Empty results, not 500. Index jobs still no-op or run; queries empty. |
| `KILL_SWITCH_RECS` | unset | ops | Strips hidden. Rest of page stays. |
| `KILL_SWITCH_NOTIFICATIONS` | unset | ops | Outbox rows remain. Send skipped. Replay drain later. |

---

## Till / pay

| Env | Default | Who | Off / wrong value |
|---|---|---|---|
| `CHECKOUT_ENABLED` | must be exact `true` in production | ops | Till closed. Pending orders expire; stock reservations release. No new Low Profile. |
| `CARDCOM_USE_MOCK` | unset | never production | Charges succeed without a card. Launch fail. |
| `CARDCOM_SANDBOX` | not `true` in production | boot-fail | Process refuses to boot. |
| `ALERTS_ENABLED` | should not be `false` in prod | ops | Phone dark. Sentry may still record. |
| `NTFY_TOPIC` | code default guessable | ops **must** set | Privacy of order ids. |

---

## Optional products

| Env | Default | Off |
|---|---|---|
| `PUSH_ENABLED` | unset/false | Push leg `none` / skip. Tokens may remain. |
| `PHONE_AUTH_ENABLED` | unset | OTP UI hidden. Existing sessions stay. |
| `CRON_SCHEDULER_ENABLED` | must be true with secret for Actions | Jobs stop. Voucher mail stops. |
| `MEILISEARCH_HOST` + key | unset | ILIKE/FTS. Index no-op. |
| `UPSTASH_*` | unset | Postgres rate limit service_role. |
| `QSTASH_TOKEN` | unset | Inline index worker. |
| `AI_AGENTS_*` | off | Safe. Do not enable at launch. |
| `SENTRY_DEBUG_ROUTES` | off | `/api/debug/sentry` 404. |
| `ALLOW_INCOMPLETE_ENV` | local only | Production must not set. |

`NEXT_PUBLIC_*` inlined at **build**. Changing in dashboard without rebuild does nothing.

---

## Wave flags (product)

Per-product `whatsapp_enabled`, campaign `is_active`, public lead form hide. Not env.

---

## Open questions

| Q | Best answer |
|---|---|
| Admin toggle without deploy? | Needs a table + human migration. Not this pack. |

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
