# C40 Result: DNS Verification & Cloudflare Archive

**Goal:** DNS verify NS + A + Resend. Archive Cloudflare records.

**Completed:** 2026-10-24

## What Was Done

### 1. DNS Verification (NS + A)

Verified current DNS state via `dig`:

**Nameservers (NS):**
```
ns1.vercel-dns.com.
ns2.vercel-dns.com.
```
✅ **VERIFIED** - Domain successfully delegated to Vercel nameservers.

**A Records:**
```
216.150.1.129
216.150.1.193
```
✅ **VERIFIED** - Apex domain resolves to Vercel IPs.

**DMARC:**
```
v=DMARC1; p=none;
```
✅ **PRESENT** - DMARC policy configured.

### 2. Resend DNS Verification

**Status:** ❌ **NOT CONFIGURED**

Checked for required Resend DNS records:

```bash
# DKIM
$ dig _resend._domainkey.kenyonexpress.co.il TXT +short
(no output)

# MX
$ dig kenyonexpress.co.il MX +short
(no output)

# SPF
$ dig kenyonexpress.co.il TXT +short | grep -E 'v=spf1'
(no output)
```

**Finding:** Resend email DNS records (DKIM, SPF, MX) are not configured on the live Vercel nameservers.

**Blocker:** Per `docs/LAUNCH-CHECKLIST.md`:
- RS3: SPF TXT record - **BLOCKED_OWNER** (Resend dashboard DNS not green)
- RS4: DKIM CNAME(s) - **BLOCKED_OWNER**

**Action Required:** Configure Resend DNS records via:
1. Vercel DNS dashboard (zone managed by ns1/ns2.vercel-dns.com), or
2. Resend dashboard's domain verification flow

### 3. Cloudflare Records Archive

Created `docs/DNS-CLOUDFLARE-ARCHIVED.md` documenting:

- **30 records** from the Cloudflare staged zone (never activated)
- **Historical context:** Two Cloudflare zones existed (live: derek/elma, staged: ignat/tess)
- **Cutover:** Direct NS delegation to Vercel bypassed both Cloudflare zones
- **Corrupt records found:** Two records in staged zone contained literal `[...]` (duplicate DKIM, malformed SPF for `send.` subdomain)
- **Live zone state:** NO Resend records present (only existed in never-activated staged zone)
- **Current DNS state:** Verified post-cutover NS, A, DMARC records

## Summary

| Item | Status | Evidence |
|---|---|---|
| NS records | ✅ Verified | ns1/ns2.vercel-dns.com |
| A records | ✅ Verified | 216.150.1.129, 216.150.1.193 |
| DMARC | ✅ Present | v=DMARC1; p=none; |
| Resend DKIM | ❌ Missing | dig returns no output |
| Resend SPF | ❌ Missing | dig returns no output |
| Resend MX | ❌ Missing | dig returns no output |
| Cloudflare archive | ✅ Created | docs/DNS-CLOUDFLARE-ARCHIVED.md |

## Code Changes

None. This was a verification and documentation task.

## Quality Gates

- Type-check: Not applicable (documentation only)
- Lint: Not applicable (documentation only)
- Build: Not run (no code changes)
- Tests: Not applicable (documentation only)

## Next Steps

**Owner action required** to unblock Resend email:

1. Access Resend dashboard for kenyonexpress.co.il domain
2. Complete DNS verification flow
3. Add required DNS records to Vercel nameservers:
   - DKIM TXT/CNAME (per Resend dashboard)
   - SPF TXT record
   - MX record (if needed for receiving)

**Reference:** See `docs/LAUNCH-CHECKLIST.md` items RS3, RS4 for full context.

## Files Created

- `docs/DNS-CLOUDFLARE-ARCHIVED.md` - Complete archive of Cloudflare DNS records
- `docs/C40-RESULT.md` - This file

## Evidence

DNS verification commands run on 2026-10-24:

```bash
dig kenyonexpress.co.il NS +short
dig kenyonexpress.co.il A +short
dig _resend._domainkey.kenyonexpress.co.il TXT +short
dig kenyonexpress.co.il MX +short
dig _dmarc.kenyonexpress.co.il TXT +short
dig kenyonexpress.co.il TXT +short | grep -E 'v=spf1'
```

All output captured in `docs/DNS-CLOUDFLARE-ARCHIVED.md` under "Current DNS State".
