# Sentry Monthly Error Review

Automated monthly review of error patterns in Sentry with categorization, prioritization, and resolution tracking.

## Overview

The Sentry monthly review system:
- Fetches top 20 unresolved errors from the last 30 days
- Closes already-resolved issues
- Categorizes remaining issues by type (payment, performance, security, data, UI, API, other)
- Prioritizes by frequency and severity
- Generates a detailed markdown report
- Maintains historical trend data

## Setup

### 1. Get Sentry Auth Token

1. Go to https://sentry.io/settings/account/api/auth-tokens/
2. Create a new auth token with at least these scopes:
   - `project:read`
   - `issue:read`
   - `issue:write` (if you want to auto-close issues)
3. Copy the token

### 2. Configure Environment Variables

Add to `.env.local` or your deployment environment:

```bash
# Required
SENTRY_AUTH_TOKEN=sntrys_ey...your_token_here

# Optional (defaults shown)
SENTRY_ORG=kenyonexpress
SENTRY_PROJECT=kenyonexpress-web
SENTRY_HOST=https://sentry.io
```

### 3. Verify Setup

```bash
# Check that the token works
pnpm sentry:review --dry-run
```

## Usage

### Manual Review

```bash
# Review last 30 days, limit to 20 issues
pnpm sentry:review

# Dry run (see what would happen, don't modify)
pnpm sentry:review --dry-run

# Custom parameters
pnpm sentry:review --days=60 --limit=50
```

### Automated Monthly

Schedule via cron or CI/CD:

```bash
# Add to crontab (runs on 1st of each month at 09:00 UTC)
0 9 1 * * cd /Users/ofir/kenyonexpress-web/kenyonexpress && pnpm sentry:review
```

Or integrate into your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Sentry Monthly Review
  if: github.event_name == 'schedule'
  run: pnpm sentry:review
  env:
    SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
```

## Output

### Report File: `docs/SENTRY-MONTHLY-REVIEW.md`

Generated report includes:

```markdown
# Sentry Monthly Review — October 2026

## Summary
- Total Issues: 42
- Resolved/Closed: 3
- Remaining: 39

## Issues by Category

### Payment (5)
- KE-PAYMENT-001: Payment webhook signing failed (10 events)
- ...

### Performance (8)
- KE-PERF-001: API timeout on checkout (25 events)
- ...

### Recommendations

### Immediate Action (High Priority)
- [ ] KE-PAYMENT-001: Fix payment webhook
- ...

### This Week (Medium Priority)
- [ ] KE-PERF-001: Optimize checkout latency
- ...

## Action Items
- [ ] Review and assign high-priority issues
- [ ] Close duplicate issues
- [ ] Update issue severity where appropriate
- [ ] Create GitHub issues for critical problems
- [ ] Schedule fix for next sprint
```

### History File: `docs/SENTRY-REVIEW-HISTORY.json`

Tracks monthly trends:

```json
{
  "reviews": [
    {
      "date": "2026-10-01T09:00:00Z",
      "totalIssues": 42,
      "closedIssues": 3,
      "topIssues": [
        {
          "shortID": "KE-PAYMENT-001",
          "title": "Payment webhook signing failed",
          "events": 10
        }
      ]
    }
  ]
}
```

## Categories

Issues are automatically categorized by type:

| Category | Signals | Examples |
|----------|---------|----------|
| **Payment** | "payment", "charge", "billing" | Payment gateway errors, webhook failures |
| **Performance** | "timeout", "latency", "slow" | High latency routes, slow queries |
| **Security** | "unauthorized", "forbidden", "breach" | Authentication/authorization failures |
| **Data** | "sql", "database", "query" | Database errors, migration issues |
| **UI** | "render", "component", "ui" | React rendering errors, state issues |
| **API** | "api", "endpoint", "route" | Route handler errors, API validation |
| **Other** | Uncategorized | Edge cases, unknown errors |

## Priority Model

**High Priority (Immediate Action):**
1. Payment errors (money path)
2. Security issues (unauthorized access)
3. Data issues (SQL, database)

**Medium Priority (This Week):**
4. API errors (product features)
5. Performance issues (user experience)

**Low Priority (Backlog):**
6. UI issues (cosmetic)
7. Other (rare/low impact)

## Best Practices

### 1. Review Regularly

- Set calendar reminder for 1st of each month
- Review both report and recommendations
- Mark action items in your issue tracker

### 2. Link to GitHub

For critical issues, create GitHub issues:

```markdown
**Issue:** KE-PAYMENT-001
**Sentry:** https://sentry.io/organizations/kenyonexpress/issues/123456/
**GitHub:** #456
```

### 3. Assign and Track

In Sentry, assign issues to team members:
- Click issue → Assign to team member
- Add labels for sprint/epic
- Update issue status as you resolve

### 4. Close Resolved Issues

After deploying a fix:

```bash
# Manually close in Sentry UI
# OR update via script (next month's review will catch it)
```

### 5. Track Trends

Use history file to detect patterns:

```bash
# Historical summary
cat docs/SENTRY-REVIEW-HISTORY.json | jq '.reviews[] | {date, totalIssues}'

