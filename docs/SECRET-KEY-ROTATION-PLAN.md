# Supabase Secret Key Rotation Plan

**Status: REQUIRED BEFORE THE FIRST REAL CUSTOMER. Not done.**

## 1. What is exposed

| Item | Value |
|---|---|
| Variable | `SUPABASE_SECRET_KEY` (new-format `sb_secret_...` key) |
| Fingerprint | prefix `sb_secret_GdpC`, SHA-256 `f4c4f33c4baaa0edf8a14a77734f522c7fee503309da9c359a95fb70b81c1230` (`scripts/compromised-keys.mjs`) |
| Project | `ixvwfbuvfxxsjiywhbbb` |
| Exposure | handled outside a secret store during setup on 2026-09-04 (terminal history / `.env.local`) |
| Blast radius | a secret key bypasses every RLS policy: every table, every user row, every order, every voucher, and it can mint a session for any user. There is no partial exposure. |
| Still valid? | yes. It authenticates. That is the problem: nothing about it looks wrong. |

**Do not paste the key into this document, a commit, a chat, or a ticket.** The
hash above is how it is identified.

## 2. What already refuses it

| Layer | Behaviour |
|---|---|
| `src/lib/env.ts` at boot | throws with the Hebrew message from `compromisedKeyMessage` if any of `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `VOUCHER_QR_SECRET`, `CARDCOM_API_PASSWORD`, `CARDCOM_WEBHOOK_SECRET`, `RESEND_API_KEY` matches a listed digest |
| `scripts/deploy-preflight.mjs` before build | exit 1 on the same match, plus missing required vars, plus `CARDCOM_SANDBOX=true`, plus `ALLOW_INCOMPLETE_ENV=true` |
| `src/lib/supabase/admin-key.ts` | shape check only (demo key / wrong role); it does **not** detect this key, by design (opaque `sb_secret_` keys are not decodable) |
| `src/lib/env-probe.ts` at boot | liveness probe `env.probe_ok` / `env.probe_failed`; proves a key works, not that it is the right one |

So a production deploy carrying the exposed key is refused at two gates. Local
development with it still works, deliberately.

## 3. Rotation steps

Precondition: the project is on new-format keys (`sb_secret_...` / `sb_publishable_...`), which it is. Two secret keys can be live at once; that overlap is what makes this zero-downtime. **Never rotate the legacy JWT secret to do this**: that invalidates the anon key, the service_role key and every user session at once.

| Step | Action | Where | Verify | Owner |
|---|---|---|---|---|
| 1 | Create a NEW secret key. Name it with the date (e.g. `secret-2026-09-xx`). Do not revoke the old one yet. | Supabase Dashboard > project `ixvwfbuvfxxsjiywhbbb` > Project Settings > API Keys > Create new secret key | the new key is listed next to the old one | Ofir |
| 2 | Put the new key where the app reads it. Local: `SUPABASE_SECRET_KEY=` in `.env.local` (gitignored). Production: Vercel > Project > Settings > Environment Variables, `SUPABASE_SECRET_KEY` for `production` and `preview` (`vercel env add SUPABASE_SECRET_KEY production`). **Blocked today: the Vercel project does not exist (STATE.md blocker 0).** Also: GitHub Actions secrets used by `ci.yml` / `db-backup.yml` if they carry the service key; `SUPABASE_DB_URL` is a separate credential and is not part of this rotation. | `.env.local`, Vercel env, GitHub secrets | `grep -c` nothing; the key never appears in the repo | Ofir |
| 3 | Redeploy (or restart locally) and read the boot log for `"event":"env.probe_ok"`. If `env.probe_failed` names `SUPABASE_SECRET_KEY`, the new key is wrong; keep the old one live until it passes. | `PORT=3311 pnpm start` locally; Vercel deploy log | `env.probe_ok` | Ofir / autopilot |
| 4 | Exercise the paths that fail silently with a bad admin key: guest add-to-cart writes a `carts` row; checkout address step; wallet balance page. (A bad admin key returns HTTP 200, sets a cookie and writes nothing, which is how the first bad key survived unnoticed.) | the deployed site | a `carts` row appears for the guest session | Ofir / autopilot |
| 5 | Revoke the old key. | Supabase Dashboard > API Keys > the dated old key > Revoke | a request with the old key answers 401 | Ofir |
| 6 | The OLD key's SHA-256 is already in `COMPROMISED_KEYS` (`scripts/compromised-keys.mjs`); leave it there. Do not add the new key anywhere in the repo, not even as a prefix. Record the rotation date in `STATE.md`. | repo, `STATE.md` | `pnpm test` green (`src/lib/compromised-keys.test.ts`) | autopilot |
| 7 | Purge the exposure: clear shell history entries that contain `sb_secret_` (`history -d` / edit `~/.zsh_history`), and confirm no chat export, screenshot or paste bin holds it. | Ofir's machine | `grep -r sb_secret_ ~/.zsh_history` empty | Ofir |

Curl to verify a key from the shell (replace `$KEY`; do not echo it):

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/products?select=id&limit=1"
```

New key: 200. Old key after step 5: 401.

## 4. Timeline

| When | What |
|---|---|
| Now | steps 1, 3 (local), 6, 7 can be done today without Vercel: mint the new key, prove it locally, purge history. The old key stays live only because production does not exist yet. |
| The day the Vercel project is created (blocker 0) | step 2 for `production` + `preview`, step 3 on the deploy, step 4 |
| Same day, after step 4 passes | step 5 (revoke). **Hard rule: the exposed key must be revoked before DNS points real customers at the site.** |
| Every 90 days after | repeat 1 to 5 on schedule; the dated key names make the sequence auditable |

## 5. What NOT to do

- Do not rotate the JWT secret (see precondition).
- Do not commit either key anywhere; `pnpm gate:hardcoded` exists because it happened once.
- Do not revoke before step 3 passes; revoking first takes every admin-client path down with no error on the page.
- Do not remove the digest from `compromised-keys.mjs` after revocation: a revoked key that comes back from an old backup or an old `.env` should still be refused at boot.
