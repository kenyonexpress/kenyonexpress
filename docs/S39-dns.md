# S39: email DNS, SPF, DKIM, DMARC (06.11.2026)

Queue item S39: check with `vercel dns ls` that SPF, DKIM (Resend) and DMARC `p=quarantine` with `rua=mailto:support@kenyonexpress.co.il` exist, add what is missing, run `resend domains verify`.

**RESULT: DONE.** SPF and DKIM were already there. DMARC was `p=none` with no `rua` and was replaced. Resend accepts mail from the domain. `resend domains verify` itself was not run: the only working key is send-only.

## State of the three records

Zone: `kenyonexpress.co.il` on Vercel DNS (`ns1.vercel-dns.com`, `ns2.vercel-dns.com`), team `kenyonexpress-projects`.

| record | name | value | before | after |
|---|---|---|---|---|
| SPF | `send` TXT | `v=spf1 include:amazonses.com ~all` | present, 39 days old | unchanged |
| bounce MX | `send` MX | `10 feedback-smtp.us-east-1.amazonses.com.` | present, 39 days old | unchanged |
| DKIM | `resend._domainkey` TXT | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCSLiJV...` | present, 39 days old | unchanged |
| DMARC | `_dmarc` TXT | `v=DMARC1; p=quarantine; rua=mailto:support@kenyonexpress.co.il` | `v=DMARC1; p=none;` | **replaced** |

The SPF record sits on `send`, not on the apex. That is where Resend wants it: the envelope sender of Resend mail is `send.kenyonexpress.co.il`, and it aligns with the `From` domain under DMARC's default relaxed mode. The apex has no SPF record and needs none for Resend.

## What changed

DNS, on production:

```
vercel dns rm rec_b5b7bf164081d50cba2161ec --yes
> Success! Record rec_b5b7bf164081d50cba2161ec removed

vercel dns add kenyonexpress.co.il _dmarc TXT 'v=DMARC1; p=quarantine; rua=mailto:support@kenyonexpress.co.il'
> Success! DNS record for domain kenyonexpress.co.il (rec_be6d63e09bb09c1e95950a2a) created
```

The old record was removed first because two DMARC records on one name make receivers ignore both. To go back: remove `rec_be6d63e09bb09c1e95950a2a` and add `v=DMARC1; p=none;`.

Repository: `docs/S39-dns.md`, `docs/INDEX.md`, `README.md` (document count), `STATE.md`. No code, no migration, no frozen path.

## Verification

`vercel dns ls kenyonexpress.co.il` after the change:

```
rec_be6d63e09bb09c1e95950a2a    _dmarc               TXT    v=DMARC1; p=quarantine; rua=mailto:support@kenyonexpress.co.il
rec_657aaf33e0c6dc2382443b50    send                 TXT    v=spf1 include:amazonses.com ~all
rec_31117d3378bd9f55eba2421d    send                 MX     10 feedback-smtp.us-east-1.amazonses.com.
rec_4a2906907a274e5aee37bcaa    resend._domainkey    TXT    p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCSLiJV...
```

Public resolvers, over DNS-over-HTTPS (Google and Cloudflare gave the same DMARC answer, TTL 60):

```
send.kenyonexpress.co.il.              TXT  v=spf1 include:amazonses.com ~all
send.kenyonexpress.co.il.              MX   10 feedback-smtp.us-east-1.amazonses.com.
resend._domainkey.kenyonexpress.co.il. TXT  p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCSLiJV...
_dmarc.kenyonexpress.co.il.            TXT  v=DMARC1; p=quarantine; rua=mailto:support@kenyonexpress.co.il
```

Resend:

| check | answer |
|---|---|
| `GET /domains` with the key in `.env.local.bak` | 401, `This API key is restricted to only send emails` |
| `GET /domains` with the keys in `.env.production`, `.env.vercel`, `.env.local.pre-probe` | 400, `API key is invalid` (the first two hold a redacted placeholder) |
| `POST /emails` from `KenyonExpress <noreply@kenyonexpress.co.il>` to `delivered@resend.dev` | **200**, id `01a1ae30-7e46-74d4-95b0-ff96a6f659c5` |

Resend refuses a send from a domain it has not verified, so the 200 shows the domain is verified there. `delivered@resend.dev` is Resend's own test sink; nothing reached a real mailbox. `noreply@kenyonexpress.co.il` is the default sender in `src/lib/email/resend.ts` and `src/lib/growth/resend.ts`.

## Not measured

- **`resend domains verify` was not run** and the domain's status was not read from Resend. Both need a full-access key, and none is on this machine. The send-only restriction was left as is.
- **DMARC on a real message.** No message was opened at a receiver to read `dkim=pass`, `spf=pass`, `dmarc=pass` in its headers. The sink address returns no headers.
- The DKIM public key was not compared with the one Resend's dashboard shows. It is the same value as in `docs/DNS-SNAPSHOT-PRE-CUTOVER.md`.

## Found, not fixed

- **The apex has no MX record, so `support@kenyonexpress.co.il` cannot receive mail.** The pre-cutover snapshot (02.09.2026, Cloudflare) had `MX 10 mailgw2.spd.co.il.` on the apex; the Vercel zone has none. That means the DMARC reports this item asked for have nowhere to land, and neither does customer mail to `support@`, the address that appears 15 times in `src`. Not restored here: it is inbound mail routing, outside this item, and whether the old gateway still accepts the domain was not checked. To restore: `vercel dns add kenyonexpress.co.il @ MX mailgw2.spd.co.il 10`, after confirming with the mail provider.
- `p=quarantine` now applies to every sender that uses `@kenyonexpress.co.il` in `From`. Anything that mails as the domain without going through Resend (a mailbox provider, Supabase's built-in auth mail, a form service) will land in spam until it signs with an aligned DKIM key or gets its own SPF. No such sender was found in DNS; none was searched for outside it.

## For Ofir

1. Restore the apex MX, or point `rua` at a mailbox that exists.
2. In the Resend dashboard, confirm `kenyonexpress.co.il` shows Verified. For the queue to do this next time: a full-access Resend key in `~/ke-goals/secrets`.
