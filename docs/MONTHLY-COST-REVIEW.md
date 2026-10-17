# Monthly Cost Review — 2026-10-17

## Current Month (2026-10) MRR Summary

| Service | Cost | Notes |
|---------|------|-------|
| Vercel (Hosting) | $33.00 | |
| Supabase (Pro) | $25.00 | |
| R2 (Storage) | $0.00 | |
| Meilisearch | $0.00 | |
| Resend (Email API) | $1.00 | |
| Twilio (SMS) | $5.63 | |

**Total MRR:** $64.63

## Service Breakdown

### Vercel
- **Base (Pro):** $20.00
- **Web Analytics:** $13.00
- **Total:** $33.00

### Supabase
- **Plan:** Pro with branching enabled
- **Base cost:** $25.00
- **PITR Status:** DISABLED (would add $115.00/mo if enabled)
- **Total:** $25.00

### Cloudflare R2
- **Status:** Using free tier (first 10GB included)
- **Overage rate:** $0.01/GB
- **Total:** $0.00

### Meilisearch
- **Status:** Self-hosted or free tier
- **Total:** $0.00

### Resend (Email API)
- **Rate:** $0.00/email
- **Estimated volume:** 10,000 emails/month
- **Total:** $1.00

### Twilio (SMS)
- **SMS rate (in/out):** $0.01/SMS
- **Phone number:** $1.00/month
- **Estimated volume:** 500 SMS/month
- **Total:** $5.63

## Month-over-Month Analysis

| Metric | Previous | Current | Change |
|--------|----------|---------|--------|
| **Total MRR** | $64.63 | $64.63 | ➡️ No change
| | | | |

## Recommendations & Notes

1. **Supabase PITR:** Consider enabling if disaster recovery is critical (~$115/mo)
2. **R2 Storage:** Monitor overage costs as product catalog grows
3. **Twilio/Resend:** Estimated volumes; collect actual usage metrics from APIs
4. **Vercel:** Pro plan sufficient for current traffic; evaluate for scale-ups
5. **Cost Monitoring:** Run this review monthly on the 18th to track trends

## Next Steps

- [ ] Verify actual API usage from Vercel, Resend, Twilio dashboards
- [ ] Confirm R2 storage usage and overage charges
- [ ] Monitor Supabase usage metrics (queries, storage growth)
- [ ] Review Meilisearch plan if actively used
- [ ] Schedule next review for 2026-11-17
