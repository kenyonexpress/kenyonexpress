# S02: Vercel production branch = closeout/v1-final

Date: 2026-11-04 (UTC times below). Project `kenyonexpress`
(`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`, team `team_TUMTPVDP8218QHwedSjmgJWl`).

## Before

```
$ vercel api "/v9/projects/kenyonexpress?teamId=team_TUMTPVDP8218QHwedSjmgJWl" | jq '.link.productionBranch'
"audit/final-audit"
```

## PATCH

The command the queue specified is refused by the API:

```
$ vercel api "/v9/projects/kenyonexpress?teamId=..." -X PATCH --input body.json   # {"link":{"productionBranch":"closeout/v1-final"}}
Error: Invalid request: should NOT have additional property `link`. (400)
```

The dedicated branch endpoint, the same one used in L02 on 05.10, works:

```
$ vercel api "/v9/projects/prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP/branch?teamId=team_TUMTPVDP8218QHwedSjmgJWl" -X PATCH --input body.json   # {"branch":"closeout/v1-final"}
exit=0
    "productionBranch": "closeout/v1-final",
```

## Verify with GET

```
$ vercel api "/v9/projects/kenyonexpress?teamId=team_TUMTPVDP8218QHwedSjmgJWl" | jq '{name, productionBranch: .link.productionBranch, repo: (.link.org+"/"+.link.repo)}'
{
  "name": "kenyonexpress",
  "productionBranch": "closeout/v1-final",
  "repo": "kenyonexpress/kenyonexpress"
}
```

## Preflight env check before pushing

The last three git builds of this branch (previews 337d1a2a4, 2bccede4b,
1cb1950df) are ERROR: `deploy preflight: 5 problem(s)`, Cardcom x4 and
`VOUCHER_QR_SECRET` missing. All five exist with target `production` only,
so a production-target build passes preflight. The preview failures are
expected and were left alone.

```
CARDCOM_API_NAME         production
CARDCOM_TERMINAL_NUMBER  production
CARDCOM_API_PASSWORD     production
VOUCHER_QR_SECRET        production
CARDCOM_WEBHOOK_SECRET   production
```

## Empty commit + push, then the git build

Empty commit `c9a3754b8`, pushed 07:09:43Z. Deployment created 07:09:53Z:

```
07:09:53 dpl_DhJJBn82dFLA3HMtWvEuMXPWFzZY  BUILDING  production  git
READY 07:11:59

$ vercel ls kenyonexpress --scope kenyonexpress-projects
  Age  Deployment                                                          Status   Environment  Duration
  2m   https://kenyonexpress-8vv18vwv8-kenyonexpress-projects.vercel.app   ● Ready  Production   2m

{"id":"dpl_DhJJBn82dFLA3HMtWvEuMXPWFzZY","readyState":"READY","target":"production","source":"git",
 "ref":"closeout/v1-final","sha":"c9a3754b8","aliasAssigned":true,
 "alias":["www.kenyonexpress.co.il","kenyonexpress.vercel.app","kenyonexpress.co.il", ...]}

$ curl -sL -o /dev/null -w '%{http_code} %{url_effective}\n' https://kenyonexpress.co.il/api/health
200 https://www.kenyonexpress.co.il/api/health
```

## Consequence

Every push to `closeout/v1-final` is now a production build and alias
swap. Nobody needs `vercel deploy --prod` uploads any more, and from here on
they are forbidden. Pushes to any other branch are previews.

## Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(empty)
diffstat-exit=0
```

No code changed in this item.
