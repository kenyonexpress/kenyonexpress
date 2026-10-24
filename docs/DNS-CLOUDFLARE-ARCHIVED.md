# Cloudflare DNS Records Archive

**Archived:** 2026-10-24  
**Source:** docs/DNS-SNAPSHOT-PRE-CUTOVER.md (taken 2026-09-02)

This document archives the DNS records that existed in the Cloudflare staged zone before the cutover to Vercel nameservers.

## Cutover Status

**COMPLETED.** As of 2026-10-24, verified via `dig`:

```
NS records:  ns1.vercel-dns.com, ns2.vercel-dns.com
A records:   216.150.1.129, 216.150.1.193 (Vercel IPs)
```

The domain has been successfully migrated from Cloudflare to Vercel nameservers.

## Historical Context

There were **two** Cloudflare zones for kenyonexpress.co.il:

| | Live Zone | Staged Zone |
|---|---|---|
| Nameservers | derek/elma.ns.cloudflare.com | ignat/tess.ns.cloudflare.com |
| Account | Unknown | 13a3f166fadbde6b432dff3b9668479a |
| Zone ID | Unknown | 8e8f82c441280a764a69b36fee104272 |
| Status | Was serving until cutover | Never activated |
| Created | — | 2026-08-10 |

The **live zone** (derek/elma) served production traffic. The **staged zone** (ignat/tess) was in "initializing" status and never went live. The cutover bypassed both zones by delegating directly to Vercel nameservers.

## Archived: Cloudflare Staged Zone Records

All 30 records from the staged zone (status: initializing, never activated).

**Note:** "Proxied" means Cloudflare anycast IPs, not origin.

### Apex and WWW (Web Traffic)
```
TYPE    NAME                     CONTENT              PROXIED
A       kenyonexpress.co.il      172.67.148.28        Yes
A       kenyonexpress.co.il      104.21.55.125        Yes
A       www                      172.67.148.28        Yes
A       www                      104.21.55.125        Yes
AAAA    kenyonexpress.co.il      2606:4700:3035::6815:377d   Yes
AAAA    kenyonexpress.co.il      2606:4700:3036::ac43:941c   Yes
AAAA    www                      2606:4700:3035::6815:377d   Yes
AAAA    www                      2606:4700:3036::ac43:941c   Yes
```

### Mail Services (FTP, POP, SMTP)
```
TYPE    NAME     CONTENT              PROXIED
A       ftp      172.67.148.28        Yes
A       ftp      104.21.55.125        Yes
A       mail     104.21.55.125        Yes
A       mail     172.67.148.28        Yes
A       pop      172.67.148.28        Yes
A       pop      104.21.55.125        Yes
A       smtp     104.21.55.125        Yes
A       smtp     172.67.148.28        Yes
AAAA    mail     2606:4700:3035::6815:377d   Yes
AAAA    mail     2606:4700:3036::ac43:941c   Yes
AAAA    ftp      2606:4700:3035::6815:377d   Yes
AAAA    ftp      2606:4700:3036::ac43:941c   Yes
```

### Mail Exchange (MX)
```
TYPE    NAME                     CONTENT                                 PROXIED
MX      kenyonexpress.co.il      10 mailgw2.spd.co.il                    No
MX      send                     10 feedback-smtp.us-east-1.amazonses.com   No
```

### Email Authentication (SPF, DKIM, DMARC)

**Primary Domain SPF:**
```
TXT     kenyonexpress.co.il      "v=spf1 a mx ip4:192.116.71.122 include:relay.mailchannels.net include:_spf.elasticemail.com ~all"
```

**Resend Subdomain SPF (CORRUPT - contained literal `[...]`):**
```
TXT     send                     "v=spf1 include[...].nses.com include:amazonses.com ~all"
                                 ⚠️ CORRUPT: literal [...] should have been actual domain
```

**DKIM Records:**
```
TXT     resend._domainkey        (220 characters, valid RSA public key)
TXT     resend._domainkey        (32 characters, CORRUPT - duplicate with literal [...])
                                 ⚠️ CORRUPT: truncated copy, should be deleted
TXT     x._domainkey             (415 characters, valid, split into two quoted strings)
```

**DMARC:**
```
TXT     _dmarc                   "v=DMARC1; p=none;"
```

### Tracking and Verification
```
TYPE    NAME         CONTENT
CNAME   tracking     api.elasticemail.com
TXT     (apex)       "google-site-verification=7_-kZsP6HnHTkq5qR--mZyLYx-EE3WSz6C1sxnbr0-I"
```

## What Was Serving Live (derek/elma zone)

The actual live zone before cutover:

```
NS      derek.ns.cloudflare.com., elma.ns.cloudflare.com.
A       kenyonexpress.co.il      172.67.148.28, 104.21.55.125
A       www                      104.21.55.125, 172.67.148.28
A       mail                     104.21.55.125, 172.67.148.28
MX      10 mailgw2.spd.co.il.
TXT     (apex)                   "v=spf1 a mx ip4:192.116.71.122 include:relay.mailchannels.net include:_spf.elasticemail.com ~all"
TXT     (apex)                   "google-site-verification=7_-kZsP6HnHTkq5qR--mZyLYx-EE3WSz6C1sxnbr0-I"
TXT     _dmarc                   "v=DMARC1; p=none;"
```

**NO Resend records** in the live zone. The `resend._domainkey`, `send.` MX, and `send.` SPF existed only in the staged zone.

## Issues Found in Staged Zone

Two records contained literal `[...]` from truncated dashboard displays:

1. **Duplicate DKIM** (record ID: `8cefa016c4633a12b03c6374756c1125`):  
   32-character `resend._domainkey` TXT with `[...]`. Should have been deleted. The valid 220-character record was also present.

2. **Corrupt SPF** (record ID: `e9bbf1ed37f8682fef56a26d016b7774`):  
   `send.` TXT with `include[...].nses.com` instead of actual domain. Would evaluate to `permerror`.

These records never went live (staged zone was never activated), so they caused no production issues.

## Current DNS State (Post-Cutover, 2026-10-24)

**Verified via `dig` on 2026-10-24:**

```bash
$ dig kenyonexpress.co.il NS +short
ns1.vercel-dns.com.
ns2.vercel-dns.com.

$ dig kenyonexpress.co.il A +short
216.150.1.129
216.150.1.193

$ dig _dmarc.kenyonexpress.co.il TXT +short
"v=DMARC1; p=none;"
```

**Resend DNS records NOT FOUND:**
```bash
$ dig _resend._domainkey.kenyonexpress.co.il TXT +short
(no output)

$ dig kenyonexpress.co.il MX +short
(no output)

$ dig kenyonexpress.co.il TXT +short | grep -E 'v=spf1'
(no output)
```

## Outstanding: Resend Email Setup

Per `docs/LAUNCH-CHECKLIST.md` (items RS3, RS4):

- **RS3:** SPF TXT record on sending domain - **BLOCKED_OWNER** (Resend dashboard DNS not green)
- **RS4:** DKIM CNAME(s) from Resend dashboard - **BLOCKED_OWNER**

**Action required:** Configure Resend DNS records (DKIM, SPF, MX) via Vercel DNS or Resend dashboard. The old Cloudflare records (both valid and corrupt) are no longer accessible.

## References

- `docs/DNS-SNAPSHOT-PRE-CUTOVER.md` - Original snapshot from 2026-09-02
- `docs/DNS-CUTOVER-PLAN.md` - Planned cutover steps (not executed; direct NS delegation used instead)
- `docs/LAUNCH-CHECKLIST.md` - Outstanding Resend DNS items (RS3, RS4)
