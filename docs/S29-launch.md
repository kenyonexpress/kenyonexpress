# S29: launch checklist and the owner-only list (05.11.2026)

Result: **done.** `docs/LAUNCH-CHECKLIST.md` opens with a PUSH NOW / HOLD gate
measured today, replacing the 10.09 gate. `docs/MANUAL.md` is rewritten as 14
owner-only items, one per line, in priority order. Docs only; no code changed.

## What the measurement changed against the 10.09 documents

- Production now serves HEAD: Vercel `productionBranch=closeout/v1-final`,
  `dpl_Gf56dgrCcWSsGUhPJ96SvWPwPaZT` READY on `65f6c5912`. The 10.09 "redeploy"
  item is gone.
- The three Cardcom names now exist in production (created 04.10 by an agent
  session, sensitive, unverifiable). The item is no longer "add them" but
  "replace with real values and prove a ₪1 charge and refund".
- `CARDCOM_USE_MOCK` is absent from production. `SENTRY_DSN` is set.
- `MAINTENANCE_MODE` (since 25.10) makes `/`, `/checkout`, `/sitemap.xml` answer 503.
- 162's pg_cron jobs: 258 responses in the last 24 h, all 405.
- Active products: 90, not 44.

## Commands and output

```
$ curl -s -o /dev/null -w "%{http_code}" https://www.kenyonexpress.co.il/{,api/health,api/ready,checkout,robots.txt,sitemap.xml,api/cron/expiry,api/cron/health}
/ 503   /api/health 200   /api/ready 503   /checkout 503   /robots.txt 200   /sitemap.xml 503   /api/cron/expiry 401   /api/cron/health 401
$ curl -s https://www.kenyonexpress.co.il/api/health
{"ok":true,"database":"ok","latency_ms":740}
$ curl -sI https://www.kenyonexpress.co.il/robots.txt | grep -i strict
strict-transport-security: max-age=63072000; includeSubDomains; preload

$ vercel api /v9/projects/prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP
prodBranch closeout/v1-final
dpl_Gf56dgrCcWSsGUhPJ96SvWPwPaZT closeout/v1-final 65f6c5912340587147b5acc424fbd83fe6dbeb1c READY

$ vercel api /v9/projects/.../env  (production, created / updated)
CARDCOM_TERMINAL_NUMBER, CARDCOM_API_NAME, CARDCOM_API_PASSWORD, CARDCOM_SANDBOX  2026-10-04
RESEND_API_KEY      2026-10-06
MAINTENANCE_MODE    2026-10-25
CRON_SECRET         2026-10-24
R2_* key pair       2026-11-04
UPSTASH_REDIS_REST_*  absent
CARDCOM_USE_MOCK      absent

$ supabase db query --linked  (read only)
net._http_response, last 24 h: status 405 x 258
active_products 90, orders_7d 777, outbox_dead 74, cron_active 16
cron.job_run_details for ke-expiry%: 0 rows (first run 23:20 UTC)
```

## Gates

```
$ pnpm test
 Test Files  687 passed | 1 skipped (688)
      Tests  8166 passed | 13 skipped (8179)
   Start at  02:37:06
   Duration  74.90s (transform 16.18s, setup 65.55s, import 61.84s, tests 22.00s, environment 238.97s)

exit=0

$ pnpm type-check   -> exit 0
$ pnpm lint         -> exit 0
$ node scripts/audit-gate.mjs
audit gate: no fixable high or critical advisory
```

Freeze gate (S28 frozen list):

```
$ git diff --stat design-locked-2026-10-19 -- src/components/home src/components/layout src/components/hero src/components/header src/components/category src/components/storefront src/components/product-card src/app/globals.css src/app/layout.tsx 'src/app/(store)/page.tsx' tailwind.config.ts
(exit 0, 0 lines)
```

**Decisions made without the owner:** the 10.09 gate was replaced, not kept
beside the new one, because two measured gates in one file would contradict
each other (redeploy, Sentry, mock). The 19.08 body stays below a rule as
history. Turning off `MAINTENANCE_MODE` is listed as an owner item, not done
here, because it is the launch itself and real charging is unproven.