# Output:
# {
#   "date": "2026-09-01T09:00:00Z",
#   "totalIssues": 45
# }
# {
#   "date": "2026-10-01T09:00:00Z",
#   "totalIssues": 42
# }
```

## Troubleshooting

### "SENTRY_AUTH_TOKEN not set"

**Fix:** Add token to environment variables:
```bash
export SENTRY_AUTH_TOKEN=sntrys_ey...
pnpm sentry:review
```

### "Invalid Sentry auth token"

**Fix:** Verify token:
1. Go to https://sentry.io/settings/account/api/auth-tokens/
2. Check token is still valid (not expired)
3. Confirm scopes include `project:read`, `issue:read`
4. Regenerate if needed

### "Project not found"

**Fix:** Verify organization and project names:
```bash
# Check values
echo "Org: $SENTRY_ORG"
echo "Project: $SENTRY_PROJECT"

# Override if needed
SENTRY_ORG=correct-org SENTRY_PROJECT=correct-project pnpm sentry:review
```

### No issues returned

**Possible causes:**
- No errors in the last 30 days ✅ (good!)
- All issues already resolved
- Wrong time filter

**Fix:** Check Sentry dashboard directly or adjust days:
```bash
pnpm sentry:review --days=60
```

## Integration with CI/CD

### GitHub Actions

```yaml
name: Sentry Monthly Review
on:
  schedule:
    - cron: '0 9 1 * *'  # 1st of month at 09:00 UTC

jobs:
  sentry:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm sentry:review
        env:
          SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
      - run: git add docs/SENTRY-MONTHLY-REVIEW.md docs/SENTRY-REVIEW-HISTORY.json
      - run: git commit -m "chore: monthly Sentry review" || true
      - run: git push origin main
```

### Vercel Cron

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sentry-review",
      "schedule": "0 9 1 * *"
    }
  ]
}
```

Then create `/src/app/api/cron/sentry-review/route.ts`:

```typescript
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    await execAsync('node scripts/sentry-monthly-review.mjs', {
      env: {
        ...process.env,
        SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
      },
    })
    return Response.json({ success: true })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
```

## API Reference

### fetch Issues

Fetches top unresolved issues from Sentry API.

**Query:** `is:unresolved age:-{days}d` (configurable)
**Sort:** `-frequency` (highest first)
**Limit:** 100 (Sentry API max)

### Categories

Auto-categorizes issues by title/tags:
- Payment issues
- Performance issues
- Security issues
- Data issues
- UI issues
- API issues
- Other

### Priority Detection

**High Priority:** Payment + Security + Data issues
**Medium Priority:** API + Performance issues
**Low Priority:** UI + Other issues

## Performance Metrics

- API calls: ~1-5 (fetch issues, fetch details per issue)
- Execution time: 10-30 seconds (depends on issue count)
- Report size: 5-50 KB (depends on issue count)

## History

The script maintains a rolling 12-month history in `docs/SENTRY-REVIEW-HISTORY.json`:

```json
{
  "reviews": [
    {
      "date": "2026-10-01T09:00:00Z",
      "totalIssues": 42,
      "closedIssues": 3,
      "topIssues": [...]
    }
  ]
}
```

Use this to detect trends:
- Increasing error count → system degradation
- Decreasing count → stability improving
- Category shifts → new issues emerging

## Next Steps

1. ✅ Set `SENTRY_AUTH_TOKEN` in environment
2. ✅ Run `pnpm sentry:review --dry-run` to test
3. ✅ Review generated `docs/SENTRY-MONTHLY-REVIEW.md`
4. ✅ Assign issues to team members in Sentry
5. ✅ Create GitHub issues for high-priority items
6. ✅ Schedule automated monthly runs (cron/CI)

## Support

- **Sentry API Docs:** https://docs.sentry.io/api/
- **Token Help:** https://sentry.io/settings/account/api/auth-tokens/
- **Slack Integration:** [Configure Sentry alerts in Slack](https://docs.sentry.io/product/integrations/slack/)
