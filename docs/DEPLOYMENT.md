# Deployment

Verified against the real Vercel project on 2026-09-02, through the CLI, not
assumed from docs.

## The project, as it actually is

| | |
| --- | --- |
| Project | `kenyonexpress-projects/kenyonexpress` (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`) |
| Production URL | https://kenyonexpress.vercel.app |
| Git connection | **NONE.** Both production deployments were CLI deploys. |
| Production branch | Does not exist as a setting until Git is connected. |
| Node | 24.x, Next.js preset, root `.` |

**Pushing to main deploys nothing today.** To make merges deploy: Dashboard ->
kenyonexpress -> Settings -> Git -> Connect `kenyonexpress/kenyonexpress`, then
set **Production Branch = `main`**. Until Ofir does that, production only moves
when someone runs `vercel deploy --prod` by hand.

## Environment: what production holds now

From `vercel env pull --environment=production`, 2026-09-02:

```
CHECKOUT_ENABLED          "true"
CARDCOM_USE_MOCK          "true"      <- the blocker
CARDCOM_WEBHOOK_SECRET    set
CRON_SECRET               set
NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY / SUPABASE_SECRET_KEY   set
NEXT_PUBLIC_APP_URL, VOUCHER_QR_SECRET                       set
```

Checkout is enabled and wired to the MOCK provider, which answers success to
every charge. A real customer would receive goods and never be charged. See
docs/LAUNCH-READINESS.md, "BLOCKER".

## Going live on real money: the exact variables, in order

The four Cardcom production values, from the Cardcom back office
(https://secure.cardcom.solutions, or by phone 03-9436100):

| Variable | Where in the Cardcom panel |
| --- | --- |
| `CARDCOM_TERMINAL_NUMBER` | מספר מסוף — ההגדרות הראשיות של המסוף |
| `CARDCOM_API_NAME` | שם משתמש API — הגדרות ממשקים / API |
| `CARDCOM_API_PASSWORD` | סיסמת API — נוצרת באותו מסך; אם אין, בקשו מהתמיכה |
| `CARDCOM_WEBHOOK_SECRET` | already set; keep it — it must match the IndicatorUrl secret configured on the terminal |

The order matters, and it is:

```
1. vercel env add CARDCOM_TERMINAL_NUMBER production
2. vercel env add CARDCOM_API_NAME        production
3. vercel env add CARDCOM_API_PASSWORD    production
4. vercel env rm  CARDCOM_USE_MOCK        production      # ONLY after 1-3:
                                                          # the non-mock branch
                                                          # throws on a missing
                                                          # terminal variable
5. keep CHECKOUT_ENABLED=true (it already is)
6. vercel redeploy <latest-prod-url>                      # env changes need a
                                                          # new deployment
7. place ONE real low-value order and find it in the Cardcom dashboard
8. refund it from the admin, and find the refund there too
```

Step 4 before 1-3 turns checkout from silently-fake into hard-failing:
`loadCardcomEnv` calls `required('CARDCOM_TERMINAL_NUMBER')` on the non-mock
path.

## What deploys where

| Action | Effect today | Effect after Git connect |
| --- | --- | --- |
| push to `main` | nothing | production deploy |
| push to any branch | nothing | preview deploy |
| `vercel deploy --prod` | production | production (discouraged then) |

## Related

- `docs/DNS-CUTOVER-PLAN.md` — the domain is NOT pointed here yet, and the zone
  we hold a token for is not the zone serving the internet.
- `docs/RELEASE-v1.0-MERGE-PLAN.md` — how release/v1.0 enters main.
- `scripts/setup-cron-jobs.mjs` — the ten schedules; production answers 401 to
  all ten today, which is correct (routes deployed, secret set, no scheduler).
