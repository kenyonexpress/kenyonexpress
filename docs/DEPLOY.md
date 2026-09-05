# Deploy

Exactly what Ofir has to click, in order. Everything that could be prepared
without an account action already is; this is the remainder.

**Status: not deployed.** The Vercel project for this repo does not exist. That
is blocker 0 and it gates the preview URL, the DNS cutover, and migration 162.

## What is already done, so you do not redo it

| Prepared | Where |
|---|---|
| Framework, region, install and build commands | `vercel.json` |
| Node and pnpm pinned | `.nvmrc` (22.11.0), `package.json` `engines` |
| Security headers and redirects | `next.config.ts` — **not** `vercel.json`, on purpose (see below) |
| A preflight that refuses to build with a compromised key | `scripts/deploy-preflight.mjs`, wired into `vercel.json`'s `buildCommand` |
| The full variable list | `docs/ENV.md` |

**Why the headers are not in `vercel.json`.** `next.config.ts` already emits the
CSP, HSTS and frame headers, and it carries a note explaining that Vercel merges
the headers of every matching entry — so declaring them in both places emits two
`Content-Security-Policy` headers, which browsers enforce as the intersection.
That is how you get a policy nobody wrote. One source, and it is the Next config.

## Step 1 — rotate the secret key first

Do this **before** creating the project, not after, so the exposed key is never
typed into the platform at all.

The key currently in `.env.local` was exposed during setup. It works, which is
the danger. Full procedure in `docs/RUNBOOK.md` under "Rotate
`SUPABASE_SECRET_KEY`". In short: mint the new key, verify with the boot probe,
then revoke the old one.

The build will refuse to run with the old key — `scripts/deploy-preflight.mjs`
carries its SHA-256 and exits 1 on a match. That is deliberate and it is not a
bug to work around.

## Step 2 — create the project

```bash
npm i -g vercel && vercel login
cd /Users/ofir/kenyonexpress-web/kenyonexpress
rm -rf .vercel && vercel link --yes
```

Choose scope `kenyonexpress-projects` and name the project `kenyonexpress`.

⚠️ **There is an old project called `kenyonexpress-web`.** It is connected to the
*previous* repository (`kenyonexpress/kenyonexpress-web`), all eleven of its
deployments are `ERROR`, and the last one was 29.05. Do not reuse it and do not
delete it; just do not pick it.

```bash
vercel git connect     # to kenyonexpress/kenyonexpress, NOT kenyonexpress-web
```

## Step 3 — enter the environment variables

Every one in the "Required in production" table of `docs/ENV.md`, for both
`production` and `preview`.

```bash
vercel env add SUPABASE_SECRET_KEY production
# ...and so on for each
```

**Do not set `ALLOW_INCOMPLETE_ENV`.** It waives the production required-set and
exists only for `next start` on a laptop. The preflight refuses to build if it
finds it, because on a deploy platform it can only be a mistake.

**Do not set `CARDCOM_SANDBOX=true`.** Real orders would settle against a test
terminal: the shop looks healthy, customers are charged nothing, and the money
arrives nowhere. The preflight refuses this too.

## Step 4 — deploy a preview and look at it

```bash
vercel deploy
```

Then, on the preview URL:

1. The homepage renders and the gate holds — `LOCAL_BASE=<preview url> node scripts/compare.mjs --page=home --width=1440`.
2. Add something to the cart **as a guest**. This is the one that fails silently
   with a bad admin key: it returns HTTP 200, sets a session cookie, and writes
   no row. If the cart is empty on reload, the key is wrong.
3. Reach the checkout address step.
4. `/api/ready` returns its five checks.

## Step 5 — the cron jobs

Only after step 4, because they need the deployment's URL and its `CRON_SECRET`.
Procedure in `docs/RUNBOOK.md`, "Batch B". Twelve jobs, scheduled in the database
by migration 162, not by Vercel cron.

## Step 6 — production and DNS

```bash
vercel deploy --prod
```

**The DNS cutover is yours and this document does not automate it.**
`kenyonexpress.co.il` still points at the old WordPress site. Point it at the
Vercel project only after step 4 passes on production.

## What is still NOT READY after all of this

`docs/LAUNCH-READINESS.md` carries the standing verdict and its blockers. The two
that survive a successful deploy:

- **Four migrations pending approval** (`docs/MIGRATION-REVIEW.md`). One of them,
  172, takes a ₪1 purchasable test row out of the live catalogue.
- **Four funnel events are being discarded** by the database until 169 is
  applied: `purchase`, `begin_checkout`, `voucher_redeemed`, `order_refunded`.
  Deploying does not fix this; the site will report no purchases.
