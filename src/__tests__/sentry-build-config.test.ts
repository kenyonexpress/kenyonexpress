import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Sentry wiring that only a production build can prove, pinned at the
 * source level so it cannot quietly regress.
 *
 * `next.config.ts` cannot be imported here (it pulls the next-intl and MDX
 * plugins, which want a Next runtime), so this reads the text, the same shape
 * as `observability/log-coverage.test.ts`.
 *
 * THE UPLOAD. Measured on the 2026-10-05 production build log: "No org
 * provided. Will not upload source maps." The auth token was in Vercel and the
 * org and project were not, so every stack trace stayed minified for the whole
 * life of the project with a green build. The slugs now default in the config;
 * this fails the day someone "cleans up" the defaults back to bare env reads.
 *
 * THE RELEASE. All three runtimes must report the commit sha, or the uploaded
 * maps are attached to a release no event names and are never applied.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('source-map upload target', () => {
  const config = read('next.config.ts')

  it('defaults the org and project slugs so the Vercel build has somewhere to upload', () => {
    expect(config).toMatch(/org: process\.env\.SENTRY_ORG \?\? 'kenyonexpress'/)
    expect(config).toMatch(/project: process\.env\.SENTRY_PROJECT \?\? 'kenyonexpress-web'/)
  })

  it('points at the EU host, where this org actually resolves', () => {
    expect(config).toMatch(/sentryUrl: process\.env\.SENTRY_URL \?\? 'https:\/\/de\.sentry\.io'/)
  })

  it('turns an upload failure into a warning rather than a failed deploy', () => {
    expect(config).toMatch(/errorHandler\(error\)/)
  })

  it('still deletes the maps from the served output by default', () => {
    expect(config).toMatch(
      /deleteSourcemapsAfterUpload: process\.env\.SENTRY_KEEP_SOURCEMAPS !== '1'/,
    )
  })
})

describe('release is the git sha in every runtime', () => {
  it('server and edge read SENTRY_RELEASE then VERCEL_GIT_COMMIT_SHA', () => {
    for (const path of ['sentry.server.config.ts', 'sentry.edge.config.ts']) {
      expect(read(path)).toMatch(
        /release: process\.env\.SENTRY_RELEASE \?\? process\.env\.VERCEL_GIT_COMMIT_SHA/,
      )
    }
  })

  it('the browser reads the NEXT_PUBLIC_ pair, the only form that is inlined', () => {
    expect(read('instrumentation-client.ts')).toMatch(
      /release: process\.env\.NEXT_PUBLIC_SENTRY_RELEASE \?\? process\.env\.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA/,
    )
  })

  it('instrumentation.ts loads both server-side configs', () => {
    const inst = read('src/instrumentation.ts')
    expect(inst).toContain("import('../sentry.server.config')")
    expect(inst).toContain("import('../sentry.edge.config')")
  })
})
