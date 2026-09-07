# Rate limits

Postgres `check_rate_limit` is **service_role only** after 127. Upstash Redis when `UPSTASH_*` set, else that RPC.

| Surface | Limit (as documented in architecture/code comments) | Key | User sees |
|---|---|---|---|
| Search | per IP/route | IP | empty or 429 `rate_limited` |
| `/api/a` | ingest | IP / session | 429 |
| Voucher scan | 30/min/user | uid | outcome `rate_limited` |
| Staff PIN | 15/hour/staff | staff id | Hebrew too many PIN |
| Review submit | 5/hour/user | uid | יותר מדי ביקורות בשעה האחרונה |
| Login | per IP and per account sliding | IP + email | generic auth error |
| Contact / lead / newsletter | action limits | IP | Hebrew retry |
| Checkout | `RATE_LIMITED` code | uid/IP | יותר מדי ניסיונות |

Headers: `src/lib/rate-limit/headers.ts` (test exists). Do not expose which secret matched (webhook is constant-time, not a rate bucket).

Missing Upstash: Postgres path, not "unlimited".

---

## Open questions

| Q | Best answer |
|---|---|
| Exact search numbers? | Read `src/lib/rate-limit` on code branch; comments above are the pack's measured intent. |

---

## Second pass (ops)

- Redis down: Postgres `check_rate_limit` is service_role only. If that RPC is missing, **fail closed on scan and PIN**, never unlimited (`ops/RUNBOOK-REDIS-DOWN.md`).
- Scan 30/min is an **outcome** `rate_limited`, not HTTP 429 on the till HTML.
- PIN 15/hour is per staff id, not per shop. Do not lock the whole restaurant on one bad PIN.
- Webhook `?s=` is constant-time compare, **not** a rate bucket. Do not 429 Cardcom.
- Review 5/hour is already in `submitReview`. Shared limiter belongs in the same helper as login, not a second table.
- Checkout `RATE_LIMITED` Hebrew: יותר מדי ניסיונות. נסה שוב מאוחר יותר.

