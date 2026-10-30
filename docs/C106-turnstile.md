# C106 Turnstile

Status: BLOCKED cloudflare-token-lacks-turnstile-permission

## Code (already in place, see C88-TURNSTILE.md)
Login, signup, forgot-password, supplier/apply and contact verify Turnstile server-side
(`src/lib/security/turnstile.ts`) and render `src/components/shared/TurnstileWidget.tsx`.
Env names read by the code: `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
No code change was needed. Turnstile stays off until both keys are set.

## Blocker
`secrets/cf.env` exists and `CF_API_TOKEN` verifies as active, but
`POST /accounts/{id}/challenges/widgets` returns 10000 Authentication error:
the token has no Account > Turnstile > Edit permission, so no site key/secret could be created.
Nothing was added to Vercel (no key values exist).

## To finish
1. Add Turnstile:Edit to the token (or create a widget in the dashboard for kenyonexpress.co.il, www, localhost).
2. Put the pair in `secrets/turnstile.env` as `CF_TURNSTILE_SITE_KEY` / `CF_TURNSTILE_SECRET`.
3. `vercel env add` each with `--scope kenyonexpress-projects`, under both the task names and the code names
   (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`), then redeploy.
