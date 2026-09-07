# Runbook: secret rotation

## Exposed service role (launch blocker)

1. Keys in `scripts/compromised-keys.mjs` by SHA-256. Deploy-preflight refuses them.
2. Supabase dashboard: generate new secret. Put in Vercel **server** env (`SUPABASE_SECRET_KEY` / service role name as in `.env.example`). Never `NEXT_PUBLIC_`.
3. Redeploy. Confirm old hash cannot boot.
4. Mobile app: must not contain the new key either.

## Cardcom webhook `s`

Two secrets CURRENT + RETIRING. Constant-time both. Generate `openssl rand -hex 32`. Update webhook URL at Cardcom after Vercel has both. Then drop retiring.

## QR signing secret

Current + previous so already-issued passes still verify (`vouchers/qr`).

## `CRON_SECRET`

Update GitHub Actions and Vercel together or crons 401.

## ntfy topic

Set unguessable `NTFY_TOPIC`. Stop using `kenyon-ofir-limit` in production.

## R2 / Resend / Sentry

Rotate in vendor dashboards; rebuild if `NEXT_PUBLIC_` involved (Sentry DSN public is expected).

---

## Second pass

Read with `waves/WAVE-INDEX.md` and `business/LAUNCH-BLOCKERS.md`. Tree on this branch wins over older briefs. Do not apply SQL from this worktree.
