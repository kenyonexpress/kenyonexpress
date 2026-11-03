# C190 SECURITY: pnpm audit --prod and secrets scan

Measured 2026-11-03 on closeout/v1-final at 36cb6e1b7.

## Gate 1: pnpm audit --prod, zero high

```
$ pnpm audit --prod --audit-level=high; echo rc=$?
2 vulnerabilities found
Severity: 2 moderate
rc=0

$ pnpm audit --prod --json | jq .metadata.vulnerabilities
{"info":0,"low":0,"moderate":2,"high":0,"critical":0}
```

high 0, critical 0. The two moderates are glob (GHSA-3g3m-2fjr-6pw4) reached only through @sentry/nextjs build plugins (bundler-plugin-core, webpack-plugin): build-time source-map upload, not runtime code. Not in the gate, left as is.

## Gate 2: secrets scan clean

```
$ node scripts/audit-secrets.mjs; echo rc=$?
audit-secrets: KNOWN  ^[A-Z_]* .env.local
  A 15,915-byte dump of the `less` help screen, committed 2026-09-08 in 8dd678d18 ("checkpoint before checking out arch/category-page", 4 files, also deleting 2795 lines of STATE.md - a broad `git add`, which CLAUDE.md forbids). The name comes from an unquoted grep pattern. It holds NO credentials - checked - but its name claims to. ACTION: the owner deletes it; deleting files is one of the four conditions this project reserves for a human.

audit-secrets: no new findings (5158 tracked files, 1 known)
audit-secrets rc=0
```

The one KNOWN entry is a committed less help-screen dump whose filename came from an unquoted grep pattern; it holds no credentials.

```
$ node node_modules/vitest/vitest.mjs run scripts/audit-secrets.test.mjs
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Second pattern pass over tracked files (sb_secret_, sk_live_, AKIA, PEM private key, ghp_, xox):

```
src/lib/auth/challenge-cookie.test.ts:5:  SUPABASE_SECRET_KEY: 'sb_secret_test_key_long_enough',
src/lib/env-probe.test.ts:19:  SUPABASE_SECRET_KEY: 'sb_secret_opaque_and_well_formed',
src/lib/env-probe.test.ts:80:      SUPABASE_SECRET_KEY: 'sb_secret_your-service-role-key',
src/lib/wallet/config.test.ts:10:const KEY = '<PEM PRIVATE KEY block, body MIIE>'
src/lib/wallet/notify.test.ts:11:const KEY = '<PEM PRIVATE KEY block, body MIIE>'
src/server/auth/wa-otp.test.ts:6:  SUPABASE_SECRET_KEY: 'sb_secret_test_key_long_enough',
src/styles/electro-icons.css:3:  src: url(data:application/font-woff;base64,d09GRgABAAAAAEMsAAsAAAAAQuAAAQAAAA
```

All six are test fixtures: three sb_secret_ strings that are readable English (test_key_long_enough, opaque_and_well_formed, your-service-role-key), two PEM blocks with a 4-char body (MIIE), and a base64 woff font that happens to contain AKIA. No real credential.

```
$ git ls-files | grep -cE "(^|/)\.env(\.local|\.production)$"
0
```

## Repo gates at commit time

```
$ pnpm type-check; echo rc=$?
rc=0
$ pnpm lint; echo rc=$?
tokens gate: clean (no raw hex, rgb() or arbitrary px in src/)
copy gate: clean (no Latin marketing sentence in a rendered component)
asset gate: clean (no template or vendor product imagery under public/images)
rc=0
$ pnpm test
 Test Files  875 passed | 3 skipped (878)
      Tests  9671 passed | 39 skipped (9710)
```

## RESULT

RESULT: DONE
