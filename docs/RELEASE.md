# Release Engineering Guide

This guide covers the complete release engineering pipeline for KenyonExpress, including semantic versioning, conventional commits, GitHub releases, and Vercel promotion/rollback.

## Overview

The release pipeline consists of:

1. **Conventional Commits** — All commits follow the pattern `type(scope): message`
2. **Changelog Generation** — Automatic parsing of conventional commits into structured release notes
3. **GitHub Releases** — Automated creation of GitHub releases with semantic versioning
4. **Vercel Promotions** — Promoting staging builds to production with smoke testing
5. **Rollback Support** — Quick rollback to previous production deployments

## Commit Convention

All commits must follow the conventional commit format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

- **feat**: A new feature
- **fix**: A bug fix
- **perf**: Performance improvement
- **docs**: Documentation changes
- **refactor**: Code refactoring (no feature change)
- **test**: Adding or updating tests
- **ci**: CI/CD configuration changes
- **chore**: Build system, dependencies, etc.

### Examples

```
feat(cart): add discount code support
fix(checkout): prevent duplicate order submission
perf(images): optimize product gallery loading
docs(api): update authentication endpoints
refactor(utils): simplify money calculation logic
test(e2e): add full purchase flow test
ci(github): configure release workflow
chore(deps): upgrade next to v16
```

## Scripts

### 1. Generate Changelog

View the changelog that will be generated for the next release:

```bash
pnpm release:changelog [major|minor|patch]
```

**Arguments:**
- `major` - Semantic major version bump (default: patch)
- `minor` - Semantic minor version bump
- `patch` - Semantic patch version bump

**Output:**
Displays the release notes in Markdown format with commits grouped by type.

### 2. Create Release

Create a GitHub release with changelog and tag:

```bash
pnpm release:create [version] [--draft] [--prerelease]
```

**Arguments:**
- `version` - Explicit version (e.g., `1.2.3`) or version type (`major`, `minor`, `patch`)
- `--draft` - Create as draft release (not visible to public)
- `--prerelease` - Mark as prerelease

**Environment Variables:**
- `GITHUB_TOKEN` — GitHub personal access token (required)

**Process:**
1. Parses all commits since last tag
2. Groups commits by type (feat, fix, perf, etc.)
3. Generates release notes in Markdown
4. Creates git tag locally
5. Pushes tag to remote
6. Creates GitHub release with notes
7. Saves version to `.last-release` file

**Example:**
```bash
GITHUB_TOKEN=ghp_xxx pnpm release:create minor
```

### 3. Promote to Production

Promote a Vercel deployment to production:

```bash
pnpm release:promote [deploymentId] [--skip-tests]
```

**Arguments:**
- `deploymentId` - Optional deployment ID (fetches latest READY if not provided)
- `--skip-tests` - Skip smoke tests before promotion

**Environment Variables:**
- `VERCEL_TOKEN` — Vercel API token (required)
- `VERCEL_ORG_ID` — Vercel organization/team ID (required)
- `VERCEL_PROJECT_ID` — Vercel project ID (required)

**Smoke Tests:**
The promote script runs these tests:
- Homepage loads (HTTP 200)
- API health check (HTTP 200 or 401)
- Sitemap accessible
- Robots.txt accessible

**Failure Behavior:**
If any smoke test fails, the promotion is aborted and no changes are made to production.

**Artifacts:**
- `.last-promotion` — Records deployment info, timestamp, and previous version

**Example:**
```bash
VERCEL_TOKEN=xxx VERCEL_ORG_ID=yyy VERCEL_PROJECT_ID=zzz pnpm release:promote
```

### 4. Rollback to Previous Deployment

Rollback production to the previous stable deployment:

```bash
pnpm release:rollback [deploymentId] [--skip-tests]
```

**Arguments:**
- `deploymentId` - Optional deployment ID (uses second-most-recent if not provided)
- `--skip-tests` - Skip smoke tests before rollback

**Environment Variables:**
- `VERCEL_TOKEN` — Vercel API token (required)
- `VERCEL_ORG_ID` — Vercel organization/team ID (required)
- `VERCEL_PROJECT_ID` — Vercel project ID (required)

**Smoke Tests:**
The rollback script runs:
- Homepage loads
- API health check

**Failure Behavior:**
If smoke tests fail on the rollback target, the rollback is aborted.

**Artifacts:**
- `.last-rollback` — Records source and target deployment info

**Example:**
```bash
pnpm release:rollback --skip-tests
```

### 5. Run Smoke Tests

Run comprehensive smoke tests against a live environment:

```bash
pnpm release:smoke
```

