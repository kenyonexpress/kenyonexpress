import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The Sentry wiring that only a production build can prove, pinned at the
 * source level so it cannot quietly regress.
 *
 * `next.config.ts` cannot be imported here (it pulls the next-intl and MDX
 * plugins, which want a Next runtime), so this reads the text, the same shape
 * as `observability/log-coverage.test.ts` and `sentry-sourcemaps.test.ts`.
 *
 * THE UPLOAD. Measured on the 2026-10-05 production build log: "No org
 * provided. Will not upload source maps." The auth token was in Vercel and the
 * org and project were not, so every stack trace stayed minified for the whole
 * life of the project with a green build. The slugs now default in the config;
 * this fails the day someone "cleans up" the defaults back to bare env reads.
 *
 * THE RELEASE. All three runtimes and the upload must name the same commit
 * sha, or the maps are filed under a release no event names and are never
 * applied.
 *
 * THE ENVIRONMENT AND THE SCRUB. Every runtime resolves its environment
 * through the one resolver (so a laptop is `local`, not `production`) and
 * hands `beforeSend` to the one scrubber (so the three cannot drift apart
 * again, which they had).
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const RUNTIMES = ['sentry.server.config.ts', 'sentry.edge.config.ts', 'instrumentation-client.ts']

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

  it('files the maps under the release the runtimes report', () => {
    expect(config).toMatch(
      /release: \{ name: process\.env\.SENTRY_RELEASE \?\? process\.env\.VERCEL_GIT_COMMIT_SHA \}/,
    )
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

describe('environment and scrub are shared by every runtime', () => {
  it('each runtime resolves its environment through sentryEnvironment, never NODE_ENV', () => {
    for (const path of RUNTIMES) {
      const source = read(path)
      expect(source, path).toMatch(/environment: sentryEnvironment\(\{/)
      expect(source, path).not.toMatch(/process\.env\.NODE_ENV/)
    }
  })

  it('the browser passes the NEXT_PUBLIC_ literals, the only form that is inlined', () => {
    const client = read('instrumentation-client.ts')
    expect(client).toContain('VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV')
    expect(client).toContain('SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT')
  })

  it('each runtime hands beforeSend to scrubSentryEvent and carries no scrub of its own', () => {
    for (const path of RUNTIMES) {
      const source = read(path)
      expect(source, path).toMatch(/beforeSend: scrubSentryEvent/)
      expect(source, path).not.toMatch(/beforeSend\(event\)/)
      expect(source, path).not.toContain('.replace(/\\/redeem')
      expect(source, path).toMatch(/sendDefaultPii: false/)
    }
  })

  it('onRequestError redacts the path with the same rule', () => {
    const inst = read('src/instrumentation.ts')
    expect(inst).toContain("import('@/lib/observability/sentry-scrub')")
    expect(inst).toMatch(/const path = redactUrl\(rawPath\)/)
  })
})
