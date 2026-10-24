import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Pins the Sentry build configuration to prevent silent source map upload
 * failures.
 *
 * MEASURED 05.10.2026: production had SENTRY_AUTH_TOKEN but not SENTRY_ORG or
 * SENTRY_PROJECT, so withSentryConfig({ org: process.env.SENTRY_ORG, project:
 * process.env.SENTRY_PROJECT, ... }) resolved to withSentryConfig({ org:
 * undefined, project: undefined, ... }), which skipped the upload silently
 * with "Warning: No org provided" in the build log - the only place that said
 * so. Every production stack trace from 21.08 to 05.10 stayed minified.
 *
 * The fix is hardcoded defaults with env var overrides:
 *   org: process.env.SENTRY_ORG ?? 'kenyonexpress'
 *
 * This test pins those defaults in place so a refactor cannot silently revert
 * to the env-only form, which would look correct locally (where .env.local sets
 * the vars) and fail only on a deploy that happened to be missing them.
 */

describe('Sentry build configuration', () => {
  const configPath = resolve(process.cwd(), 'next.config.ts')
  const configSource = readFileSync(configPath, 'utf8')

  it('has hardcoded org default to prevent "No org provided" silent skip', () => {
    // The trap: `org: process.env.SENTRY_ORG` with no fallback is undefined when
    // the env var is unset, and the plugin silently skips the upload rather than
    // erroring. This regex requires the fallback to be present.
    expect(configSource).toMatch(/org:\s*process\.env\.SENTRY_ORG\s*\?\?\s*['"]kenyonexpress['"]/)
  })

  it('has hardcoded project default to prevent silent upload skip', () => {
    expect(configSource).toMatch(
      /project:\s*process\.env\.SENTRY_PROJECT\s*\?\?\s*['"]kenyonexpress-web['"]/,
    )
  })

  it('sets sentryUrl to EU organization (de.sentry.io), not US', () => {
    // US host (https://sentry.io) returns 404 on this org like a bad token; the
    // actual host is the EU one. Hardcoded rather than env so a missing
    // SENTRY_URL does not silently default to the wrong continent.
    expect(configSource).toMatch(/sentryUrl:\s*['"]https:\/\/de\.sentry\.io['"]/)
  })

  it('has errorHandler so a failed upload warns instead of failing the build', () => {
    // A token issue (expired, wrong scope, wrong org) should not block
    // deployment. The build log warns, the deploy succeeds without maps, and an
    // investigation fixes the token rather than racing a broken build.
    expect(configSource).toMatch(/errorHandler:\s*\([^)]*\)\s*=>\s*\{/)
    expect(configSource).toContain('Source map upload failed')
  })

  it('configures deleteSourcemapsAfterUpload to remove .map files from deployment', () => {
    // Uploaded maps let Sentry unmangle stack traces; publicly served maps hand
    // anyone the unminified checkout source. Upload then delete is the only
    // config that gets both.
    expect(configSource).toMatch(
      /deleteSourcemapsAfterUpload:\s*process\.env\.SENTRY_KEEP_SOURCEMAPS\s*!==\s*['"]1['"]/,
    )
  })
})
