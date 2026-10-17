# Customer Support Inbox Classification Bot - Deployment Guide

## Status
✅ **Code Complete** — Classification bot ready for production deployment  
❌ **Deployment Blocked** — Requires migration application and cron scheduling

## Prerequisites
- Supabase project access (management API token or CLI auth)
- Vercel dashboard access (for cron scheduling)

## Step 1: Apply Migration 274

### Option A: Supabase CLI (Recommended)
```bash
cd /Users/ofir/kenyonexpress-web/kenyonexpress
supabase migration up --linked
```

This applies all pending migrations including 274_support_inbox_classification.sql, which creates:
- support_messages table (with RLS)
- support_auto_responses table (templated responses)
- support_classification_logs table (audit trail)
- Dashboard views (v_support_pending, v_support_metrics)

### Option B: Management API
```bash
# Use Supabase management API to apply migration
curl -X POST "https://api.supabase.co/v1/projects/{project-id}/database/migrations/execute" \
  -H "Authorization: Bearer {SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @migrations/pending/274_support_inbox_classification.sql
```

## Step 2: Schedule Cron Endpoint

### Vercel Dashboard
1. Go to project settings → Cron Jobs
2. Create new cron job:
   - **Endpoint**: `/api/cron/support-classification`
   - **Schedule**: `*/5 * * * *` (every 5 minutes)
   - **Secret**: Set `CRON_SECRET` in environment variables
3. Save and verify first run in logs

### GitHub Actions (Alternative)
Create `.github/workflows/support-classification.yml`:
```yaml
name: Support Classification
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes

jobs:
  classify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: |
          curl -X POST https://${{ secrets.VERCEL_URL }}/api/cron/support-classification \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

## Step 3: Verify Operation

1. **Test message insertion**:
   ```bash
   curl -X POST https://app.example.com/api/contact \
     -d "name=Test&email=test@example.com&message=My order status?"
   ```

2. **Check database**:
   ```sql
   SELECT id, status, category, is_complex, created_at 
   FROM support_messages 
   ORDER BY created_at DESC LIMIT 5;
   ```

3. **Monitor metrics**:
   ```sql
   SELECT * FROM v_support_metrics;
   ```

## Architecture

**Message Flow**:
1. Customer submits contact form → stored in support_messages
2. Cron runs every 5 minutes → fetches new messages
3. Classification service → assigns category + complexity_score
4. Router decision:
   - Simple (score < 70) → auto-respond with template
   - Complex (score ≥ 70) → forward to owner via WhatsApp + email
5. Status updated → auto_responded or owner_notified

**Categories** (auto-detected):
- order_status: "what's my status?" / "סטטוס הזמנה"
- refund: "return" / "החזר כסף"
- delivery: "shipping" / "משלוח"
- product_quality: "defect" / "פגום"
- technical: "error 404" / "לא עובד"
- billing: "charge" / "חיוב"
- other: unclassified

**Complexity Scoring** (0-100):
- +25 urgent keywords (דחוף, immediate)
- +20 anger indicators (כעס, angry)
- +30 legal/dispute signals (עורך דין, lawsuit)
- +15 vague requests (quality varies)
- +20 message length (>100 words)

## Monitoring

**Dashboard queries**:
```sql
-- Pending messages (not yet resolved)
SELECT * FROM v_support_pending;

-- Daily metrics
SELECT now()::date, * FROM v_support_metrics;

-- Classification accuracy
SELECT category, COUNT(*), 
  AVG(complexity_score) as avg_complexity,
  SUM(CASE WHEN is_complex THEN 1 ELSE 0 END) as complex_count
FROM support_messages
WHERE created_at > now() - INTERVAL '24 hours'
GROUP BY category
ORDER BY COUNT(*) DESC;
```

## Rollback

If issues occur:
1. Disable cron job in Vercel
2. No data loss — support_messages table persists
3. Reapply migration 274 to rebuild views if needed

## Known Limitations

- No ML/AI classification (heuristic-only)
- WhatsApp routing uses existing Twilio integration
- Auto-responses are templated Hebrew only
- No sentiment analysis (complexity score is keyword-based)

## Support

Contact: See /api/health for system status
Logs: Vercel dashboard → Function logs → /api/cron/support-classification
