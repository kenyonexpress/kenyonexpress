# C171 - RETRY C151 (full Playwright E2E) on the current network (2026-11-03)

RESULT: BLOCKED network: production Supabase UNHEALTHY (db/rest/auth) and 0.92 s avg RTT; E2E not started, no code changed

Precondition checks before spending a 43-minute suite run. Every spec that
renders a page or signs in reads production Supabase, so with the DB down the
run can only reproduce C151 runs 9-10 (timeouts), not prove anything.

## Output (verbatim, 04:59 +07)

```
$ date; route -n get default | grep gateway; ping -c 5 -q 1.1.1.1 | tail -2
Tue Nov  3 04:59:03 +07 2026
    gateway: 172.16.2.1
5 packets transmitted, 5 packets received, 0.0% packet loss
round-trip min/avg/max/stddev = 438.888/923.133/1348.521/330.004 ms

$ curl management API /v1/projects/ixvwfbuvfxxsjiywhbbb/health?services=db&services=rest&services=auth
[{"name":"db","healthy":false,"status":"UNHEALTHY","error":"Service health check failed"},{"name":"rest","healthy":false,"status":"UNHEALTHY","info":{"db_schema":"public,graphql_public"},"error":"Service health check failed"},{"name":"auth","healthy":false,"status":"UNHEALTHY","error":"Service health check failed"}]

$ curl -m 15 -H "apikey: <publishable>" $SUPABASE_URL/rest/v1/products?select=id&limit=1   (x3)
 http=000 t=15.142516
 http=000 t=15.070599
 http=000 t=15.136938
```

## Comparison with C151

| | C151 (runs 9-10) | C171 now |
|---|---|---|
| gateway | 172.20.10.1 (iPhone hotspot) | 172.16.2.1 |
| RTT to 1.1.1.1 | 357-414 ms | 439-1349 ms, avg 923 ms |
| Supabase | 1.1-3.7 s per call | db/rest/auth UNHEALTHY, REST 3/3 timed out at 15 s |

The gateway changed, but the link is slower, and the production DB outage
recorded at C152 (from 04:20 +07) is still in progress. That is a network/
upstream failure, so per the item rule the retry is skipped. No code changed,
no forbidden files touched. The last green full run stays C151 run 7
(6f9f6ac8f, 2362 passed / 0 failed).
