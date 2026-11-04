import { describe, expect, it } from 'vitest'
import nextConfig from '../../next.config'

/**
 * S24. The headers every route ships, read from the real next.config.ts and
 * not from a copy of it. frame-policy.test.ts holds the CSP directive by
 * directive; this holds the parts no other test does: HSTS on every entry,
 * and a CSP on every entry, because headers() returns one array per path
 * group and a new group added without the helper would ship neither.
 */

type Entry = { source: string; headers: { key: string; value: string }[] }

async function entries(): Promise<Entry[]> {
  const headers = nextConfig.headers
  if (!headers) throw new Error('next.config.ts exports no headers()')
  return (await headers()) as Entry[]
}

function header(entry: Entry, key: string): string | undefined {
  return entry.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value
}

// Entries that only add caching for static assets, which inherit the page
// policy from the catch-all entry and carry no document.
function isDocumentEntry(entry: Entry): boolean {
  return entry.headers.some(
    (h) => h.key === 'Content-Security-Policy' || h.key === 'Strict-Transport-Security',
  )
}

describe('security headers (next.config.ts)', () => {
  it('has a catch-all entry carrying both CSP and HSTS', async () => {
    const all = await entries()
    // The catch-all is a negative lookahead that excludes the path-dependent
    // routes, which get their own entries with the relaxed framing policy.
    const catchAll = all.find((e) => e.source.startsWith('/((?!') && e.source.endsWith('.*)'))
    expect(catchAll, all.map((e) => e.source).join(', ')).toBeDefined()
    expect(header(catchAll as Entry, 'Content-Security-Policy')).toBeTruthy()
    expect(header(catchAll as Entry, 'Strict-Transport-Security')).toBeTruthy()
  })

  it('every policy entry carries HSTS: two years, subdomains, preload', async () => {
    const docs = (await entries()).filter(isDocumentEntry)
    expect(docs.length).toBeGreaterThan(0)
    for (const entry of docs) {
      const hsts = header(entry, 'Strict-Transport-Security') ?? ''
      const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0)
      expect(maxAge, entry.source).toBeGreaterThanOrEqual(31536000)
      expect(hsts, entry.source).toContain('includeSubDomains')
      expect(hsts, entry.source).toContain('preload')
    }
  })

  it('every policy entry carries a CSP that denies plugins and pins base-uri', async () => {
    for (const entry of (await entries()).filter(isDocumentEntry)) {
      const csp = header(entry, 'Content-Security-Policy') ?? ''
      expect(csp, entry.source).toContain("default-src 'self'")
      expect(csp, entry.source).toContain("object-src 'none'")
      expect(csp, entry.source).toContain("base-uri 'self'")
      expect(csp, entry.source).toMatch(/frame-ancestors /)
    }
  })

  it('every policy entry carries nosniff and a frame option', async () => {
    for (const entry of (await entries()).filter(isDocumentEntry)) {
      expect(header(entry, 'X-Content-Type-Options'), entry.source).toBe('nosniff')
      expect(['DENY', 'SAMEORIGIN'], entry.source).toContain(header(entry, 'X-Frame-Options'))
    }
  })
})
