# Cost model

| Service | 1x (today) | 10x | 100x | First paid trigger |
|---|---|---|---|---|
| Vercel | preview + prod | Pro if build minutes / bandwidth | Enterprise rare | Hobby cron must **never** return; already Actions |
| Supabase | project ixvwfbuvfxxsjiywhbbb | compute + PITR | read replicas later | PITR on before launch; disk from images/outbox |
| Cardcom | per-transaction | same | same | production MID |
| Resend | email count | domain | dedicated | failed voucher mail SLO |
| R2 | storage+class A | images 10x | CDN | WP pull done |
| Upstash | optional | rate limit | Redis required if Postgres RPC hot | scan 429 with RPC timeout |
| Meilisearch | optional unset | host | dedicated | ILIKE p95 |
| Sentry | EU | quota | | dropped money events |
| GitHub Actions | 12 cron | minutes | self-host cron / 162 vault | R29 quota |
| ntfy | free public | self-host | | topic guessable |

Money path must not depend on Meili/Upstash/QStash.

Upgrade trigger: checkout p95 or stranded >0 daily, not dashboard GMV (ingest may lie).

---

## Second pass

Money path must not depend on Meili/Upstash. First paid trigger is SLO miss, not dashboard GMV. Hobby cron must never return.
