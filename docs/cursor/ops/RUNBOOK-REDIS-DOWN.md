# Runbook: Redis (Upstash) down

1. Rate limit falls back to Postgres `check_rate_limit` (service_role). If 127 not in your mental model: anon cannot call it; missing Redis should not mean unlimited.
2. If both Redis and RPC fail: search/analytics/scan may 500 or open. Prefer fail closed on scan (till).
3. QStash is separate: missing QStash → inline index, not Redis.
4. Do not add a second Redis vendor mid-incident.
