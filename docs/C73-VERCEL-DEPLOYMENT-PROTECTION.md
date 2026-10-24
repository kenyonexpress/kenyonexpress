# C73: Vercel Preview Deployment Protection Password

**Status:** ✅ COMPLETE  
**Date:** 2026-10-25  
**Project:** kenyonexpress (prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP)  
**Team:** kenyonexpress-projects (team_TUMTPVDP8218QHwedSjmgJWl)

## Summary

Configured password protection for preview deployments on Vercel to secure all preview URLs from unauthorized access. This ensures that preview deployments are only accessible to team members and authorized users.

## Configuration Details

### 1. Password Protection

**Deployment Type:** `preview`  
**Protection Level:** Password-based authentication required for all preview deployments  
**Password:** `1INDobK37FEZbBM8HRom00Ez` (24 characters, URL-safe)

### 2. Automation Bypass Secret

**Purpose:** Allow CI/CD pipelines and automated tools to access preview deployments without manual password entry  
**Secret:** `e7e91a84e6193bf399ad417c8fafeb15` (32 characters, hex)  
**Environment Variable:** Automatically set as `VERCEL_AUTOMATION_BYPASS_SECRET`  
**Note:** "CI/CD automation bypass for preview deployments"  
**Created At:** 2026-10-25 02:30:16 UTC

## How It Works

### For Human Visitors

When accessing a preview deployment URL (e.g., `kenyonexpress-git-feature-branch-xyz.vercel.app`):

1. Vercel presents a password prompt
2. Enter the deployment protection password: `1INDobK37FEZbBM8HRom00Ez`
3. Access is granted for the session

### For Automated Tools (CI/CD, Tests, Monitoring)

Automated requests can bypass the password prompt using the automation bypass secret:

**Method 1: HTTP Header**
```bash
curl -H "x-vercel-protection-bypass: e7e91a84e6193bf399ad417c8fafeb15" \
  https://kenyonexpress-git-feature-xyz.vercel.app
```

**Method 2: Query Parameter**
```bash
curl "https://kenyonexpress-git-feature-xyz.vercel.app?x-vercel-protection-bypass=e7e91a84e6193bf399ad417c8fafeb15"
```

**Method 3: Environment Variable (Automatic)**

The automation bypass secret is automatically available as `VERCEL_AUTOMATION_BYPASS_SECRET` in all deployments with `isEnvVar: true`. Vercel's own CI and deployment processes use this automatically.

## Verification

### Check Current Settings

```bash
# Via CLI
vercel project inspect kenyonexpress --scope kenyonexpress-projects

# Via API
vercel api /v9/projects/prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP --method GET
```

### List Protection Bypass Secrets

```bash
vercel api /v1/projects/prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP/protection-bypass --method GET
```

## Security Considerations

1. **Password Storage**: The deployment protection password is stored securely by Vercel and not returned in API responses
2. **Automation Secret**: The bypass secret is sensitive and should be treated as a credential
3. **Scope**: Protection only applies to preview deployments; production deployments are not affected
4. **Rotation**: Both the password and automation bypass secret can be regenerated if compromised

## Regenerating Secrets

### Regenerate Password

```bash
# Generate new password
NEW_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(18).toString('base64').replace(/[+/=]/g, (m) => ({'+': '-', '/': '_', '=': ''}[m])))")

# Update via API
echo "{\"passwordProtection\":{\"deploymentType\":\"preview\",\"password\":\"${NEW_PASSWORD}\"}}" | \
  vercel api /v9/projects/prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP --method PATCH --input -
```

### Regenerate Automation Bypass

```bash
# Revoke old secret and generate new one
OLD_SECRET="e7e91a84e6193bf399ad417c8fafeb15"
NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

echo "{\"revoke\":{\"secret\":\"${OLD_SECRET}\",\"regenerate\":true},\"generate\":{\"secret\":\"${NEW_SECRET}\",\"note\":\"CI/CD automation bypass for preview deployments\"}}" | \
  vercel api /v1/projects/prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP/protection-bypass --method PATCH --input -
```

## Integration Examples

### Playwright E2E Tests

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    baseURL: process.env.PREVIEW_URL,
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET || 'e7e91a84e6193bf399ad417c8fafeb15'
    }
  }
});
```

### GitHub Actions

```yaml
# .github/workflows/preview-test.yml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: Test preview deployment
        env:
          VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
        run: |
          curl -H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}" \
            "${{ steps.deploy.outputs.preview-url }}"
```

### Lighthouse CI

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: process.env.PREVIEW_URL,
      settings: {
        extraHeaders: JSON.stringify({
          'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET || 'e7e91a84e6193bf399ad417c8fafeb15'
        })
      }
    }
  }
};
```

## API Reference

### Update Password Protection

**Endpoint:** `PATCH /v9/projects/{projectId}`

**Request Body:**
```json
{
  "passwordProtection": {
    "deploymentType": "preview" | "all" | "prod_deployment_urls_and_all_previews" | "all_except_custom_domains",
    "password": "string" | null
  }
}
```

### Manage Automation Bypass

**Endpoint:** `PATCH /v1/projects/{projectId}/protection-bypass`

**Generate New Secret:**
```json
{
  "generate": {
    "secret": "32-char-hex-string",
    "note": "Description"
  }
}
```

**Revoke and Regenerate:**
```json
{
  "revoke": {
    "secret": "old-secret",
    "regenerate": true
  },
  "generate": {
    "secret": "new-secret",
    "note": "Description"
  }
}
```

**Update Existing:**
```json
{
  "update": {
    "secret": "existing-secret",
    "note": "New description",
    "isEnvVar": true | false
  }
}
```

## Related Documentation

- [Vercel Deployment Protection Docs](https://vercel.com/docs/security/deployment-protection)
- [Vercel API Reference](https://vercel.com/docs/rest-api)
- Project Settings: `vercel.json` (framework, regions, build commands)

## Troubleshooting

### Password Prompt Still Appears for Automated Requests

1. Verify the bypass secret is correct
2. Check the header/query parameter is properly set
3. Ensure the secret hasn't been revoked
4. Confirm `isEnvVar: true` is set for the bypass

### Need to Disable Protection Temporarily

```bash
# Set password to null to disable
echo '{"passwordProtection":{"deploymentType":"preview","password":null}}' | \
  vercel api /v9/projects/prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP --method PATCH --input -
```

### Check Protection Status

```bash
vercel api /v9/projects/prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP | \
  grep -A 3 '"passwordProtection"'
```

## Credentials Summary

**⚠️ SENSITIVE - Store securely and do not commit to version control**

| Purpose | Type | Value | Location |
|---------|------|-------|----------|
| Preview Password | Deployment Protection | `1INDobK37FEZbBM8HRom00Ez` | Vercel Project Settings |
| Automation Bypass | API Secret | `e7e91a84e6193bf399ad417c8fafeb15` | Vercel Environment Variable |

**Storage Recommendations:**
- Add to password manager (1Password, LastPass, etc.)
- Store in CI/CD secrets (GitHub Secrets, etc.)
- Document in team runbook (access-controlled)
- Never commit to `.env.local` or other tracked files
