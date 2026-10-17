# Release Workflow - Complete Example

This document shows a complete release workflow from development to production with all scripts.

## Setup Environment

```bash
# Get GitHub token from https://github.com/settings/tokens
export GITHUB_TOKEN="ghp_YOUR_TOKEN_HERE"

# Get Vercel credentials
export VERCEL_TOKEN="YOUR_VERCEL_TOKEN"
export VERCEL_ORG_ID="YOUR_ORG_ID"
export VERCEL_PROJECT_ID="YOUR_PROJECT_ID"

# Optional: specify test URL (defaults to localhost:3000)
export SMOKE_TEST_URL="https://staging.example.com"
```

## Complete Release Workflow

### 1. View Changelog for Next Release

```bash
# See what will be released (patch version bump)
pnpm release:changelog patch

# Output:
# ## [1.2.4](https://github.com/kenyonexpress/web/releases/tag/1.2.4) (2026-10-17)
# 
# ### ✨ Features
# - add discount code support ([abc1234](https://github.com/kenyonexpress/web/commit/abc1234))
# 
# ### 🐛 Bug Fixes
# - prevent duplicate order submission ([def5678](https://github.com/kenyonexpress/web/commit/def5678))
```

### 2. Review and Prepare

```bash
# Ensure all tests pass
pnpm type-check
pnpm lint
pnpm test
pnpm build

# Verify deployment is ready
git status  # Should be clean
```

### 3. Create GitHub Release

```bash
# Create release with semantic versioning
pnpm release:create minor

# This will:
# 1. Parse commits since last tag
# 2. Generate changelog with emojis
# 3. Create git tag (v1.3.0)
# 4. Push tag to remote
# 5. Create GitHub release with notes
# 6. Save version to .last-release

# Output:
# 📝 Release Notes for 1.3.0:
# ## [1.3.0](https://github.com/kenyonexpress/web/releases/tag/1.3.0) (2026-10-17)
# ...
# 🚀 Creating GitHub release...
# ✅ Release created: https://github.com/kenyonexpress/web/releases/tag/v1.3.0
# 📦 Version 1.3.0 released successfully
```

### 4. Deploy to Staging

```bash
# Push to staging branch (CI/CD triggers build)
git push origin main:staging

# Wait for Vercel build to complete
# Check: https://vercel.com/dashboard/[project]
```

### 5. Test Staging

```bash
# Run smoke tests against staging
SMOKE_TEST_URL="https://staging-abc123.vercel.app" pnpm release:smoke

# Output:
# 🔥 Running smoke tests against staging-abc123.vercel.app...
# 
# ✅ Homepage loads
# ✅ API health check
# ✅ Product page loads
# ✅ Search functionality
# ✅ Cart button visible
# ✅ API health endpoint
# ✅ Sitemap exists
# ✅ Robots.txt exists
# ✅ No console errors
# ✅ Page responsive
# 
# 📊 Results: 10 passed, 0 failed
```

### 6. Promote to Production

```bash
# Get latest staging deployment ID (or use explicit ID)
VERCEL_TOKEN=$VERCEL_TOKEN VERCEL_ORG_ID=$VERCEL_ORG_ID \
  VERCEL_PROJECT_ID=$VERCEL_PROJECT_ID \
  pnpm release:promote

# Script will:
# 1. Fetch latest READY deployment
# 2. Promote to production
# 3. Run smoke tests on production
# 4. Record promotion in .last-promotion

# Output:
# 📋 Fetching latest deployment...
# ✅ Latest deployment: dpl_ABC123DEF456
# 📍 Deployment URL: example.com
# 🚀 Promoting deployment to production...
# ✅ Deployment promoted successfully!
# 📝 Alias: example.com
# 
# 🔥 Running smoke tests against example.com...
# ✅ Homepage loads
# ✅ API health check
# ✅ Sitemap accessible
# ✅ Robots.txt accessible
# 📊 Smoke tests: 4 passed, 0 failed
# 
# ✅ Promotion complete!
```

### 7. Verify Production

```bash
# Check promotion record
cat .last-promotion

# Output:
# {
#   "deploymentId": "dpl_ABC123DEF456",
#   "url": "example.com",
#   "timestamp": "2026-10-17T18:45:23.123Z",
#   "smokeTestsPassed": true
# }

# Monitor in production
# - Check error logs in Sentry
# - Watch metrics in analytics dashboard
# - Monitor support channels
```

## Incident Response: Emergency Rollback

If production has critical issues:

```bash
# Quick rollback (skip tests for speed)
VERCEL_TOKEN=$VERCEL_TOKEN VERCEL_ORG_ID=$VERCEL_ORG_ID \
  VERCEL_PROJECT_ID=$VERCEL_PROJECT_ID \
  pnpm release:rollback --skip-tests

# Script will:
# 1. List available deployments
# 2. Select second-most-recent (previous version)
# 3. Promote previous deployment
# 4. Record rollback in .last-rollback

# Then verify:
pnpm release:smoke
```

## Files Generated During Release

### `.last-release`
```json
"1.3.0"
```
Records the version of the last created release.

### `.last-promotion`
```json
{
  "deploymentId": "dpl_ABC123DEF456",
  "url": "example.com",
  "timestamp": "2026-10-17T18:45:23.123Z",
  "previousVersion": "1.2.4",
  "smokeTestsPassed": true
}
```
Records promotion details and audit trail.

### `.last-rollback`
```json
{
  "fromDeploymentId": "dpl_ABC123DEF456",
  "toDeploymentId": "dpl_XYZ789LMN012",
  "toUrl": "example.com",
  "timestamp": "2026-10-17T19:30:45.456Z"
}
```
Records rollback details for incident tracking.

## CI/CD Integration Example

### GitHub Actions Workflow

```yaml
name: Release & Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v2
        with:
          version: 11.1.2

      - uses: actions/setup-node@v3
        with:
          node-version: 22
          cache: 'pnpm'

      - name: Build & Test
        run: |
          pnpm install
          pnpm type-check
          pnpm lint
          pnpm test
          pnpm build

      - name: Create Release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: pnpm release:create minor

      - name: Promote to Production
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: pnpm release:promote

      - name: Smoke Tests
        run: pnpm release:smoke
```

## Troubleshooting

### "No commits since last tag"
You need new commits to create a new release. Either:
- Create a commit: `git commit --allow-empty -m "chore: trigger release"`
- Use explicit version: `pnpm release:create 1.2.5`

### "Failed to fetch latest deployment"
Check:
- `VERCEL_TOKEN` is valid and not expired
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are correct
- Deployment was built successfully in Vercel

### Smoke tests fail on production
1. Check application error logs
2. Verify database is responsive
3. Check external service status (Supabase, Cardcom, etc.)
4. If critical: rollback immediately

## Best Practices

1. **Test before release** — Always run full test suite
2. **Review changelog** — Check release notes before creating
3. **Monitor after deploy** — Watch error logs for 30 minutes
4. **Keep runbook updated** — Document any special steps
5. **Have rollback ready** — Know the previous deployment ID
6. **Commit early and often** — Small commits = cleaner changelog
7. **Use conventional commits** — Ensures changelog is meaningful

## References

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Vercel API Docs](https://vercel.com/docs/api)
- [GitHub Releases API](https://docs.github.com/en/rest/releases)