**Environment Variables:**
- `SMOKE_TEST_URL` — Base URL for testing (default: http://localhost:3000)

**Tests Include:**
- Homepage loads and renders
- Navigation works
- Product pages load
- Search input visible
- Cart button visible
- API health endpoint
- Sitemap and robots.txt exist
- No console errors
- Responsive design (mobile viewport)

**Exit Code:**
- 0 — All tests passed
- 1 — One or more tests failed

**Example:**
```bash
SMOKE_TEST_URL=https://staging.example.com pnpm release:smoke
```

## Release Workflow

### Standard Release Process

1. **Develop features** — Create features with conventional commits
   ```bash
   git commit -m "feat(search): add filters to product search"
   ```

2. **Review changes** — View what will be in the release
   ```bash
   pnpm release:changelog minor
   ```

3. **Verify build** — Ensure tests pass and build is clean
   ```bash
   pnpm type-check && pnpm lint && pnpm test && pnpm build
   ```

4. **Create release** — Tag and publish GitHub release
   ```bash
   GITHUB_TOKEN=xxx pnpm release:create minor
   ```

5. **Deploy to staging** — Push to staging branch (automated via CI/CD)
   ```bash
   git push origin feature/something main:staging
   ```

6. **Run smoke tests** — Test staging environment
   ```bash
   SMOKE_TEST_URL=https://staging.example.com pnpm release:smoke
   ```

7. **Promote to production** — Promote Vercel deployment
   ```bash
   VERCEL_TOKEN=xxx pnpm release:promote --skip-tests
   ```

### Emergency Rollback

If production has critical issues:

```bash
# Rollback immediately (skip tests for speed)
VERCEL_TOKEN=xxx pnpm release:rollback --skip-tests

# Run tests on restored version
pnpm release:smoke
```

## Semantic Versioning

Follow semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR** — Breaking changes (feat with BREAKING CHANGE in footer, or major incompatibility)
- **MINOR** — New features (feat commits)
- **PATCH** — Bug fixes (fix commits)

Example progression:
```
0.1.0  (initial)
0.2.0  (add new features)
0.2.1  (fix bugs)
1.0.0  (major milestone)
1.0.1  (patch)
1.1.0  (new features)
2.0.0  (breaking changes)
```

## Environment Setup

### Required Environment Variables

For release creation:
```bash
export GITHUB_TOKEN="ghp_..."  # GitHub personal access token
```

For promotions and rollbacks:
```bash
export VERCEL_TOKEN="..."      # Vercel API token
export VERCEL_ORG_ID="..."     # Vercel team/org ID
export VERCEL_PROJECT_ID="..." # Vercel project ID
```

For smoke tests:
```bash
export SMOKE_TEST_URL="https://example.com"  # Optional
```

### Getting Vercel Credentials

1. **VERCEL_TOKEN**: Create at https://vercel.com/account/tokens
   - Token should have scope for the project
   - Never commit this token

2. **VERCEL_ORG_ID**: Found in URL or team settings
   - Dashboard URL: https://vercel.com/dashboard (personal)
   - Team URL: https://vercel.com/team/[VERCEL_ORG_ID]

3. **VERCEL_PROJECT_ID**: Found in project settings
   - URL: https://vercel.com/dashboard/[project]/settings
   - Under "General" section

### Getting GitHub Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (full control of private repositories)
4. Save the token securely

## Monitoring and Debugging

### Check Last Release
```bash
cat .last-release
```

### Check Last Promotion
```bash
cat .last-promotion
```

### Check Last Rollback
```bash
cat .last-rollback
```

### View Vercel Deployments
```bash
curl -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v6/deployments?teamId=$VERCEL_ORG_ID&limit=10" | jq
```

### View GitHub Releases
```bash
gh release list --repo kenyonexpress/web
```

## CI/CD Integration

The scripts are designed to integrate with CI/CD systems:

### GitHub Actions Example

```yaml
name: Release

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Generate changelog
        run: node scripts/conventional-changelog.mjs minor

      - name: Create release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: node scripts/create-release.mjs minor

      - name: Promote to production
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
        run: node scripts/promote.mjs
```

## Troubleshooting

### "No commits since last tag"
- This means the last tag includes all current commits
- Either create new commits or use explicit version: `pnpm release:create 1.2.3`

### "No ready deployments found"
- Check that Vercel deployment completed successfully
- Verify VERCEL_PROJECT_ID is correct
- Check deployment status: `curl -H "Authorization: Bearer $VERCEL_TOKEN" https://api.vercel.com/v13/deployments/$DEPLOYMENT_ID`

### Smoke tests fail on production
- Check application logs for errors
- Review recent commits and rollback if necessary
- Use `pnpm release:smoke` to get detailed error messages

### GitHub release not created
- Verify GITHUB_TOKEN has repo scope
- Check that tag was created: `git tag -l`
- Manually create release: `gh release create v1.0.0 -F CHANGELOG.md`

## Best Practices

1. **Use conventional commits consistently** — Tools depend on this format
2. **Test before releasing** — Always run full test suite before release
3. **Review changes** — Check changelog before confirming release
4. **Monitor after deploy** — Watch error logs and metrics after promotion
5. **Have rollback ready** — Know the previous deployment ID before promoting
6. **Document breaking changes** — Use BREAKING CHANGE footer in commits
7. **Keep deployments stable** — Smoke tests catch most issues before production

## Additional Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Semantic Versioning](https://semver.org/)
- [GitHub Releases API](https://docs.github.com/en/rest/releases)
- [Vercel API Documentation](https://vercel.com/docs/api)
