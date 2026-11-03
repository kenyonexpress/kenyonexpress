# C193: tag v2.1.0 and LAUNCH (2026-11-03)

RESULT: BLOCKED C193 cardcom-live-unverified

## Decision

C193 says to tag v2.1.0, push the tag, touch ~/ke-goals/LAUNCH.flag and send "hey LAUNCH".
None of these ran. The launch gate written in C191 (docs/LAUNCH-CHECKLIST.md, "C191 LAUNCH GATE") is HOLD.
Its own release recipe says to run only "once HOLD 1 and 2 are clear":

- HOLD 1, Cardcom live payment: no real charge has ever run on the production terminal (C187, docs/MANUAL.md H1).
  This is one of the three blocker classes the iron rules allow ("Cardcom production creds missing").
- HOLD 2, the Supabase outage ticket: the cause of the 03.11 outage is still unknown.

Since C191 (ca9d7a71e) the only commits are the C192 .vercelignore fix and STATE logs. None of them touch the payment path, so neither HOLD has changed.
"hey LAUNCH" would tell the owner the store is ready to take money, and it is not proven that it can.
Tag v2.1.0 stays free for the release. No other tag was created, so nothing needs a force-push later.

## Raw output

```
$ git rev-parse --short HEAD
32e1792b9
$ git tag -l "v2.1*"
v2.1.0-rc1
v2.10.0-rc1
$ git ls-remote --tags origin | grep v2.1.0
0f5e7ea0d0e36898cdf3122d32b5eb773a65cc1f	refs/tags/v2.1.0-rc1
$ ls -la ~/ke-goals/LAUNCH.flag
ls: /Users/ofir/ke-goals/LAUNCH.flag: No such file or directory
$ git log --oneline ca9d7a71e..HEAD
32e1792b9 [autopilot] STATE.md: C192 BLOCKED (state-log)
d47e7a519 Record C192 prod regression: BLOCKED on Turnstile and link throughput
40fef5311 Negate docs/redirects.map.ts, the real filename, in .vercelignore
c1053be84 Keep the two build-imported refs/docs files in the Vercel upload
4e4ea8a87 [autopilot] STATE.md: C191 DONE (state-log)
c480ef248 STATE: C191 DONE
$ git log --oneline ca9d7a71e..HEAD -- src/server/actions/payments src/lib/cardcom* src/lib/payments | wc -l
       0
$ curl -s -o /dev/null -w "%{http_code}" https://www.kenyonexpress.co.il/api/health
200
$ grep -n "^## H1" -A6 docs/MANUAL.md
7:### H1. Cardcom production credentials (blocks launch)
8-
9-The current state, measured: the Vercel project `kenyonexpress` (prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP) has `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME` and `CARDCOM_API_PASSWORD` in Production, set 30 days ago. Locally, `.env.local` holds stubs with `CARDCOM_USE_MOCK=true`. No real charge has ever run.
10-
11-1. In the Cardcom merchant panel, confirm the terminal number and API user are the **live** terminal, not the sandbox.
12-2. Check the Production values. `CARDCOM_USE_MOCK` and `CARDCOM_SANDBOX` must be unset or `false`:
13-   ```bash
```

## To release once H1 (1 ILS live charge + refund) and H2 are clear

```bash
git tag v2.1.0 && git push origin v2.1.0
git ls-remote --tags origin | grep v2.1.0
touch ~/ke-goals/LAUNCH.flag
curl -d "hey LAUNCH" ntfy.sh/kenyon-ofir-limit
```
