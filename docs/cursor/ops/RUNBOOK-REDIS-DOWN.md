# Runbook: Redis (Upstash) down

Likelihood: medium. Not the ledger.

## First ten minutes

1. Rate limit should fall back to Postgres `check_rate_limit` (service_role). Anon JWT cannot call that RPC. If 127 is unapplied, Redis down can mean **unlimited** or **500**. Prefer fail closed on scan and PIN.
2. Search/analytics may degrade. Catalogue still sells.
3. QStash is separate. Missing QStash → inline search index, not Redis.
4. `KILL_SWITCH_CACHE` is not Redis. Do not flip it as a Redis fix.

## Recovery

Upstash restore. Do not add a second Redis vendor mid-incident. After return: confirm scan 30/min and PIN 15/hour still bite.

## Do not

Disable rate limits "so the till works". The till must fail closed.

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
