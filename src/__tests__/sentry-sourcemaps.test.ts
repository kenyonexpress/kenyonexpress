import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The source-map contract, read from the files that make it up.
 *
 * Every piece of the Sentry release pipeline fails silently when it is
 * wrong: an upload that never happens leaves stack traces minified with
 * nothing saying why, a client that reports no release gets its maps ignored,
 * and a tunnel the proxy authenticates drops every report from a page that
 * is already broken. None of those fail a build, a type-check, or a runtime
 * test, so the wiring is asserted here as text. `scripts/sentry-verify.mjs`
 * covers the half that needs a network.
 */

const root = resolve(__dirname, '../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('source maps reach Sentry and nowhere else', () => {
  const config = read('next.config.ts')

  it('wraps the config with withSentryConfig and names org, project and token from the env', () => {
    expect(config).toMatch(/export default withSentryConfig\(/)
    expect(config).toContain('org: process.env.SENTRY_ORG')
    expect(config).toContain('project: process.env.SENTRY_PROJECT')
    expect(config).toContain('authToken: process.env.SENTRY_AUTH_TOKEN')
  })

  it('deletes the maps from the deployed output unless the build-time escape hatch is set', () => {
    expect(config).toMatch(
      /deleteSourcemapsAfterUpload:\s*process\.env\.SENTRY_KEEP_SOURCEMAPS !== '1'/,
    )
  })

  it('tunnels browser reports through /monitoring, and the proxy forwards that path before auth', () => {
    expect(config).toContain("tunnelRoute: '/monitoring'")
    const proxy = read('src/proxy.ts')
    const tunnel = proxy.indexOf("pathname.startsWith('/monitoring')")
    // The awaited call, not the comment above it that names the same expression.
    const session = proxy.indexOf('await supabase.auth.getUser()')
    expect(tunnel).toBeGreaterThan(-1)
    expect(session).toBeGreaterThan(tunnel)
  })

  it('does not shake the span code out of a build that samples traces', () => {
    // `__SENTRY_TRACING__: false` deletes the tracing code at build time; the
    // three configs then read 0.1 and emit nothing.
    expect(config).not.toMatch(/__SENTRY_TRACING__\s*:/)
  })
})

describe('every runtime reports the release the maps were uploaded under', () => {
  it('server and edge use SENTRY_RELEASE with the Vercel commit as fallback', () => {
    for (const path of ['sentry.server.config.ts', 'sentry.edge.config.ts']) {
      expect(read(path)).toContain(
        'release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA',
      )
    }
  })

  it('the browser uses the NEXT_PUBLIC_ pair, since the bare names are not inlined', () => {
    expect(read('instrumentation-client.ts')).toContain(
      'release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA',
    )
  })

  it('instrumentation loads both server-side configs on their runtimes', () => {
    const instrumentation = read('src/instrumentation.ts')
    expect(instrumentation).toContain("process.env.NEXT_RUNTIME === 'nodejs'")
    expect(instrumentation).toContain("import('../sentry.server.config')")
    expect(instrumentation).toContain("process.env.NEXT_RUNTIME === 'edge'")
    expect(instrumentation).toContain("import('../sentry.edge.config')")
    expect(instrumentation).toMatch(/export const onRequestError/)
  })
})

describe('the error pages exist where Next looks for them', () => {
  it.each(['src/app/not-found.tsx', 'src/app/error.tsx', 'src/app/global-error.tsx'])(
    '%s',
    (path) => {
      expect(read(path).length).toBeGreaterThan(0)
    },
  )

  it('both boundaries are client components that report to Sentry', () => {
    for (const path of ['src/app/error.tsx', 'src/app/global-error.tsx']) {
      const source = read(path)
      expect(source.startsWith("'use client'")).toBe(true)
      expect(source).toContain('Sentry.captureException(error)')
    }
  })
})
