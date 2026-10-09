# DNS snapshot, before the cutover

Taken 2026-09-02, from the Cloudflare API (`Zone:Read`) and from public
resolvers. **Read-only. Nothing was changed.**

## The finding that changes the plan

There are **two** Cloudflare zones for this domain, in two different accounts,
and the one we hold a token for is not the one serving the internet.

| | Live | Staged |
| --- | --- | --- |
| Nameservers | `derek` / `elma.ns.cloudflare.com` | `ignat` / `tess.ns.cloudflare.com` |
| Account | not this one | `13a3f166fadbde6b432dff3b9668479a` (Kenyonexpress@gmail.com) |
| Zone id | unknown | `8e8f82c441280a764a69b36fee104272` |
| Status | serving | `initializing`, `activated_on: null` |
| Created | — | 2026-08-10 |

The registrar still delegates to `derek`/`elma`, which Cloudflare records as this
zone's `original_name_servers`. So the staged zone has never gone live.

**Editing DNS in the staged zone changes nothing on the internet.** The API will
return `success: true` for every write and the public answer will not move. That
is the worst failure shape available here, because it looks exactly like success.

The cutover is therefore **not** "edit two A records". It is either:

1. change the registrar's nameservers to `ignat`/`tess`, which activates all 30
   staged records at once, including mail; or
2. get access to the account that owns `derek`/`elma` and edit there.

Option 1 moves the whole zone in one step. Everything below has to be right
before it is taken.

## Two staged records are corrupt

Both contain a literal `[...]`, which is what a truncated dashboard display
looks like when it is pasted back in as a value.

```
TXT resend._domainkey   "p=MIGfMA0CGsq[...]nUa5ZwIDAQAB"                      (32 chars)  ttl 1
TXT send               "v=spf1 include[...].nses.com include:amazonses.com ~all" (57)     ttl 3600
```

The DKIM record is a **duplicate**: there is a second, complete
`resend._domainkey` TXT of 220 characters with a real RSA key. Publishing both
means a validator gets two answers for one selector, and `include[...].nses.com`
is not a resolvable domain, so the `send` SPF would evaluate to `permerror`.

**Neither is live today** — the serving zone has no Resend records at all — so
nothing is broken right now. They break on the day the nameservers move, which
is the day transactional email starts mattering.

Delete `8cefa016c4633a12b03c6374756c1125` (the 32-char DKIM) and repair
`e9bbf1ed37f8682fef56a26d016b7774` (the `send` SPF) from the Resend dashboard
before activating.

## The staged zone, all 30 records

Proxied records are marked `True`; those answer as Cloudflare anycast, not as
the origin.

```
TYPE    NAME                                   CONTENT                                   PROX
A       kenyonexpress.co.il                    172.67.148.28                             True
A       kenyonexpress.co.il                    104.21.55.125                             True
A       www                                    172.67.148.28                             True
A       www                                    104.21.55.125                             True
A       ftp                                    172.67.148.28 / 104.21.55.125             True
A       mail                                   104.21.55.125 / 172.67.148.28             True
A       pop                                    172.67.148.28 / 104.21.55.125             True
A       smtp                                   104.21.55.125 / 172.67.148.28             True
AAAA    kenyonexpress.co.il / www / mail / ftp 2606:4700:3035::6815:377d                 True
                                               2606:4700:3036::ac43:941c                 True
CNAME   tracking                               api.elasticemail.com                      True
MX      kenyonexpress.co.il                    mailgw2.spd.co.il                         False
MX      send                                   feedback-smtp.us-east-1.amazonses.com     False
TXT     kenyonexpress.co.il                    v=spf1 a mx ip4:192.116.71.122 include:relay.mailchannels.net include:_spf.elasticemail.com ~all
TXT     kenyonexpress.co.il                    google-site-verification=7_-kZsP6HnHTkq5qR--mZyLYx-EE3WSz6C1sxnbr0-I
TXT     _dmarc                                 v=DMARC1; p=none;
TXT     resend._domainkey                      (220 chars, valid)
TXT     resend._domainkey                      (32 chars, CORRUPT - delete)
TXT     send                                   (57 chars, CORRUPT - repair)
TXT     x._domainkey                           (415 chars, valid, split into two quoted strings)
```

## What the live zone actually serves

```
NS      derek.ns.cloudflare.com. elma.ns.cloudflare.com.
A       kenyonexpress.co.il      172.67.148.28  104.21.55.125
A       www                      104.21.55.125  172.67.148.28
A       mail                     104.21.55.125  172.67.148.28
MX      10 mailgw2.spd.co.il.
TXT     v=spf1 a mx ip4:192.116.71.122 include:relay.mailchannels.net include:_spf.elasticemail.com ~all
TXT     google-site-verification=7_-kZsP6HnHTkq5qR--mZyLYx-EE3WSz6C1sxnbr0-I
_dmarc  v=DMARC1; p=none;
```

`resend._domainkey`, `send.` and `x._domainkey` do **not** resolve publicly.
Checked directly: `resend._domainkey`, `default._domainkey` and `s1._domainkey`
all return nothing.

## Correction to an earlier note in this repository

An earlier version of this file, and the commit that added it, said flatly that
**"there are no Resend records on this domain"**. That was true of the live zone
and wrong about the staged one, which carries a full Resend setup. The
distinction is the whole point of this document, and the earlier phrasing would
have led someone to conclude Resend was never configured.
