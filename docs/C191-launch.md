# C191 LAUNCH GATE: checklist and human-only items

Measured 2026-11-03 05:51-05:55 UTC on closeout/v1-final at 33b057fb5.
Outputs below are copied from the terminal, secrets omitted.

## Production is up and the 03.11 DB outage is over

```
$ curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    "https://api.supabase.com/v1/projects/ixvwfbuvfxxsjiywhbbb/health?services=db&services=rest"
[{"name":"db","healthy":true,"status":"ACTIVE_HEALTHY"},{"name":"rest","healthy":true,"status":"ACTIVE_HEALTHY","info":{"db_schema":"public,graphql_public"}}]

$ supabase db query --linked "select count(*) as products, now() as at from products"
      "at": "2026-11-03 05:52:57.738133+00",
      "products": 126

$ for u in https://www.kenyonexpress.co.il/ https://www.kenyonexpress.co.il/api/health https://kenyonexpress.co.il/; do curl -s -o /dev/null -w "$u %{http_code}\n" "$u"; done
https://www.kenyonexpress.co.il/ 200
https://www.kenyonexpress.co.il/api/health 200
https://kenyonexpress.co.il/ 308

$ curl -s https://www.kenyonexpress.co.il/api/health
{"ok":true,"database":"ok","search":"not_configured","latency_ms":361}
```

`search: not_configured` is Meilisearch, paused by owner decision; not a gate.

## Disk was not the outage cause

```
$ curl -s -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" .../config/disk/util
{"timestamp":"2026-11-03T05:54:03Z","metrics":{"fs_size_bytes":2077073408,"fs_avail_bytes":1608728576,"fs_used_bytes":468344832}}

$ curl -s ... /config/disk
{"attributes":{"iops":3000,"size_gb":2,"throughput_mibps":125,"type":"gp3"}}

$ supabase db query --linked "select pg_size_pretty(pg_database_size(current_database())) as db_size"
      "db_size": "115 MB"
```

468 MB used of 2077 MB (22.5%). The full-disk theory from the outage morning is ruled out, so the root cause is on Supabase's side and only their support can name it.

## Local keys

```
anon/publishable REST 200
SUPABASE_SERVICE_ROLE_KEY: len 41 prefix sb_secret_
service REST 200            (GET /rest/v1/orders?select=id&limit=1)
in compromised list: false  (sha256 vs scripts/compromised-keys.mjs)
```

The secret key in use is no longer one of the exposed hashes, so the rotation item is closed.

## Cardcom

```
$ grep -cE '^CARDCOM_' .env.local
5
$ grep -E '^CARDCOM_USE_MOCK|^CARDCOM_SANDBOX' .env.local
CARDCOM_USE_MOCK=true

$ vercel project inspect
    ID        prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP
    Name      kenyonexpress
$ vercel env ls production | grep CARDCOM
 CARDCOM_SANDBOX                    Hidden   Secret    Production   30d ago
 CARDCOM_API_NAME                   Hidden   Secret    Production   30d ago
 CARDCOM_TERMINAL_NUMBER            Hidden   Secret    Production   30d ago
 CARDCOM_API_PASSWORD               Hidden   Secret    Production   30d ago
 NEXT_PUBLIC_CARDCOM_SANDBOX        eyJ2Ij…  Config    Production   48d ago
 CARDCOM_MERCHANT_ID                Hidden   Secret    Production   48d ago
 CARDCOM_CLIENT_ID                  Hidden   Secret    Production   48d ago
 CARDCOM_API_KEY                    Hidden   Secret    Production   48d ago
 CARDCOM_WEBHOOK_SECRET             eyJ2Ij…  Config    Production   64d ago
 CARDCOM_USE_MOCK                   eyJ2Ij…  Config    Production   64d ago
```

The linked Vercel project has the three Cardcom credential names in Production, set 30 days ago. Their values were not decrypted, so this does not show whether they are the live terminal or the sandbox, or whether `CARDCOM_USE_MOCK` or `CARDCOM_SANDBOX` is on. No 1 ILS charge has run (C187). That check needs the owner.

## Launch tag and flag

```
$ git tag -l 'v2.*' | tail -5
v2.5.0-rc1
v2.6.0-rc1
v2.7.0-rc1
v2.8.0-rc1
v2.9.0-rc1
$ git ls-remote --tags origin | grep -E 'v2\.1\.0|v2\.0' | tail -3
d421ab9e88b4d3990e2bf9cd4f83c4fe5b05c106	refs/tags/v2.0.3
bbdf38d1e5b51ece04c5e95f4e24a9aa29839e12	refs/tags/v2.0.3^{}
0f5e7ea0d0e36898cdf3122d32b5eb773a65cc1f	refs/tags/v2.1.0-rc1
$ ls -la ~/ke-goals/LAUNCH.flag
ls: /Users/ofir/ke-goals/LAUNCH.flag: No such file or directory
```

No v2.1.0 tag and no LAUNCH.flag. The verdict is HOLD, so neither was created and no "hey LAUNCH" was sent.

## Verdict

HOLD. The PUSH NOW and HOLD sections are at the top of the launch checklist (docs/LAUNCH-CHECKLIST.md), and the human-only items are at the top of the manual (docs/MANUAL.md).

## Repo gates

The first `pnpm test` run was red on 2 tests in `scripts/audit-secrets.test.mjs`:

```
audit-secrets: 1 NEW finding(s) in 5159 tracked files
  docs/C190-sec.md
    a private key block with real key material
```

Cause: docs/C190-sec.md quoted two 4-char PEM test fixtures on consecutive lines. The scanner's PEM pattern allows 100+ characters between BEGIN and END, so it matched from the first line's BEGIN to the second line's END and read the text between as key material. The literals in that doc are now elided. The scanner is unchanged.

```
$ node scripts/audit-secrets.mjs | tail -1
audit-secrets: no new findings (5160 tracked files, 1 known)
$ pnpm type-check; echo tsc=$?
tsc=0
$ pnpm lint; echo lint=$?
Found 26 warnings.
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
lint=0
$ pnpm test; echo test=$?
 Test Files  875 passed | 3 skipped (878)
      Tests  9671 passed | 39 skipped (9710)
test=0
```
